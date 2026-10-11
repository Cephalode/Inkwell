// Coursera REST client — CAUTH cookie auth against www.coursera.org.
// Endpoints validated 2026-08-25: memberships.v1?q=me, courses.v1?ids=, onDemandCourseMaterials.v2.

export const BASE = 'https://www.coursera.org';

export interface CourseraCourse { id: string; slug: string; name: string; status: 'completed' | 'enrolled' | 'unenrolled' }
export interface CourseraItem { id: string; name: string; slug: string; type: string; locked: boolean; url: string }
export interface CourseraLesson { id: string; name: string; slug: string; items: CourseraItem[] }
export interface CourseraModule { id: string; name: string; slug: string; lessons: CourseraLesson[] }

// typeName → /learn/<slug>/<segment>/<id>/<itemSlug>; all segments verified 200
const TYPE_SEGMENT: Record<string, string> = {
  lecture: 'lecture',
  supplement: 'supplement',
  programming: 'programming',
  gradedProgramming: 'programming',
  staffGraded: 'assignment',
  peer: 'peer',
  discussionPrompt: 'discussion',
  exam: 'exam',
  quiz: 'exam',
};

/** Minimal shapes of the Coursera JSON payloads we consume. */
interface Membership { courseId: string; grade?: { record?: string } }
interface CourseInfo { id: string; slug: string; name: string }
interface ElementsBody<T> { elements: T[] }
interface DegreeStateEntry { course: { id: string } }
interface GqlBatchBody {
  data?: {
    DegreeHome?: {
      degreeLearnerCourseStatesByUserIdAndDegreeId?: {
        passed?: DegreeStateEntry[];
        inProgress?: DegreeStateEntry[];
        notStarted?: DegreeStateEntry[];
      };
    };
  };
}
interface SupplementBody { linked?: { 'openCourseAssets.v1'?: { definition?: { value?: string }; itemId?: string }[] } }
interface MaterialItem { id: string; name: string; slug: string; contentSummary?: { typeName?: string }; isLocked?: boolean }
interface MaterialLesson { id: string; name: string; slug: string; itemIds?: string[] }
interface MaterialModule { id: string; name: string; slug: string; lessonIds?: string[] }
interface OutlineBody {
  elements?: { moduleIds?: string[] }[];
  linked?: {
    'onDemandCourseMaterialModules.v1'?: MaterialModule[];
    'onDemandCourseMaterialLessons.v1'?: MaterialLesson[];
    'onDemandCourseMaterialItems.v2'?: MaterialItem[];
  };
}

async function api(path: string, cauth: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { cookie: `CAUTH=${cauth}`, ...((init?.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) {
    const err = new Error(`Coursera API ${res.status} for ${path.split('?')[0]}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function isAuthError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status === 401 || status === 403;
}

// Degree programs track completion separately (proctored finals are not part of the
// course grade), so degree course states override the membership-grade rule.
async function fetchDegreeCourseStates(cauth: string): Promise<Map<string, CourseraCourse['status']> | null> {
  try {
    const userId = ((await api('/api/memberships.v1?q=me&fields=courseId&limit=1', cauth)) as ElementsBody<{ id?: string }>).elements[0]?.id?.split('~')[0];
    if (!userId) return null;
    const degreeId = ((await api(`/api/degreeLearnerMemberships.v1?q=byUser&userId=${userId}`, cauth)) as ElementsBody<{ degreeId?: string }>).elements[0]?.degreeId;
    if (!degreeId) return null;
    const body = [{
      operationName: 'GetDegreeLearnerCourseStatesQuery',
      variables: { degreeId },
      query: 'query GetDegreeLearnerCourseStatesQuery($degreeId: ID!) { DegreeHome { degreeLearnerCourseStatesByUserIdAndDegreeId(degreeId: $degreeId) { id notStarted { course { id } } passed { course { id } } inProgress { course { id } } } } }',
    }];
    const j = (await api('/graphqlBatch?opname=GetDegreeLearnerCourseStatesQuery', cauth, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })) as GqlBatchBody[];
    const states = j[0]?.data?.DegreeHome?.degreeLearnerCourseStatesByUserIdAndDegreeId;
    if (!states) return null;
    const m = new Map<string, CourseraCourse['status']>();
    const pairs: [CourseraCourse['status'], DegreeStateEntry[]][] = [
      ['completed', states.passed ?? []],
      ['enrolled', [...(states.inProgress ?? []), ...(states.notStarted ?? [])]],
    ];
    for (const [status, list] of pairs)
      for (const c of list) m.set(c.course.id, status);
    return m;
  } catch {
    // ponytail: degree lookup is best-effort; fall back to grade-based status
    return null;
  }
}

// Status rule: hidden membership (showHidden diff) = unenrolled; passing grade record = completed; else enrolled.
export async function fetchEnrolledCourses(cauth: string): Promise<CourseraCourse[]> {
  const visible = (await api('/api/memberships.v1?q=me&fields=courseId&limit=100', cauth)) as ElementsBody<{ courseId: string }>;
  const all = (await api('/api/memberships.v1?q=me&fields=courseId,grade&limit=100&showHidden=true', cauth)) as ElementsBody<Membership>;
  const visibleIds = new Set<string>(visible.elements.map((e) => e.courseId));
  if (!all.elements.length) return [];
  const degreeStates = await fetchDegreeCourseStates(cauth);
  const c = (await api(`/api/courses.v1?ids=${encodeURIComponent(all.elements.map((e) => e.courseId).join(','))}&fields=slug,name`, cauth)) as ElementsBody<CourseInfo>;
  // courses.v1 silently drops unenrolled/private courses — backfill via onDemandCourses.v1
  const byId = new Map<string, CourseInfo>(c.elements.map((e) => [e.id, e]));
  const missing = all.elements.map((e) => e.courseId).filter((id) => !byId.has(id));
  if (missing.length) {
    const od = (await api(`/api/onDemandCourses.v1?ids=${encodeURIComponent(missing.join(','))}&fields=slug,name`, cauth)) as ElementsBody<CourseInfo>;
    for (const e of od.elements ?? []) byId.set(e.id, e);
  }
  return all.elements
    .map((e): CourseraCourse | null => {
      const rec: string | undefined = e.grade?.record;
      const passed = !!rec && rec !== 'NOT_PASSED' && rec.endsWith('PASSED');
      const status = !visibleIds.has(e.courseId)
        ? 'unenrolled'
        : degreeStates?.get(e.courseId) ?? (passed ? 'completed' : 'enrolled');
      const info = byId.get(e.courseId);
      return info ? { id: e.courseId, slug: info.slug, name: info.name, status } : null;
    })
    .filter((v): v is CourseraCourse => v !== null);
}

// PDF textbooks attached to course supplements. Coursera exposes them as <asset>
// tags inside the supplement HTML; the file itself downloads from
// /api/rest/v1/asset/download/pdf/{assetId}. Batched via ids= (50 per call).
export interface CourseraAsset { id: string; name: string; itemName?: string }

const MIN_TEXTBOOK_BYTES = 1024 * 1024;

export async function fetchCoursePdfAssets(cauth: string, courseId: string, supplementItemIds: string[]): Promise<CourseraAsset[]> {
  const out = new Map<string, CourseraAsset>();
  for (let i = 0; i < supplementItemIds.length; i += 50) {
    const ids = supplementItemIds.slice(i, i + 50).map((x) => `${courseId}~${x}`).join(',');
    const j = (await api(`/api/onDemandSupplements.v1?ids=${encodeURIComponent(ids)}&includes=asset&fields=openCourseAssets.v1(definition)`, cauth)) as SupplementBody;
    for (const a of j.linked?.['openCourseAssets.v1'] ?? []) {
      const value: string = a?.definition?.value ?? '';
      for (const m of value.matchAll(/<asset id="([^"]+)" name="([^"]*)" extension="pdf"/g)) {
        out.set(m[1], { id: m[1], name: m[2], itemName: a.itemId });
      }
    }
  }
  return [...out.values()];
}

// ponytail: size gate via Range probe — skips howto PDFs, keeps real textbooks;
// full metadata scan if per-asset filtering is ever needed
export async function fetchAssetWithSize(cauth: string, assetId: string): Promise<{ ok: boolean; size: number; name?: string }> {
  const res = await fetch(`${BASE}/api/rest/v1/asset/download/pdf/${assetId}?pageStart=&pageEnd=`, {
    headers: { cookie: `CAUTH=${cauth}`, range: 'bytes=0-0' },
  });
  if (!res.ok) return { ok: false, size: 0 };
  const cr = res.headers.get('content-range');
  const size = cr ? Number(cr.split('/')[1]) : Number(res.headers.get('content-length') ?? 0);
  const cd = res.headers.get('content-disposition');
  const name = cd?.match(/filename="([^"]+)"/)?.[1];
  return { ok: size >= MIN_TEXTBOOK_BYTES, size, name };
}

export async function fetchCourseId(cauth: string, slug: string): Promise<string> {
  const j = (await api(`/api/onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(slug)}&fields=id`, cauth)) as ElementsBody<{ id: string }>;
  return j.elements[0].id;
}

// Returns modules in course-intended order: elements[0].moduleIds → module.lessonIds → lesson.itemIds.
export async function fetchCourseOutline(cauth: string, slug: string): Promise<CourseraModule[]> {
  const fields = 'moduleIds,onDemandCourseMaterialModules.v1(name,slug,lessonIds),onDemandCourseMaterialLessons.v1(name,slug,itemIds),onDemandCourseMaterialItems.v2(name,slug,contentSummary,isLocked)';
  const j = (await api(
    `/api/onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(slug)}&includes=modules,lessons,items&fields=${encodeURIComponent(fields)}`,
    cauth,
  )) as OutlineBody;
  const linked = j.linked ?? {};
  const modById = new Map<string, MaterialModule>((linked['onDemandCourseMaterialModules.v1'] ?? []).map((m) => [m.id, m]));
  const lessonById = new Map<string, MaterialLesson>((linked['onDemandCourseMaterialLessons.v1'] ?? []).map((l) => [l.id, l]));
  const itemById = new Map<string, MaterialItem>((linked['onDemandCourseMaterialItems.v2'] ?? []).map((i) => [i.id, i]));

  const toItem = (id: string): CourseraItem | null => {
    const it = itemById.get(id);
    if (!it) return null;
    const type = it.contentSummary?.typeName ?? 'lecture';
    const segment = TYPE_SEGMENT[type] ?? 'lecture';
    return { id: it.id, name: it.name, slug: it.slug, type, locked: !!it.isLocked, url: `${BASE}/learn/${slug}/${segment}/${it.id}/${it.slug}` };
  };

  return (j.elements?.[0]?.moduleIds ?? [])
    .map((mid) => modById.get(mid))
    .filter((m): m is MaterialModule => !!m)
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      lessons: (m.lessonIds ?? [])
        .map((lid) => lessonById.get(lid))
        .filter((l): l is MaterialLesson => !!l)
        .map((l) => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          items: (l.itemIds ?? []).map(toItem).filter((i): i is CourseraItem => i !== null),
        })),
    }));
}

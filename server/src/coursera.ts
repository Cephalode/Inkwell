// Coursera REST client — CAUTH cookie auth against www.coursera.org.
// Endpoints validated 2026-08-25: memberships.v1?q=me, courses.v1?ids=, onDemandCourseMaterials.v2.

const BASE = 'https://www.coursera.org';

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

async function api(path: string, cauth: string): Promise<any> {
  const res = await fetch(BASE + path, { headers: { cookie: `CAUTH=${cauth}` } });
  if (!res.ok) {
    const err = new Error(`Coursera API ${res.status} for ${path.split('?')[0]}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

export function isAuthError(err: any): boolean {
  return err?.status === 401 || err?.status === 403;
}

// Status rule: hidden membership (showHidden diff) = unenrolled; passing grade record = completed; else enrolled.
export async function fetchEnrolledCourses(cauth: string): Promise<CourseraCourse[]> {
  const visible = await api('/api/memberships.v1?q=me&fields=courseId&limit=100', cauth);
  const all = await api('/api/memberships.v1?q=me&fields=courseId,grade&limit=100&showHidden=true', cauth);
  const visibleIds = new Set<string>(visible.elements.map((e: any) => e.courseId));
  if (!all.elements.length) return [];
  const c = await api(`/api/courses.v1?ids=${encodeURIComponent(all.elements.map((e: any) => e.courseId).join(','))}&fields=slug,name`, cauth);
  // courses.v1 silently drops unenrolled/private courses — backfill via onDemandCourses.v1
  const byId = new Map<string, any>(c.elements.map((e: any) => [e.id, e]));
  const missing = all.elements.map((e: any) => e.courseId).filter((id: string) => !byId.has(id));
  if (missing.length) {
    const od = await api(`/api/onDemandCourses.v1?ids=${encodeURIComponent(missing.join(','))}&fields=slug,name`, cauth);
    for (const e of od.elements ?? []) byId.set(e.id, e);
  }
  return all.elements
    .map((e: any) => {
      const rec: string | undefined = e.grade?.record;
      const passed = !!rec && rec !== 'NOT_PASSED' && rec.endsWith('PASSED');
      const status = !visibleIds.has(e.courseId) ? 'unenrolled' : passed ? 'completed' : 'enrolled';
      const info = byId.get(e.courseId);
      return info ? { id: e.courseId, slug: info.slug, name: info.name, status } : null;
    })
    .filter(Boolean);
}

// Returns modules in course-intended order: elements[0].moduleIds → module.lessonIds → lesson.itemIds.
export async function fetchCourseOutline(cauth: string, slug: string): Promise<CourseraModule[]> {
  const fields = 'moduleIds,onDemandCourseMaterialModules.v1(name,slug,lessonIds),onDemandCourseMaterialLessons.v1(name,slug,itemIds),onDemandCourseMaterialItems.v2(name,slug,contentSummary,isLocked)';
  const j = await api(
    `/api/onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(slug)}&includes=modules,lessons,items&fields=${encodeURIComponent(fields)}`,
    cauth,
  );
  const linked = j.linked ?? {};
  const modById = new Map<string, any>((linked['onDemandCourseMaterialModules.v1'] ?? []).map((m: any) => [m.id, m]));
  const lessonById = new Map<string, any>((linked['onDemandCourseMaterialLessons.v1'] ?? []).map((l: any) => [l.id, l]));
  const itemById = new Map<string, any>((linked['onDemandCourseMaterialItems.v2'] ?? []).map((i: any) => [i.id, i]));

  const toItem = (id: string): CourseraItem | null => {
    const it = itemById.get(id);
    if (!it) return null;
    const type = it.contentSummary?.typeName ?? 'lecture';
    const segment = TYPE_SEGMENT[type] ?? 'lecture';
    return { id: it.id, name: it.name, slug: it.slug, type, locked: !!it.isLocked, url: `${BASE}/learn/${slug}/${segment}/${it.id}/${it.slug}` };
  };

  return (j.elements[0]?.moduleIds ?? [])
    .map((mid: string) => modById.get(mid))
    .filter(Boolean)
    .map((m: any) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      lessons: (m.lessonIds ?? [])
        .map((lid: string) => lessonById.get(lid))
        .filter(Boolean)
        .map((l: any) => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          items: (l.itemIds ?? []).map(toItem).filter(Boolean),
        })),
    }));
}

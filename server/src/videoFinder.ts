import { callGLMJson } from './llm.js';

export interface VideoCandidate {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
}

export interface VideoPick {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  url: string;
  reason: string;
  subsectionIndex: number;
}

export interface ChapterVideos {
  picks: VideoPick[];
  generatedAt: string;
}

interface AnalysisSubsection {
  title: string;
  summary: string;
  keyPoints: string[];
  definitions: string[];
}

const SEARCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1',
};

function extractJSON(text: string, marker: string): unknown {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) throw new Error(`"${marker}" not found in response`);
  const start = text.indexOf('{', markerIdx);
  if (start === -1) throw new Error(`No JSON object after "${marker}"`);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error(`Unbalanced JSON after "${marker}"`);
}

function collectVideoRenderers(node: unknown, out: VideoCandidate[]): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const vr = obj.videoRenderer as Record<string, any> | undefined;
  if (vr && typeof vr.videoId === 'string') {
    const candidate: VideoCandidate = {
      videoId: vr.videoId,
      title: vr.title?.runs?.[0]?.text ?? '',
      channel: vr.ownerText?.runs?.[0]?.text ?? vr.longBylineText?.runs?.[0]?.text ?? '',
      duration: vr.lengthText?.simpleText ?? '',
    };
    if (candidate.title && candidate.duration) out.push(candidate);
  }
  for (const key of Object.keys(obj)) {
    collectVideoRenderers(obj[key], out);
  }
}

export async function searchYouTube(query: string, limit = 6): Promise<VideoCandidate[]> {
  const resp = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10_000) },
  );
  if (!resp.ok) throw new Error(`YouTube search failed: HTTP ${resp.status}`);
  const html = await resp.text();
  const data = extractJSON(html, 'ytInitialData');
  const found: VideoCandidate[] = [];
  collectVideoRenderers(data, found);
  const seen = new Set<string>();
  const unique = found.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
  if (unique.length === 0) throw new Error('YouTube search returned no parseable videos');
  return unique.slice(0, limit);
}

export async function findVideosForAnalysis(
  analysis: { subsections: AnalysisSubsection[] },
  emit: (payload: Record<string, unknown>) => void,
): Promise<ChapterVideos> {
  emit({ type: 'status', message: 'Generating search queries…' });

  const subsectionLines = analysis.subsections
    .map((s, i) => {
      const summary = s.summary.length > 400 ? s.summary.slice(0, 400) : s.summary;
      const keyPoints = s.keyPoints.slice(0, 3).join('; ');
      return `Subsection ${i}: ${s.title} | summary: ${summary} | key points: ${keyPoints}`;
    })
    .join('\n');

  const queryPlan = await callGLMJson<{ queries: { subsection: number; queries: string[] }[] }>(
    [
      { role: 'system', content: 'You generate YouTube search queries.' },
      {
        role: 'user',
        content: `For each subsection of a textbook chapter below, generate exactly 2 YouTube search queries that would find tutorial or explainer videos teaching that subsection's concepts. Queries in English, specific enough to find real videos.

${subsectionLines}

Respond with ONLY a JSON object: { "queries": [ { "subsection": <subsection index>, "queries": ["query 1", "query 2"] } ] }`,
      },
    ],
    { temperature: 0.3 },
  );
  if (!queryPlan?.queries?.length) throw new Error('Failed to generate search queries');

  emit({ type: 'status', message: 'Searching YouTube…' });

  const pool = new Map<string, VideoCandidate & { subsections: Set<number> }>();
  const searches = queryPlan.queries.flatMap((q) =>
    q.queries.slice(0, 2).map(async (queryString) => {
      const results = await searchYouTube(queryString, 5);
      return { subsection: q.subsection, results };
    }),
  );
  const settled = await Promise.allSettled(searches);
  const failures = settled.filter((s) => s.status === 'rejected').length;
  if (failures > 0) {
    console.error(`[videoFinder] ${failures}/${searches.length} YouTube searches failed`);
  }
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const candidate of result.value.results) {
      const existing = pool.get(candidate.videoId);
      if (existing) {
        existing.subsections.add(result.value.subsection);
      } else {
        pool.set(candidate.videoId, { ...candidate, subsections: new Set([result.value.subsection]) });
      }
    }
  }
  if (pool.size === 0) throw new Error('YouTube search returned no results');

  emit({ type: 'status', message: 'Selecting best videos…' });

  const poolListing = [...pool.values()]
    .map(
      (v) =>
        `videoId ${v.videoId} | subsections ${[...v.subsections].join(',')} | ${v.title} | ${v.channel} | ${v.duration}`,
    )
    .join('\n');

  const selection = await callGLMJson<{ picks: { subsection: number; videoId: string; reason: string }[] }>(
    [
      { role: 'system', content: 'You select the best educational videos for textbook subsections.' },
      {
        role: 'user',
        content: `Below is a pool of YouTube videos found by searching for each subsection of a textbook chapter. For EACH subsection number, pick the 2 best videos from the pool for learning that subsection's content. A video may serve multiple subsections. Prefer reputable educational channels and videos under roughly 30 minutes.

${poolListing}

Respond with ONLY a JSON object: { "picks": [ { "subsection": <subsection index>, "videoId": "<id>", "reason": "<=15 words why it fits" } ] }`,
      },
    ],
    { temperature: 0.2 },
  );
  if (!selection?.picks?.length) throw new Error('Failed to select videos');

  const picks: VideoPick[] = [];
  for (const pick of selection.picks) {
    const candidate = pool.get(pick.videoId);
    if (!candidate) continue;
    picks.push({
      videoId: candidate.videoId,
      title: candidate.title,
      channel: candidate.channel,
      duration: candidate.duration,
      url: `https://www.youtube.com/watch?v=${candidate.videoId}`,
      reason: String(pick.reason ?? ''),
      subsectionIndex: Number(pick.subsection) || 0,
    });
  }
  picks.sort((a, b) => a.subsectionIndex - b.subsectionIndex);

  return { picks, generatedAt: new Date().toISOString() };
}

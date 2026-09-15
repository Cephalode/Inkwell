import type { PageContent, Line } from './pdfExtractor.js';
import { API_KEY, UPSTREAM } from '../config.js';

// ── Types ───────────────────────────────────────────────────────────────────
export interface Subsection {
  title: string;
  startPage: number;
  endPage: number;
  text: string;
}

interface AIMarker {
  title: string;
  startText: string;
  endText: string;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect subsections using a hybrid two-tier strategy:
 *  1. Font-size heuristics (fast, deterministic).
 *  2. AI fallback via GLM when font-size finds no clear headings.
 *
 * Edge case: very short chapters (< 500 words) are treated as a single
 * subsection.
 */
export async function detectSubsections(
  pages: PageContent[],
  chapterText: string,
): Promise<Subsection[]> {
  if (pages.length === 0) {
    return [{ title: 'Full Chapter', startPage: 1, endPage: 1, text: chapterText }];
  }

  const wordCount = chapterText.trim().split(/\s+/).filter(Boolean).length;
  const firstPage = pages[0].pageNumber;
  const lastPage = pages[pages.length - 1].pageNumber;

  // Edge case: chapter too short to meaningfully subdivide.
  if (wordCount < 500) {
    return [
      {
        title: 'Full Chapter',
        startPage: firstPage,
        endPage: lastPage,
        text: chapterText,
      },
    ];
  }

  // Tier 1 — font-size heuristics.
  const fontResult = detectByFontSize(pages);
  if (fontResult.length >= 2) return fontResult;

  // Tier 2 — AI fallback.
  try {
    const aiResult = await detectByAI(pages, chapterText);
    if (aiResult.length >= 2) return aiResult;
  } catch (err) {
    console.error('AI subsection detection failed:', err);
  }

  // Ultimate fallback: whole chapter as one subsection.
  return [
    {
      title: 'Full Chapter',
      startPage: firstPage,
      endPage: lastPage,
      text: chapterText,
    },
  ];
}

// ── Tier 1: font-size heuristics ────────────────────────────────────────────

interface LineRef {
  line: Line;
  pageNumber: number;
}

function detectByFontSize(pages: PageContent[]): Subsection[] {
  // Flatten every line across all pages, keeping its page number + global index.
  const allLines: LineRef[] = [];
  for (const page of pages) {
    for (const line of page.lines) {
      allLines.push({ line, pageNumber: page.pageNumber });
    }
  }
  if (allLines.length === 0) return [];

  // Find the modal (most common) font size = body text.
  const sizeCounts = new Map<number, number>();
  for (const { line } of allLines) {
    const rounded = Math.round(line.fontSize);
    if (rounded <= 0) continue;
    sizeCounts.set(rounded, (sizeCounts.get(rounded) ?? 0) + 1);
  }
  let bodySize = 0;
  let maxCount = 0;
  for (const [size, count] of sizeCounts) {
    if (count > maxCount) {
      maxCount = count;
      bodySize = size;
    }
  }
  if (bodySize === 0) return [];

  // Detect running headers / footers: short strings repeated across ≥3 pages.
  const textPages = new Map<string, Set<number>>();
  for (const { line, pageNumber } of allLines) {
    const key = line.text.trim().toLowerCase();
    if (key.length < 3) continue;
    if (!textPages.has(key)) textPages.set(key, new Set());
    textPages.get(key)!.add(pageNumber);
  }
  const runningHeaders = new Set<string>();
  for (const [key, pageSet] of textPages) {
    if (pageSet.size >= 3) runningHeaders.add(key);
  }

  // Heading threshold: clearly larger than body text.
  const headingThreshold = bodySize * 1.2;

  // Collect heading boundaries.
  const headingIdxs: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const { line } = allLines[i];
    if (line.fontSize <= headingThreshold) continue;

    const text = line.text.trim();
    if (text.length < 3) continue; // noise
    if (/^\d{1,4}$/.test(text)) continue; // bare page number
    if (/^[ivxlcm]+$/i.test(text)) continue; // roman numeral
    if (runningHeaders.has(text.toLowerCase())) continue; // running header

    headingIdxs.push(i);
  }

  if (headingIdxs.length < 2) return [];

  // Build subsections by splitting at heading boundaries.
  const subsections: Subsection[] = [];
  for (let h = 0; h < headingIdxs.length; h++) {
    const startIdx = headingIdxs[h];
    const endIdx = h < headingIdxs.length - 1 ? headingIdxs[h + 1] : allLines.length;

    // Any text before the first heading becomes a lead-in to subsection 0.
    const sliceStart = h === 0 && startIdx > 0 ? 0 : startIdx;
    const slice = allLines.slice(sliceStart, endIdx);
    if (slice.length === 0) continue;

    subsections.push({
      title: allLines[startIdx].line.text.trim(),
      startPage: slice[0].pageNumber,
      endPage: slice[slice.length - 1].pageNumber,
      text: slice.map((s) => s.line.text).join('\n'),
    });
  }

  return subsections;
}

// ── Tier 2: AI fallback ─────────────────────────────────────────────────────

async function detectByAI(
  pages: PageContent[],
  chapterText: string,
): Promise<Subsection[]> {
  // Build offset→page map from the same page ordering used for chapter text.
  const offsetPages: Array<{ offset: number; pageNumber: number }> = [];
  let cursor = 0;
  for (const page of pages) {
    offsetPages.push({ offset: cursor, pageNumber: page.pageNumber });
    cursor += page.lines.map((l) => l.text).join('\n').length + 2; // + "\n\n"
  }

  const resp = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-5.3-flash',
      temperature: 0.2,
      max_tokens: 4096,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at analyzing the structure of academic textbook chapters. Respond with ONLY a valid JSON array — no explanation, no markdown fences.',
        },
        {
          role: 'user',
          content: `Divide this chapter into subsections. Return a JSON array of objects, each with {title, startText, endText} where startText is the EXACT first ~12 words of the subsection as they appear in the text, and endText is the EXACT last ~12 words. Identify natural subsection boundaries (section headings, topic shifts).

Chapter text:
${chapterText.slice(0, 12000)}`,
        },
      ],
    }),
  });

  if (!resp.ok) return [];

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const raw = (data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.message?.reasoning_content ||
    ''
  ).trim();

  const markers = parseJSON<AIMarker[]>(raw);
  if (!Array.isArray(markers) || markers.length < 2) return [];

  return splitByMarkers(chapterText, markers, offsetPages);
}

function splitByMarkers(
  chapterText: string,
  markers: AIMarker[],
  offsetPages: Array<{ offset: number; pageNumber: number }>,
): Subsection[] {
  const lower = chapterText.toLowerCase();
  const positions: Array<{ title: string; start: number; end: number }> = [];
  let searchFrom = 0;

  for (const m of markers) {
    const needle = (m.startText || '').toLowerCase().slice(0, 40).trim();
    if (!needle) continue;
    const idx = lower.indexOf(needle, searchFrom);
    if (idx === -1) continue;
    positions.push({ title: m.title, start: idx, end: chapterText.length });
    searchFrom = idx + 1;
  }

  if (positions.length < 2) return [];

  for (let i = 0; i < positions.length - 1; i++) {
    positions[i].end = positions[i + 1].start;
  }

  return positions.map((p) => ({
    title: p.title.trim() || 'Untitled Subsection',
    startPage: offsetToPage(offsetPages, p.start),
    endPage: offsetToPage(offsetPages, p.end - 1),
    text: chapterText.slice(p.start, p.end).trim(),
  }));
}

function offsetToPage(
  offsetPages: Array<{ offset: number; pageNumber: number }>,
  offset: number,
): number {
  let page = offsetPages[0]?.pageNumber ?? 1;
  for (const op of offsetPages) {
    if (op.offset <= offset) page = op.pageNumber;
    else break;
  }
  return page;
}

// ── Shared JSON helper ──────────────────────────────────────────────────────

/** Parse JSON from an LLM response, stripping markdown code fences. */
export function parseJSON<T>(raw: string): T | null {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences.
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

import pool from '../db.js';
import { extractTextWithFonts, pagesToText } from './pdfExtractor.js';

// ── Types ───────────────────────────────────────────────────────────────────

/** Maximum characters per material unit (matches chapterAnalysis truncation). */
export const MAX_UNIT_CHARS = 12_000;

export type MaterialSource =
  | 'chapter-analysis'
  | 'chapter-text'
  | 'video-summary'
  | 'document-text'
  | 'pdf-extraction';

export interface MaterialUnit {
  documentId: string;
  /** Present when the unit comes from a specific chapter. */
  chapterId?: string;
  /** Human-readable label for the unit (chapter title, document name, etc.). */
  title: string;
  /** Digest text, capped at ~12k chars. Safe to feed into an LLM context. */
  text: string;
  /** Where the text was sourced from — cheapest available first. */
  source: MaterialSource;
}

interface ChapterAnalysisSubsection {
  title: string;
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

interface ChapterAnalysis {
  subsections: ChapterAnalysisSubsection[];
  chapterNotes: string;
  analyzedAt: string;
}

interface VideoSummary {
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
  topics: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Truncate text to `max` chars, appending an ellipsis marker if cut. */
function truncate(text: string, max = MAX_UNIT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n…[truncated]';
}

/** Render a pre-existing chapter analysis JSONB into a compact digest string. */
function analysisToDigest(analysis: ChapterAnalysis): string {
  const parts: string[] = [];
  if (analysis.chapterNotes) {
    parts.push(`Chapter Notes:\n${analysis.chapterNotes}`);
  }
  for (const sub of analysis.subsections ?? []) {
    parts.push(`\n## ${sub.title}`);
    if (sub.summary) parts.push(`Summary: ${sub.summary}`);
    if (sub.keyPoints?.length) parts.push(`Key Points:\n${sub.keyPoints.map((k) => `  - ${k}`).join('\n')}`);
    if (sub.formulas?.length) parts.push(`Formulas: ${sub.formulas.join('; ')}`);
    if (sub.definitions?.length) parts.push(`Definitions:\n${sub.definitions.map((d) => `  - ${d}`).join('\n')}`);
  }
  return parts.join('\n');
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Gather all source materials for a course and/or set of documents, returning
 * per-unit digests capped at ~12k chars each.
 *
 * Per document, cheapest source is preferred first:
 *  1. Chapters with `analysis` JSONB  (free, pre-digested by chapterAnalysis)
 *  2. Chapters' `parsed_text`          (stored text, no LLM cost)
 *  3. Document `video_summary`         (stored, pre-digested for videos)
 *  4. Document `parsed_text`           (stored text/transcript)
 *  5. PDF extraction fallback          (on-the-fly from file_path)
 *
 * This is the context-window mitigation for REDUCE phases: they only ever see
 * per-unit digests, never raw full-course text.
 */
export async function collectMaterials(opts: {
  courseId?: string;
  documentIds?: string[];
}): Promise<MaterialUnit[]> {
  // 1. Resolve the full set of document IDs.
  const ids = new Set<string>();
  if (opts.documentIds) {
    for (const id of opts.documentIds) ids.add(id);
  }
  if (opts.courseId) {
    const { rows } = await pool.query('SELECT document_ids FROM courses WHERE id = $1', [
      opts.courseId,
    ]);
    if (rows.length > 0) {
      const docIds = rows[0].document_ids;
      if (Array.isArray(docIds)) {
        for (const id of docIds) {
          if (typeof id === 'string') ids.add(id);
        }
      }
    }
  }
  if (ids.size === 0) return [];

  const documentIds = [...ids];

  // 2. Fetch document metadata.
  const { rows: docRows } = await pool.query(
    'SELECT id, name, type, parsed_text, file_path, video_summary FROM documents WHERE id = ANY($1)',
    [documentIds],
  );
  const docsById = new Map<string, (typeof docRows)[number]>();
  for (const row of docRows) docsById.set(row.id, row);

  // 3. Fetch all chapters for these documents, ordered naturally.
  const { rows: chapterRows } = await pool.query(
    `SELECT id, parent_id, chapter_title, chapter_index, parsed_text, analysis
     FROM chapters WHERE parent_id = ANY($1)
     ORDER BY parent_id, chapter_index`,
    [documentIds],
  );
  // Group chapters by parent document.
  const chaptersByDoc = new Map<string, typeof chapterRows>();
  for (const ch of chapterRows) {
    const arr = chaptersByDoc.get(ch.parent_id) ?? [];
    arr.push(ch);
    chaptersByDoc.set(ch.parent_id, arr);
  }

  const units: MaterialUnit[] = [];

  for (const docId of documentIds) {
    const doc = docsById.get(docId);
    if (!doc) continue;

    const chapters = chaptersByDoc.get(docId) ?? [];
    let producedUnits = 0;

    // --- Per-chapter sources (textbook documents) ---
    for (const ch of chapters) {
      // 1. Cheapest: pre-digested analysis JSONB.
      if (ch.analysis) {
        try {
          const analysis = ch.analysis as ChapterAnalysis;
          if (analysis.subsections || analysis.chapterNotes) {
            const digest = analysisToDigest(analysis);
            if (digest.trim()) {
              units.push({
                documentId: docId,
                chapterId: ch.id,
                title: ch.chapter_title,
                text: truncate(digest),
                source: 'chapter-analysis',
              });
              producedUnits++;
              continue;
            }
          }
        } catch {
          // Malformed analysis — fall through to parsed_text.
        }
      }

      // 2. Chapter parsed_text.
      if (ch.parsed_text && ch.parsed_text.trim()) {
        units.push({
          documentId: docId,
          chapterId: ch.id,
          title: ch.chapter_title,
          text: truncate(ch.parsed_text),
          source: 'chapter-text',
        });
        producedUnits++;
      }
    }

    // If chapters produced units, the document-level content is redundant.
    if (producedUnits > 0) continue;

    // --- Document-level sources (videos, standalone docs) ---

    // 3. Video summary (pre-digested).
    if (doc.video_summary) {
      try {
        const vs = doc.video_summary as VideoSummary;
        const parts: string[] = [];
        if (vs.summary) parts.push(`Summary: ${vs.summary}`);
        if (vs.keyPoints?.length) parts.push(`Key Points:\n${vs.keyPoints.map((k) => `  - ${k}`).join('\n')}`);
        if (vs.formulas?.length) parts.push(`Formulas: ${vs.formulas.join('; ')}`);
        if (vs.definitions?.length) parts.push(`Definitions:\n${vs.definitions.map((d) => `  - ${d}`).join('\n')}`);
        if (vs.topics?.length) parts.push(`Topics: ${vs.topics.join(', ')}`);
        const digest = parts.join('\n');
        if (digest.trim()) {
          units.push({
            documentId: docId,
            title: doc.name,
            text: truncate(digest),
            source: 'video-summary',
          });
          continue;
        }
      } catch {
        // Malformed video_summary — fall through.
      }
    }

    // 4. Document parsed_text (transcript, uploaded text, etc.).
    if (doc.parsed_text && doc.parsed_text.trim()) {
      units.push({
        documentId: docId,
        title: doc.name,
        text: truncate(doc.parsed_text),
        source: 'document-text',
      });
      continue;
    }

    // 5. PDF extraction fallback.
    if (doc.file_path) {
      try {
        const pages = await extractTextWithFonts(doc.file_path, 1, 500);
        const text = pagesToText(pages);
        if (text.trim()) {
          units.push({
            documentId: docId,
            title: doc.name,
            text: truncate(text),
            source: 'pdf-extraction',
          });
        }
      } catch (err) {
        console.error(`collectMaterials: PDF extraction failed for ${docId}:`, err);
      }
    }
  }

  return units;
}

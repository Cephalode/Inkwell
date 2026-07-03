import { Router } from 'express';
import pool from '../db.js';
import { extractTextWithFonts, pagesToText } from '../src/pdfExtractor.js';
import { detectSubsections, parseJSON, type Subsection } from '../src/subsectionDetector.js';
import { callGLM } from '../src/llm.js';
import { send, setSSEHeaders } from '../src/sse.js';

const router = Router();

// ── Types ───────────────────────────────────────────────────────────────────
interface ChapterRow {
  id: string;
  parent_id: string;
  chapter_title: string;
  start_page: number;
  end_page: number;
  file_path: string | null;
}

interface DocRow {
  id: string;
  file_path: string | null;
}

interface SubsectionAnalysis {
  title: string;
  startPage: number;
  endPage: number;
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

interface AnalysisResult {
  subsections: SubsectionAnalysis[];
  chapterNotes: string;
  analyzedAt: string;
}

interface ParsedAnalysis {
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

// ── POST /chapters/:id/analyze — SSE analysis pipeline ──────────────────────
router.post('/chapters/:id/analyze', async (req, res) => {
  const { id } = req.params;

  setSSEHeaders(res);

  // Keep the connection alive if the client disconnects early.
  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const fail = (message: string) => {
    if (!closed) send(res, { type: 'error', message });
    res.end();
  };

  try {
    // 1. Fetch chapter from DB.
    const { rows: chapterRows } = await pool.query(
      'SELECT id, parent_id, chapter_title, start_page, end_page, file_path FROM chapters WHERE id = $1',
      [id],
    );
    if (chapterRows.length === 0) return fail('Chapter not found');
    const chapter = chapterRows[0] as ChapterRow;

    // 2. Fetch parent document for the source file path.
    const { rows: docRows } = await pool.query(
      'SELECT id, file_path FROM documents WHERE id = $1',
      [chapter.parent_id],
    );
    if (docRows.length === 0) return fail('Parent document not found');
    const doc = docRows[0] as DocRow;

    // Always read from the PARENT document's original full PDF. A chapter's own
    // file_path is a split/derived blob that may be corrupt or empty, and the
    // page numbers below are relative to the original document anyway.
    const filePath = doc.file_path || chapter.file_path;
    if (!filePath) return fail('No PDF file path available for this chapter');

    // Validate page range. extractTextWithFonts expects 1-indexed pages.
    const startPage = Number(chapter.start_page);
    const endPage = Number(chapter.end_page);
    if (!Number.isFinite(startPage) || !Number.isFinite(endPage) || startPage < 1) {
      return fail(
        `Invalid start_page (${chapter.start_page}); must be a 1-indexed page number`,
      );
    }
    if (endPage < startPage) {
      return fail(
        `Invalid page range: end_page (${endPage}) is before start_page (${startPage})`,
      );
    }

    // 3. Extract text with font metadata.
    send(res, { type: 'extracting', message: 'Extracting text from PDF…' });
    const pages = await extractTextWithFonts(filePath, startPage, endPage);
    const chapterText = pagesToText(pages);
    if (!chapterText.trim()) return fail('No extractable text found in this chapter');

    // 4. Detect subsections (hybrid font-size + AI fallback).
    send(res, { type: 'detecting_subsections', message: 'Detecting subsections…' });
    const subsections: Subsection[] = await detectSubsections(pages, chapterText);

    // 5. Emit detected subsections.
    send(res, {
      type: 'subsections_detected',
      count: subsections.length,
      subsections: subsections.map((s) => ({
        title: s.title,
        pages: [s.startPage, s.endPage],
      })),
    });

    // 6. MAP PHASE — analyze each subsection in an independent LLM context.
    const analyses: SubsectionAnalysis[] = [];
    for (let i = 0; i < subsections.length; i++) {
      if (closed) return;
      const sub = subsections[i];

      send(res, {
        type: 'subsection_start',
        index: i,
        total: subsections.length,
        title: sub.title,
      });

      // Truncate very long subsections to stay within context limits.
      const safeText = sub.text.length > 12000 ? sub.text.slice(0, 12000) + '\n…[truncated]' : sub.text;

      const raw = await callGLM(
        [
          {
            role: 'system',
            content:
              'You are an expert academic assistant analyzing a subsection of a textbook chapter. Read the text carefully.',
          },
          {
            role: 'user',
            content: `Analyze this subsection. Provide a JSON response with:
- summary: 2-3 sentence summary
- keyPoints: array of the most important information
- formulas: array of any formulas or equations (as text), empty if none
- definitions: array of important definitions, empty if none

Respond with ONLY a JSON object, no markdown fences.

Subsection title: ${sub.title}

Text:
${safeText}`,
          },
        ],
        { temperature: 0.4 },
      );

      const parsed = parseJSON<ParsedAnalysis>(raw) ?? {
        summary: raw.trim() || 'Analysis unavailable.',
        keyPoints: [],
        formulas: [],
        definitions: [],
      };

      const analysis: SubsectionAnalysis = {
        title: sub.title,
        startPage: sub.startPage,
        endPage: sub.endPage,
        summary: typeof parsed.summary === 'string' ? parsed.summary : String(parsed.summary ?? ''),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
        formulas: Array.isArray(parsed.formulas) ? parsed.formulas.map(String) : [],
        definitions: Array.isArray(parsed.definitions) ? parsed.definitions.map(String) : [],
      };
      analyses.push(analysis);

      send(res, {
        type: 'subsection_result',
        index: i,
        title: sub.title,
        summary: analysis.summary,
        keyPoints: analysis.keyPoints,
        formulas: analysis.formulas,
        definitions: analysis.definitions,
      });
    }

    // 7. REDUCE PHASE — synthesize chapter-level notes in a fresh context.
    if (closed) return;
    send(res, { type: 'synthesizing', message: 'Synthesizing chapter notes…' });

    const synthesisInput = analyses.map((a) => ({
      title: a.title,
      summary: a.summary,
      keyPoints: a.keyPoints,
    }));

    const notesRaw = await callGLM(
      [
        {
          role: 'system',
          content: 'You are synthesizing chapter-level notes from subsection analyses.',
        },
        {
          role: 'user',
          content: `Here are analyses of subsections from a chapter. Create comprehensive chapter-level key notes. Focus on: overarching themes, connections between subsections, the most critical concepts to remember, and a study guide flow.

Subsection analyses:
${JSON.stringify(synthesisInput)}`,
        },
      ],
      { temperature: 0.5 },
    );

    const chapterNotes = notesRaw.trim() || 'Chapter synthesis unavailable.';
    send(res, { type: 'chapter_synthesis', notes: chapterNotes });

    // 8. Persist results to DB.
    const analysisResult: AnalysisResult = {
      subsections: analyses,
      chapterNotes,
      analyzedAt: new Date().toISOString(),
    };
    await pool.query('UPDATE chapters SET analysis = $1::jsonb, updated_at = now() WHERE id = $2', [
      JSON.stringify(analysisResult),
      id,
    ]);

    // 9. Done.
    send(res, { type: 'done', totalSubsections: subsections.length });
    res.end();
  } catch (err: unknown) {
    console.error('Chapter analysis error:', err);
    const message = err instanceof Error ? err.message : String(err);
    fail(message);
  }
});

// ── GET /chapters/:id/analysis — Retrieve cached analysis ───────────────────
router.get('/chapters/:id/analysis', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT analysis FROM chapters WHERE id = $1', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const analysis = (rows[0] as { analysis: AnalysisResult | null }).analysis;
    if (!analysis) {
      return res.status(404).json({ error: 'No analysis found for this chapter' });
    }
    res.json(analysis);
  } catch (err: unknown) {
    console.error('Error fetching chapter analysis:', err);
    res.status(500).json({ error: 'Failed to fetch chapter analysis' });
  }
});

export default router;

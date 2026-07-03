import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { callGLMJson } from '../src/llm.js';
import { collectMaterials } from '../src/materials.js';
import { runGeneration, updateStatus, checkStale } from '../src/generationPipeline.js';

const router = Router();

// ── Types ───────────────────────────────────────────────────────────────────

interface StudyGuideRow {
  id: string;
  course_id: string | null;
  document_id: string | null;
  title: string;
  content: StudyGuideContent | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface MaterialDigest {
  documentId: string;
  chapterId?: string;
  title: string;
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

interface StudyGuideContent {
  overview: string;
  prerequisites: string[];
  conceptRoadmap: Array<{ concept: string; description: string; dependsOn: string[] }>;
  perMaterial: MaterialDigest[];
  keyFormulas: string[];
  keyDefinitions: string[];
  suggestedOrder: Array<{ title: string; documentId?: string; chapterId?: string; reason: string }>;
  generatedAt: string;
}

interface MaterialAnalysis {
  summary: string;
  keyPoints: string[];
  formulas: string[];
  definitions: string[];
}

interface SynthesisResult {
  overview: string;
  prerequisites: string[];
  conceptRoadmap: Array<{ concept: string; description: string; dependsOn: string[] }>;
  keyFormulas: string[];
  keyDefinitions: string[];
  suggestedOrder: Array<{ title: string; documentId?: string; chapterId?: string; reason: string }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToGuide(row: StudyGuideRow) {
  return {
    id: row.id,
    courseId: row.course_id,
    documentId: row.document_id,
    title: row.title,
    content: row.content ?? null,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — list guides (optionally filter by courseId/documentId) ───────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { courseId, documentId } = req.query;
    let query =
      'SELECT id, course_id, document_id, title, status, error, created_at, updated_at FROM study_guides';
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (courseId && typeof courseId === 'string') {
      conditions.push(`course_id = $${idx++}`);
      params.push(courseId);
    }
    if (documentId && typeof documentId === 'string') {
      conditions.push(`document_id = $${idx++}`);
      params.push(documentId);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY updated_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows.map((r) => rowToGuide(r as StudyGuideRow)));
  } catch (err) {
    console.error('Error listing study guides:', err);
    res.status(500).json({ error: 'Failed to list study guides' });
  }
});

// ── GET /:id — get a single guide (with staleness guard) ───────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM study_guides WHERE id = $1', [String(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ error: 'Study guide not found' });
    const row = rows[0] as StudyGuideRow;

    // Staleness guard: 'generating' for > GENERATION_TIMEOUT_MS ⇒ treat as error.
    if (row.status === 'generating' && checkStale(row)) {
      await updateStatus('study_guides', row.id, 'error', 'Generation timed out');
      row.status = 'error';
      row.error = 'Generation timed out';
    }

    res.json(rowToGuide(row));
  } catch (err) {
    console.error('Error fetching study guide:', err);
    res.status(500).json({ error: 'Failed to fetch study guide' });
  }
});

// ── POST / — create a new pending guide ────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    let { title } = req.body as { title?: string };
    const { courseId, documentId } = req.body as {
      courseId?: string;
      documentId?: string;
    };

    if (!courseId && !documentId) {
      return res.status(400).json({ error: 'Either courseId or documentId is required' });
    }

    // Auto-title from course or document name if not provided.
    if (!title) {
      if (courseId) {
        const { rows } = await pool.query('SELECT name FROM courses WHERE id = $1', [courseId]);
        title = rows.length > 0 ? `Study Guide: ${rows[0].name}` : 'Study Guide';
      } else if (documentId) {
        const { rows } = await pool.query('SELECT name FROM documents WHERE id = $1', [documentId]);
        title = rows.length > 0 ? `Study Guide: ${rows[0].name}` : 'Study Guide';
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO study_guides (title, course_id, document_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [title, courseId ?? null, documentId ?? null],
    );
    res.status(201).json(rowToGuide(rows[0] as StudyGuideRow));
  } catch (err) {
    console.error('Error creating study guide:', err);
    res.status(500).json({ error: 'Failed to create study guide' });
  }
});

// ── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM study_guides WHERE id = $1', [String(req.params.id)]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting study guide:', err);
    res.status(500).json({ error: 'Failed to delete study guide' });
  }
});

// ── POST /:id/generate — SSE generation pipeline ───────────────────────────
//
// Ported onto the shared `runGeneration` pipeline (US-008). The pipeline owns
// the SSE lifecycle (headers, the six standard events, status transitions,
// disconnect detection, and the headersSent-aware error path). Route-specific
// business logic lives in the three callbacks:
//
//   • collectMaterials — resolve the guide row + gather source material units
//   • processMaterial — MAP: turn one material unit into a MaterialDigest
//   • finalize        — REDUCE: synthesize the full guide, persist content,
//                       and emit the studyGuide-specific `guide` event

router.post('/:id/generate', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  // Per-material digests accumulated during the MAP phase; consumed by the
  // REDUCE/synthesis step in `finalize`.
  const digests: MaterialDigest[] = [];

  await runGeneration({
    table: 'study_guides',
    id,
    req,
    res,

    // ── Resolve the guide and gather its source materials ──
    collectMaterials: async () => {
      const { rows } = await pool.query('SELECT * FROM study_guides WHERE id = $1', [id]);
      if (rows.length === 0) throw new Error('Study guide not found');
      const guide = rows[0] as StudyGuideRow;
      return collectMaterials({
        courseId: guide.course_id ?? undefined,
        documentIds: guide.document_id ? [guide.document_id] : undefined,
      });
    },

    // ── MAP: analyze a single material unit into a digest ──
    processMaterial: async (unit) => {
      let digest: MaterialDigest;

      if (unit.source === 'chapter-analysis') {
        // Already pre-digested by chapterAnalysis — skip the LLM call.
        digest = {
          documentId: unit.documentId,
          chapterId: unit.chapterId,
          title: unit.title,
          summary: unit.text,
          keyPoints: [],
          formulas: [],
          definitions: [],
        };
      } else {
        // Fresh LLM call to extract structured data from raw text.
        const analysis = await callGLMJson<MaterialAnalysis>(
          [
            {
              role: 'system',
              content:
                'You are an expert academic assistant analyzing study material. Read the text carefully and extract key information.',
            },
            {
              role: 'user',
              content: `Analyze this material and provide a JSON response with:
- summary: 2-3 sentence summary
- keyPoints: array of the most important information
- formulas: array of any formulas or equations (as text), empty if none
- definitions: array of important definitions, empty if none

Respond with ONLY a JSON object, no markdown fences.

Material title: ${unit.title}

Text:
${unit.text}`,
            },
          ],
          { temperature: 0.4 },
        );

        digest = {
          documentId: unit.documentId,
          chapterId: unit.chapterId,
          title: unit.title,
          summary:
            (typeof analysis?.summary === 'string' ? analysis.summary : '') ||
            unit.text.slice(0, 500) ||
            'Summary unavailable.',
          keyPoints: Array.isArray(analysis?.keyPoints) ? analysis!.keyPoints.map(String) : [],
          formulas: Array.isArray(analysis?.formulas) ? analysis!.formulas.map(String) : [],
          definitions: Array.isArray(analysis?.definitions)
            ? analysis!.definitions.map(String)
            : [],
        };
      }

      digests.push(digest);
      return 1; // one digest produced per material unit
    },

    // ── REDUCE: synthesize the full study guide from collected digests ──
    // This is the studyGuide-specific synthesis step (flashcards/tests omit it).
    finalize: async (_materials, emit) => {
      const digestsInput = digests.map((d) => ({
        title: d.title,
        summary: d.summary,
        keyPoints: d.keyPoints,
        formulas: d.formulas,
        definitions: d.definitions,
      }));

      const synthesis = await callGLMJson<SynthesisResult>(
        [
          {
            role: 'system',
            content:
              'You are an expert academic tutor creating a comprehensive study guide from pre-analyzed course materials.',
          },
          {
            role: 'user',
            content: `Here are analyses of individual course materials. Create a comprehensive study guide. Provide a JSON response with:
- overview: 3-5 sentence overview of the entire course/topic
- prerequisites: array of prerequisite knowledge students should have
- conceptRoadmap: array of {concept, description, dependsOn (array of concept names it builds on)}
- keyFormulas: array of the most important formulas across all materials
- keyDefinitions: array of the most important definitions across all materials
- suggestedOrder: array of {title, documentId (if applicable), chapterId (if applicable), reason} suggesting the optimal study order

Respond with ONLY a JSON object, no markdown fences.

Material analyses:
${JSON.stringify(digestsInput)}`,
          },
        ],
        { temperature: 0.5, maxTokens: 8192 },
      );

      // Assemble the full guide content.
      const content: StudyGuideContent = {
        overview:
          (typeof synthesis?.overview === 'string' ? synthesis.overview : '') ||
          'Study guide overview unavailable.',
        prerequisites: Array.isArray(synthesis?.prerequisites)
          ? synthesis!.prerequisites.map(String)
          : [],
        conceptRoadmap: Array.isArray(synthesis?.conceptRoadmap)
          ? synthesis!.conceptRoadmap
              .filter((c) => c && typeof c.concept === 'string')
              .map((c) => ({
                concept: String(c.concept),
                description: typeof c.description === 'string' ? c.description : '',
                dependsOn: Array.isArray(c.dependsOn) ? c.dependsOn.map(String) : [],
              }))
          : [],
        perMaterial: digests,
        keyFormulas: Array.isArray(synthesis?.keyFormulas) ? synthesis!.keyFormulas.map(String) : [],
        keyDefinitions: Array.isArray(synthesis?.keyDefinitions)
          ? synthesis!.keyDefinitions.map(String)
          : [],
        suggestedOrder: Array.isArray(synthesis?.suggestedOrder)
          ? synthesis!.suggestedOrder
              .filter((s) => s && typeof s.title === 'string')
              .map((s) => ({
                title: String(s.title),
                documentId: typeof s.documentId === 'string' ? s.documentId : undefined,
                chapterId: typeof s.chapterId === 'string' ? s.chapterId : undefined,
                reason: typeof s.reason === 'string' ? s.reason : '',
              }))
          : [],
        generatedAt: new Date().toISOString(),
      };

      // Persist the synthesized content. Status/error are owned by the pipeline
      // — it marks the row `done` (with error = NULL) immediately after this
      // callback returns.
      await pool.query(
        'UPDATE study_guides SET content = $1::jsonb, updated_at = now() WHERE id = $2',
        [JSON.stringify(content), id],
      );

      emit('guide', { guide: content });
    },
  });
});

export default router;

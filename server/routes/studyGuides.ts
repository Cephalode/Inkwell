import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { callGLMJson } from '../src/llm.js';
import { send, setSSEHeaders } from '../src/sse.js';
import { collectMaterials } from '../src/materials.js';

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

/** Update a guide's status in the DB (fire-and-forget, errors logged). */
async function updateStatus(
  id: string,
  status: string,
  error: string | null = null,
  content: unknown = null,
): Promise<void> {
  try {
    if (content) {
      await pool.query(
        'UPDATE study_guides SET status = $1, error = $2, content = $3::jsonb, updated_at = now() WHERE id = $4',
        [status, error, JSON.stringify(content), id],
      );
    } else {
      await pool.query(
        'UPDATE study_guides SET status = $1, error = $2, updated_at = now() WHERE id = $3',
        [status, error, id],
      );
    }
  } catch (err) {
    console.error(`Failed to update study guide status for ${id}:`, err);
  }
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

    // Staleness guard: 'generating' for > 10 minutes ⇒ treat as error.
    if (row.status === 'generating') {
      const updatedAt = new Date(row.updated_at).getTime();
      if (Date.now() - updatedAt > 10 * 60 * 1000) {
        await updateStatus(row.id, 'error', 'Generation timed out');
        row.status = 'error';
        row.error = 'Generation timed out';
      }
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
    const { title, courseId, documentId } = req.body as {
      title?: string;
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

router.post('/:id/generate', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  setSSEHeaders(res);

  // Keep the connection alive if the client disconnects early.
  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const fail = async (message: string) => {
    await updateStatus(id, 'error', message);
    if (!closed) {
      send(res, { type: 'error', message });
      res.end();
    }
  };

  try {
    // 1. Fetch the guide.
    const { rows } = await pool.query('SELECT * FROM study_guides WHERE id = $1', [id]);
    if (rows.length === 0) return await fail('Study guide not found');
    const guide = rows[0] as StudyGuideRow;

    // 2. Mark as generating.
    await updateStatus(id, 'generating');
    send(res, { type: 'status', message: 'Collecting source materials…' });

    // 3. Collect materials.
    const materials = await collectMaterials({
      courseId: guide.course_id ?? undefined,
      documentIds: guide.document_id ? [guide.document_id] : undefined,
    });

    if (materials.length === 0) {
      return await fail('No source materials found for this study guide');
    }

    send(res, { type: 'materials_collected', count: materials.length });

    // 4. MAP PHASE — analyze each material unit.
    const digests: MaterialDigest[] = [];

    for (let i = 0; i < materials.length; i++) {
      if (closed) return;
      const unit = materials[i];

      send(res, {
        type: 'material_start',
        index: i,
        total: materials.length,
        title: unit.title,
      });

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

      send(res, {
        type: 'material_result',
        index: i,
        title: digest.title,
        summary: digest.summary,
        keyPoints: digest.keyPoints,
        formulas: digest.formulas,
        definitions: digest.definitions,
      });
    }

    // 5. REDUCE PHASE — synthesize the full study guide.
    if (closed) return;
    send(res, { type: 'synthesizing', message: 'Synthesizing study guide…' });

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

    // 6. Assemble the full guide content.
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

    // 7. Persist to DB.
    await pool.query(
      'UPDATE study_guides SET status = $1, error = NULL, content = $2::jsonb, updated_at = now() WHERE id = $3',
      ['done', JSON.stringify(content), id],
    );

    // 8. Emit the guide and done.
    send(res, { type: 'guide', guide: content });
    send(res, { type: 'done' });
    res.end();
  } catch (err: unknown) {
    console.error('Study guide generation error:', err);
    const message = err instanceof Error ? err.message : String(err);
    await fail(message);
  }
});

export default router;

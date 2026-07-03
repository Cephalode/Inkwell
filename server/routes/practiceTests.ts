import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db';
import { callGLMJson } from '../src/llm';
import { collectMaterials } from '../src/materials';
import { runGeneration, updateStatus, checkStale } from '../src/generationPipeline';

const router = Router();

// GET /api/practice-tests
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tests = await db.query(
      `SELECT id, title, description, course_id, source, config, status, error, created_at, updated_at
       FROM practice_tests
       ORDER BY updated_at DESC`
    );
    res.json(tests.rows);
  } catch (error) {
    console.error('Error fetching practice tests:', error);
    res.status(500).json({ error: 'Failed to fetch practice tests' });
  }
});

// GET /api/practice-tests/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { reveal } = req.query;

    const test = await db.query(
      `SELECT id, title, description, course_id, source, config, status, error, created_at, updated_at
       FROM practice_tests WHERE id = $1`,
      [id]
    );

    if (test.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const testRow = test.rows[0];

    // Staleness guard: a test stuck in `generating` for longer than the
    // generation timeout is treated as errored (shared implementation).
    if (testRow.status === 'generating' && checkStale(testRow)) {
      await updateStatus('practice_tests', id, 'error', 'Generation timed out');
      testRow.status = 'error';
      testRow.error = 'Generation timed out';
    }

    // Fetch questions
    const questions = await db.query(
      `SELECT id, position, qtype, prompt, options, correct_answer, explanation
       FROM test_questions
       WHERE test_id = $1
       ORDER BY position ASC`,
      [id]
    );

    // In take mode, omit correct_answer and explanation if reveal not requested
    const qList = reveal === 'true'
      ? questions.rows
      : questions.rows.map((q: { id: string; position: number; qtype: string; prompt: string; options?: string }) => ({
          id: q.id,
          position: q.position,
          qtype: q.qtype,
          prompt: q.prompt,
          options: q.options,
        }));

    res.json({ ...testRow, questions: qList });
  } catch (error) {
    console.error('Error fetching practice test:', error);
    res.status(500).json({ error: 'Failed to fetch practice test' });
  }
});

// POST /api/practice-tests
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, course_id, source, config } = req.body;

    const result = await db.query(
      `INSERT INTO practice_tests (title, description, course_id, source, config, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, title, description, course_id, source, config, status, created_at, updated_at`,
      [
        title,
        description,
        course_id || null,
        JSON.stringify(source),
        JSON.stringify(config),
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating practice test:', error);
    res.status(500).json({ error: 'Failed to create practice test' });
  }
});

// DELETE /api/practice-tests/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM practice_tests WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting practice test:', error);
    res.status(500).json({ error: 'Failed to delete practice test' });
  }
});

// POST /api/practice-tests/:id/generate
//
// Ported onto the shared `runGeneration` pipeline (US-009). The pipeline owns
// the SSE lifecycle (headers, the six standard events, status transitions,
// disconnect detection, and the headersSent-aware error path). Route-specific
// business logic lives in the callbacks:
//
//   • collectMaterials — resolve the test's source + gather material units,
//                        clear questions left from a previous run, and compute
//                        the per-material question budget
//   • processMaterial — MAP: turn one material unit into a bounded slice of
//                       the requested questions

router.post('/:id/generate', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  // Resolve the test up-front so a missing row yields a clean 404 before the
  // SSE stream is opened (the pipeline flushes headers immediately).
  const test = await db.query(
    'SELECT source, course_id, config FROM practice_tests WHERE id = $1',
    [id]
  );

  if (test.rows.length === 0) {
    return res.status(404).json({ error: 'Test not found' });
  }

  const { source, course_id, config } = test.rows[0];
  const numQuestions = config.numQuestions || 10;
  const types = config.types || ['mcq', 'true_false', 'short_answer'];

  // Running position across the whole test (shared between collect and
  // processMaterial) and the per-material question budget (set once the
  // material count is known).
  let position = 0;
  let questionsPerMaterial = 0;

  await runGeneration({
    table: 'practice_tests',
    id,
    req,
    res,

    // ── Gather source materials, clear prior questions, compute budget ──
    collectMaterials: async () => {
      const materials =
        source.type === 'course'
          ? await collectMaterials({ courseId: course_id })
          : await collectMaterials({ documentIds: source.ids });

      // Replace any questions from a previous generation and compute the
      // per-material budget (ceil of total ÷ material count).
      if (materials.length > 0) {
        await db.query('DELETE FROM test_questions WHERE test_id = $1', [id]);
        questionsPerMaterial = Math.ceil(numQuestions / materials.length);
      }

      return materials;
    },

    // ── MAP: generate a bounded slice of questions from one material ──
    processMaterial: async (material) => {
      const questionsToGenerate = Math.min(
        questionsPerMaterial,
        numQuestions - position
      );
      // Budget exhausted — stop generating.
      if (questionsToGenerate <= 0) return 0;

      let produced = 0;

      try {
        const response = await callGLMJson<{
          questions: Array<{
            qtype: string;
            prompt: string;
            options?: string[];
            correct_answer: string | boolean;
            explanation: string;
          }>;
        }>(
          [
            {
              role: 'user',
              content: `Generate ${questionsToGenerate} test questions from this material. Mix question types from: ${types.join(', ')}.

Material:
${material.text}

For MCQ questions, provide 4 options and set correct_answer to the exact text of the correct option (not a letter).
For true/false, the answer should be a boolean.
For short answer, the answer should be brief.

Respond with valid JSON: {
  "questions": [
    {
      "qtype": "mcq|true_false|short_answer",
      "prompt": "question text",
      "options": ["first option", "second option", "third option", "fourth option"],
      "correct_answer": "exact text of correct option" or true/false or "brief answer",
      "explanation": "why this is correct"
    }
  ]
}`,
            },
          ],
          { maxTokens: 3000 }
        );

        if (response?.questions) {
          for (const q of response.questions) {
            await db.query(
              `INSERT INTO test_questions (test_id, position, qtype, prompt, options, correct_answer, explanation)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                id,
                position,
                q.qtype,
                q.prompt,
                q.options ? JSON.stringify(q.options) : null,
                // correct_answer is JSONB: a bare string like "Paris" is not
                // valid JSON, so it must be stringified, not String()-cast
                JSON.stringify(q.correct_answer),
                q.explanation || '',
              ]
            );
            position++;
            produced++;
          }
        }
      } catch (error) {
        console.error('Error generating questions for material:', error);
        // Continue with next material
      }

      return produced;
    },
  });
});

// POST /api/practice-tests/:id/attempts (grade synchronously)
router.post('/:id/attempts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    // Get test with all questions
    const questions = await db.query(
      `SELECT id, position, qtype, prompt, correct_answer, explanation, options
       FROM test_questions
       WHERE test_id = $1
       ORDER BY position ASC`,
      [id]
    );

    if (questions.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found or has no questions' });
    }

    const gradedAnswers: Record<
      string,
      {
        studentAnswer: string;
        isCorrect: boolean;
        feedback: string;
        pointsAwarded: number;
      }
    > = {};

    // Grade all questions; LLM-graded short answers run concurrently
    await Promise.all(
      (questions.rows as Array<{
        id: string;
        position: number;
        qtype: string;
        prompt: string;
        correct_answer: string;
        explanation?: string;
        options?: string;
      }>).map(async (q) => {
        const studentAnswer = answers[q.id];
        let isCorrect = false;
        let feedback = '';
        let pointsAwarded = 0;

        if (q.qtype === 'mcq' || q.qtype === 'true_false') {
          // Deterministic grading
          isCorrect = String(studentAnswer) === String(q.correct_answer);
          pointsAwarded = isCorrect ? 1 : 0;
          feedback = isCorrect ? 'Correct!' : `Correct answer: ${q.correct_answer}`;
        } else if (q.qtype === 'short_answer') {
          // LLM grading
          try {
            const gradeResponse = await callGLMJson<{
              correct: boolean;
              pointsAwarded: number;
              feedback: string;
            }>(
              [
                {
                  role: 'user',
                  content: `Grade this student answer.

Question: ${q.prompt}
Model Answer: ${q.correct_answer}
Student Answer: ${studentAnswer}

Respond with JSON: {
  "correct": true/false,
  "pointsAwarded": 0-1,
  "feedback": "explanation"
}`,
                },
              ],
              { maxTokens: 500 }
            );

            isCorrect = gradeResponse?.correct || false;
            pointsAwarded = gradeResponse?.pointsAwarded || 0;
            feedback = gradeResponse?.feedback || 'See model answer';
          } catch {
            // Fallback for ungradable answer
            isCorrect = false;
            pointsAwarded = 0;
            feedback = `Model answer: ${q.correct_answer}`;
          }
        }

        gradedAnswers[q.id] = {
          studentAnswer: studentAnswer || '',
          isCorrect,
          feedback,
          pointsAwarded,
        };
      })
    );

    const score = Object.values(gradedAnswers).reduce((sum, g) => sum + g.pointsAwarded, 0);

    // Calculate final score as percentage
    const finalScore = (score / questions.rows.length) * 100;

    // Create attempt record
    const attempt = await db.query(
      `INSERT INTO test_attempts (test_id, answers, score, completed_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, test_id, answers, score, started_at, completed_at`,
      [id, JSON.stringify(gradedAnswers), finalScore]
    );

    res.json({
      attempt: attempt.rows[0],
      score: finalScore,
      gradedAnswers,
      totalQuestions: questions.rows.length,
    });
  } catch (error) {
    console.error('Error grading test attempt:', error);
    res.status(500).json({ error: 'Failed to grade test attempt' });
  }
});

// GET /api/practice-tests/:id/attempts
router.get('/:id/attempts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const attempts = await db.query(
      `SELECT id, test_id, score, started_at, completed_at
       FROM test_attempts
       WHERE test_id = $1
       ORDER BY completed_at DESC`,
      [id]
    );
    res.json(attempts.rows);
  } catch (error) {
    console.error('Error fetching test attempts:', error);
    res.status(500).json({ error: 'Failed to fetch test attempts' });
  }
});

export default router;

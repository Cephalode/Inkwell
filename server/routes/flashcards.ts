import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db';
import { callGLMJson } from '../src/llm';
import { collectMaterials } from '../src/materials';
import { runGeneration, updateStatus, checkStale } from '../src/generationPipeline';

const router = Router();

// GET /api/flashcard-decks
router.get('/', async (_req: Request, res: Response) => {
  try {
    const decks = await db.query(
      `SELECT id, title, description, course_id, source, status, error, created_at, updated_at
       FROM flashcard_decks
       ORDER BY updated_at DESC`
    );
    res.json(decks.rows);
  } catch (error) {
    console.error('Error fetching flashcard decks:', error);
    res.status(500).json({ error: 'Failed to fetch flashcard decks' });
  }
});

// GET /api/flashcard-decks/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const deck = await db.query(
      `SELECT id, title, description, course_id, source, status, error, created_at, updated_at
       FROM flashcard_decks WHERE id = $1`,
      [id]
    );

    if (deck.rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const deckRow = deck.rows[0];

    // Staleness guard: a deck stuck in `generating` for longer than the
    // generation timeout is treated as errored (shared implementation).
    if (deckRow.status === 'generating' && checkStale(deckRow)) {
      await updateStatus('flashcard_decks', id, 'error', 'Generation timed out');
      deckRow.status = 'error';
      deckRow.error = 'Generation timed out';
    }

    res.json(deckRow);
  } catch (error) {
    console.error('Error fetching flashcard deck:', error);
    res.status(500).json({ error: 'Failed to fetch flashcard deck' });
  }
});

// POST /api/flashcard-decks
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, course_id, source, config } = req.body;

    const result = await db.query(
      `INSERT INTO flashcard_decks (title, description, course_id, source, config, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, title, description, course_id, source, config, status, created_at, updated_at`,
      [title, description, course_id || null, JSON.stringify(source), JSON.stringify(config)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating flashcard deck:', error);
    res.status(500).json({ error: 'Failed to create flashcard deck' });
  }
});

// DELETE /api/flashcard-decks/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM flashcard_decks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting flashcard deck:', error);
    res.status(500).json({ error: 'Failed to delete flashcard deck' });
  }
});

// POST /api/flashcard-decks/:id/generate
//
// Ported onto the shared `runGeneration` pipeline (US-009). The pipeline owns
// the SSE lifecycle (headers, the six standard events, status transitions,
// disconnect detection, and the headersSent-aware error path). Route-specific
// business logic lives in the callbacks:
//
//   • collectMaterials — resolve the deck's source + gather material units,
//                        then clear any cards left from a previous run
//   • processMaterial — MAP: turn one material unit into flashcards, capped
//                       at a 30-card deck total
//
// Flashcards have no REDUCE/synthesis step, so no `finalize` is supplied.

// Card target for a deck: user-requested count (default 30), hard-capped at 50.
const deckTarget = (config: unknown): number =>
  Math.min(50, Math.max(1, (config as { count?: number } | null)?.count || 30));

router.post('/:id/generate', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  // Resolve the deck up-front so a missing row yields a clean 404 before the
  // SSE stream is opened (the pipeline flushes headers immediately).
  const deck = await db.query(
    'SELECT source, course_id, config FROM flashcard_decks WHERE id = $1',
    [id]
  );

  if (deck.rows.length === 0) {
    return res.status(404).json({ error: 'Deck not found' });
  }

  const { source, course_id, config } = deck.rows[0];
  const maxCards = deckTarget(config);
  const instructions: string = (config as { instructions?: string } | null)?.instructions || '';

  // Running position across the whole deck; shared between collect (reset) and
  // the per-material processing callback.
  let position = 0;

  await runGeneration({
    table: 'flashcard_decks',
    id,
    req,
    res,

    // ── Gather source materials and clear any prior generation's cards ──
    collectMaterials: async () => {
      const materials =
        source.type === 'course'
          ? await collectMaterials({ courseId: course_id })
          : await collectMaterials({ documentIds: source.ids });

      // Replace any cards from a previous generation (only when we have new
      // material to generate from — matches the original empty-source guard).
      if (materials.length > 0) {
        await db.query('DELETE FROM flashcards WHERE deck_id = $1', [id]);
      }

      return materials;
    },

    // ── MAP: generate flashcards for a single material unit ──
    processMaterial: async (material) => {
      // Stop once the requested card count has been reached.
      if (position >= maxCards) return 0;

      // Generate flashcards from material
      let cards: Array<{ front: string; back: string }> = [];

      try {
        const response = await callGLMJson<{ cards: Array<{ front: string; back: string }> }>(
          [
            {
              role: 'user',
              content: `Create flashcard questions and answers from this material. Generate simple, focused cards suitable for learning and memorization.${instructions ? `\n\nSpecial instructions: ${instructions}` : ''}

Material:
${material.text}

Respond with valid JSON: {"cards": [{"front": "question", "back": "answer"}, ...]}`,
            },
          ],
          { maxTokens: 2000 }
        );

        if (response?.cards) {
          cards = response.cards;
        }
      } catch (error) {
        console.error('Error generating flashcards via LLM:', error);
        // Continue with whatever we have
      }

      // Cap total cards across the deck.
      cards = cards.slice(0, Math.max(0, maxCards - position));

      // Insert cards
      for (let i = 0; i < cards.length; i++) {
        await db.query(
          `INSERT INTO flashcards (deck_id, front, back, position)
           VALUES ($1, $2, $3, $4)`,
          [id, cards[i].front, cards[i].back, position + i]
        );
      }

      position += cards.length;
      return cards.length;
    },
  });
});

// GET /api/flashcard-decks/:id/cards
router.get('/:id/cards', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cards = await db.query(
      `SELECT id, deck_id, front, back, position, review_stats, created_at, updated_at
       FROM flashcards
       WHERE deck_id = $1
       ORDER BY position ASC`,
      [id]
    );
    res.json(cards.rows);
  } catch (error) {
    console.error('Error fetching flashcards:', error);
    res.status(500).json({ error: 'Failed to fetch flashcards' });
  }
});

// POST /api/flashcard-decks/cards/:cardId/review
router.post('/cards/:cardId/review', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { correct } = req.body;

    // Get current review stats
    const card = await db.query(
      'SELECT review_stats FROM flashcards WHERE id = $1',
      [cardId]
    );

    if (card.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const stats = card.rows[0].review_stats;
    const updated = {
      timesReviewed: (stats.timesReviewed || 0) + 1,
      timesCorrect: (stats.timesCorrect || 0) + (correct ? 1 : 0),
      lastReviewedAt: new Date().toISOString(),
    };

    // Update card
    const result = await db.query(
      'UPDATE flashcards SET review_stats = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(updated), cardId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating card review:', error);
    res.status(500).json({ error: 'Failed to update card review' });
  }
});

export default router;

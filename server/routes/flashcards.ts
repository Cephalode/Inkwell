import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db';
import { setSSEHeaders, send } from '../src/sse';
import { callGLMJson } from '../src/llm';
import { collectMaterials } from '../src/materials';

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
    const { id } = req.params;
    const deck = await db.query(
      `SELECT id, title, description, course_id, source, status, error, created_at, updated_at
       FROM flashcard_decks WHERE id = $1`,
      [id]
    );

    if (deck.rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const deckRow = deck.rows[0];

    // Check staleness: if generating for > 10 min, report error
    if (deckRow.status === 'generating') {
      const updatedAt = new Date(deckRow.updated_at);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (updatedAt < tenMinutesAgo) {
        await db.query(
          `UPDATE flashcard_decks SET status = $1, error = $2, updated_at = NOW()
           WHERE id = $3`,
          ['error', 'Generation timed out', id]
        );
        return res.status(200).json({
          ...deckRow,
          status: 'error',
          error: 'Generation timed out',
        });
      }
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
    const { title, description, course_id, source } = req.body;

    const result = await db.query(
      `INSERT INTO flashcard_decks (title, description, course_id, source, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, title, description, course_id, source, status, created_at, updated_at`,
      [title, description, course_id || null, JSON.stringify(source)]
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
router.post('/:id/generate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if deck exists and update to generating
    const deck = await db.query(
      'SELECT source, course_id FROM flashcard_decks WHERE id = $1',
      [id]
    );

    if (deck.rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const { source, course_id } = deck.rows[0];

    // Update status to generating
    await db.query(
      'UPDATE flashcard_decks SET status = $1, error = NULL, updated_at = NOW() WHERE id = $2',
      ['generating', id]
    );

    // Set up SSE
    setSSEHeaders(res);

    // Collect materials based on source
    let materials;
    try {
      materials =
        source.type === 'course'
          ? await collectMaterials({ courseId: course_id })
          : await collectMaterials({ documentIds: source.ids });
    } catch (error) {
      console.error('Error collecting materials:', error);
      send(res, {
        type: 'error',
        message: 'Failed to collect materials',
      });
      await db.query(
        'UPDATE flashcard_decks SET status = $1, error = $2, updated_at = NOW() WHERE id = $3',
        ['error', 'Failed to collect materials', id]
      );
      res.end();
      return;
    }

    if (materials.length === 0) {
      send(res, { type: 'error', message: 'No materials found for this source' });
      await db.query(
        'UPDATE flashcard_decks SET status = $1, error = $2, updated_at = NOW() WHERE id = $3',
        ['error', 'No materials found for this source', id]
      );
      res.end();
      return;
    }

    send(res, { type: 'materials_collected', count: materials.length });

    // Replace any cards from a previous generation
    await db.query('DELETE FROM flashcards WHERE deck_id = $1', [id]);

    // MAP: Generate flashcards for each material
    const maxCards = 30;
    let position = 0;
    for (const material of materials) {
      if (position >= maxCards) break;

      // Send start event
      send(res, {
        type: 'material_start',
        material: { id: material.documentId, title: material.title },
      });

      // Generate flashcards from material
      let cards: Array<{ front: string; back: string }> = [];

      try {
        const response = await callGLMJson<{ cards: Array<{ front: string; back: string }> }>(
          [
            {
              role: 'user',
              content: `Create flashcard questions and answers from this material. Generate simple, focused cards suitable for learning and memorization.

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
        // Continue with what we have
      }

      // Cap total cards
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

      send(res, {
        type: 'material_result',
        material: { id: material.documentId },
        cardCount: cards.length,
      });

      // Check if client closed connection
      if (req.closed) {
        break;
      }
    }

    // REDUCE: Persist final status
    send(res, { type: 'synthesizing' });

    // Update status to done
    await db.query(
      'UPDATE flashcard_decks SET status = $1, updated_at = NOW() WHERE id = $2',
      ['done', id]
    );

    send(res, { type: 'done', deckId: id, cardCount: position });
    res.end();
  } catch (error) {
    console.error('Error generating flashcards:', error);
    const deckId = req.params.id;
    await db.query(
      'UPDATE flashcard_decks SET status = $1, error = $2, updated_at = NOW() WHERE id = $3',
      ['error', String(error), deckId]
    ).catch((err) => console.error('Error persisting failure status:', err));
    // SSE headers may already be flushed; a 500 JSON body would corrupt the stream
    if (res.headersSent) {
      send(res, { type: 'error', message: 'Failed to generate flashcards' });
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to generate flashcards' });
    }
  }
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

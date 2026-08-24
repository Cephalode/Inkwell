import { Router } from 'express';
import pool from '../db.js';
import { findVideosForAnalysis, type ChapterVideos } from '../src/videoFinder.js';
import { send, setSSEHeaders } from '../src/sse.js';

const router = Router();

interface AnalysisRow {
  analysis: {
    subsections: { title: string; summary: string; keyPoints: string[]; definitions: string[] }[];
  } | null;
  videos: ChapterVideos | null;
}

router.get('/chapters/:id/videos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT videos FROM documents WHERE id = $1', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const videos = (rows[0] as { videos: ChapterVideos | null }).videos;
    if (!videos) {
      return res.json(null);
    }
    res.json(videos);
  } catch (err: unknown) {
    console.error('Error fetching chapter videos:', err);
    res.status(500).json({ error: 'Failed to fetch chapter videos' });
  }
});

router.post('/chapters/:id/find-videos', async (req, res) => {
  setSSEHeaders(res);

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const fail = (message: string) => {
    if (!closed) send(res, { type: 'error', message });
    res.end();
  };

  try {
    const { id } = req.params;

    const { rows } = await pool.query<AnalysisRow>(
      'SELECT analysis, videos FROM documents WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return fail('Chapter not found');
    const analysis = rows[0].analysis;
    if (!analysis) return fail('Run the chapter analysis first');

    const cached = rows[0].videos;
    if (cached) {
      send(res, { type: 'done', cached: true, ...cached });
      return res.end();
    }

    send(res, { type: 'status', message: 'Finding videos…' });
    const videos = await findVideosForAnalysis(analysis, (payload) => send(res, payload));

    await pool.query('UPDATE documents SET videos = $1::jsonb, updated_at = now() WHERE id = $2', [
      JSON.stringify(videos),
      id,
    ]);

    send(res, { type: 'done', ...videos });
    res.end();
  } catch (err: unknown) {
    console.error('Chapter video finder error:', err);
    const message = err instanceof Error ? err.message : String(err);
    fail(message);
  }
});

export default router;

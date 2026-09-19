// Selection read-aloud endpoint — single-phrase TTS, reuses the podcast's edge-tts `speak()`.
import { Router, type Request, type Response } from 'express';
import { speak } from '../src/tts.js';

const router = Router();

// Cap at 5000 chars ≈ ~5 min of audio. Selection reads are short; this is a
// trust-boundary cap, not a feature limit.
const MAX_CHARS = 5000;

// ponytail: no cache — keyless edge-tts costs nothing and takes ~0.5s per
// synthesized second; add a sha256(text+voice) storage cache only if latency bites.
router.post('/tts', async (req: Request, res: Response) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > MAX_CHARS) {
    return res.status(413).json({ error: `text too long (max ${MAX_CHARS} chars)` });
  }
  const voice = 'en-US-AndrewNeural'; // podcast host voice; matches the app's audio identity
  try {
    const mp3 = await speak(text, voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3.length));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(mp3);
  } catch (err) {
    console.error('TTS synthesis failed:', err);
    if (!res.headersSent) res.status(502).json({ error: 'TTS synthesis failed' });
  }
});

export default router;

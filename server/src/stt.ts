/**
 * Speech-to-text via OpenRouter (POST /api/v1/audio/transcriptions).
 *
 * Uses the same OPENROUTER_API_KEY that other tooling on this host already
 * uses. Media documents (audio/video) currently settle the whole AI chain to
 * 'skipped' with no parsed_text; this module lets them join it: upload →
 * transcribe → PATCH parsed_text → classify (and the summary/podcast chain).
 *
 * Limits (OpenRouter docs, verified live 2026-10):
 *   • formats: wav, mp3, flac, m4a, ogg, webm, aac (mp4/mov NOT supported —
 *     callers must extract/convert or skip)
 *   • ~25 MB payload ceiling, ~60s upstream processing timeout
 *   • response: { text, usage?: { seconds, cost, ... } }
 */

const OPENROUTER_STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';

/** Container formats the STT endpoint accepts (lowercased, no dot). */
export const STT_AUDIO_FORMATS = new Set(['wav', 'mp3', 'flac', 'm4a', 'ogg', 'oga', 'webm', 'aac', 'opus']);

export interface SttResult {
  text: string;
  seconds?: number;
  cost?: number;
}

function apiKey(): string | undefined {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    const { resolve, dirname } = require('path') as typeof import('path');
    const { fileURLToPath } = require('url') as typeof import('url');
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.hermes/.env');
    return readFileSync(envPath, 'utf-8').match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
}

/**
 * Transcribe audio bytes. Throws with a short, user-presentable message on
 * unsupported formats / missing key / upstream failure.
 */
export async function transcribeAudio(
  data: Buffer,
  format: string,
  opts: { language?: string } = {},
): Promise<SttResult> {
  const fmt = format.toLowerCase().replace(/^\./, '');
  if (!STT_AUDIO_FORMATS.has(fmt)) {
    throw new Error(`Transcription does not support .${fmt} (try m4a, mp3, wav, aac, ogg, or webm)`);
  }
  if (data.length > 25 * 1024 * 1024) {
    throw new Error('Audio is larger than the 25 MB transcription limit');
  }
  const key = apiKey();
  if (!key) throw new Error('Transcription unavailable (no OPENROUTER_API_KEY configured)');

  const resp = await fetch(OPENROUTER_STT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/whisper-1',
      input_audio: { data: data.toString('base64'), format: fmt },
      ...(opts.language ? { language: opts.language } : {}),
    }),
  });

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 200);
    throw new Error(`Transcription failed (${resp.status}): ${detail}`);
  }
  const body = (await resp.json()) as { text?: string; usage?: { seconds?: number; cost?: number } };
  return {
    text: (body.text ?? '').trim(),
    seconds: body.usage?.seconds,
    cost: body.usage?.cost,
  };
}

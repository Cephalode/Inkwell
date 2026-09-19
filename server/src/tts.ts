// Edge TTS (msedge-tts) — keyless, free Microsoft Edge neural voices.
// Single new connection per segment (cheapest safe way to swap voices).
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export interface DialogLine {
  speaker: 'host' | 'guest';
  text: string;
}

const HOST_VOICE = 'en-US-AndrewNeural';
const GUEST_VOICE = 'en-US-AvaNeural';

/** Synthesize one line of speech to MP3 bytes. */
export async function speak(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text);
  const chunks: Buffer[] = [];
  for await (const c of audioStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Synthesize a dialogue to a single MP3 (concatenated MPEG frames —
 * every browser/player decodes a plain concatenation of same-format MP3s).
 */
export async function synthesizeDialog(lines: DialogLine[]): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const line of lines) {
    const voice = line.speaker === 'host' ? HOST_VOICE : GUEST_VOICE;
    parts.push(await speak(line.text, voice));
  }
  return Buffer.concat(parts);
}

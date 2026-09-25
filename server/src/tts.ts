// Edge TTS (msedge-tts) — keyless, free Microsoft Edge neural voices.
// Single new connection per segment (cheapest safe way to swap voices).
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export interface DialogLine {
  speaker: 'host' | 'guest';
  text: string;
}

const HOST_VOICE = 'en-US-AndrewNeural';
const GUEST_VOICE = 'en-US-AvaNeural';

/**
 * Split long text into ≤600-char sentence-ish chunks. One giant request makes
 * Edge's websocket drop before turn.end (prod 502 on select-all, 2026-09-21).
 * Podcast lines are short → single chunk, unchanged behavior.
 */
function chunkText(text: string, max = 600): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = '';
  for (const s of text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) ?? [text]) {
    const pieces =
      s.length > max
        ? (s.match(new RegExp(`[\\s\\S]{1,${max}}(?:\\s|$)`, 'g')) ?? [s])
        : [s];
    for (const piece of pieces) {
      if (cur && cur.length + piece.length > max) {
        out.push(cur.trim());
        cur = '';
      }
      cur += piece;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length > 0 ? out : [text];
}

/** Synthesize one WS request of speech to MP3 bytes. Escapes XML (msedge-tts
 * interpolates text raw into SSML — unescaped &/< kill the socket) and retries
 * the sporadic mid-synthesis websocket drops. `words` enables word-boundary
 * metadata, returned as {t seconds, w word} relative to this request. */
async function speakOne(text: string, voice: string, words = false): Promise<{ audio: Buffer; marks: WordMark[] }> {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (let attempt = 0; ; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: words,
        sentenceBoundaryEnabled: false,
      });
      const { audioStream, metadataStream } = await tts.toStream(esc);
      const chunks: Buffer[] = [];
      const metas: Buffer[] = [];
      // ponytail: regex over the joined metadata stream — one JSON object per
      // Edge message, but chunks can coalesce; per-object JSON.parse is brittle.
      if (words && metadataStream) metadataStream.on('data', (d) => metas.push(d as Buffer));
      for await (const c of audioStream) chunks.push(c as Buffer);
      const marks: WordMark[] = [];
      if (words) {
        const joined = Buffer.concat(metas).toString();
        for (const m of joined.matchAll(/"Offset":\s*(\d+)[\s\S]{0,250}?"Text":\s*"((?:[^"\\]|\\.)*)"/g)) {
          marks.push({ t: Number(m[1]) / 1e7, w: m[2] }); // Offset is 100ns ticks
        }
      }
      return { audio: Buffer.concat(chunks), marks };
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

export interface WordMark {
  /** Seconds from the start of THIS text. */
  t: number;
  w: string;
}

/** Synthesize speech to MP3 bytes. Long text is chunked (chunkText) and the
 *  same-format MP3 frames concatenated — players decode that fine. */
export async function speak(text: string, voice: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const chunk of chunkText(text)) parts.push((await speakOne(chunk, voice)).audio);
  return Buffer.concat(parts);
}

/** speak() + word marks rebased to the start of the whole text. Byte→time is
 * exact: 48kbps mono = 6000 bytes/s, and MP3 frames are fixed-duration. */
export async function speakWords(text: string, voice: string): Promise<{ audio: Buffer; marks: WordMark[] }> {
  const audios: Buffer[] = [];
  const marks: WordMark[] = [];
  let base = 0;
  for (const chunk of chunkText(text)) {
    const r = await speakOne(chunk, voice, true);
    audios.push(r.audio);
    for (const m of r.marks) marks.push({ t: m.t + base, w: m.w });
    base += r.audio.length / 6000;
  }
  return { audio: Buffer.concat(audios), marks };
}

/**
 * Synthesize a dialogue to a single MP3 (concatenated MPEG frames —
 * every browser/player decodes a plain concatenation of same-format MP3s).
 */
export async function synthesizeDialog(lines: DialogLine[]): Promise<Buffer> {
  return (await synthesizeDialogWithOffsets(lines)).audio;
}

export interface DialogSegment {
  speaker: 'host' | 'guest';
  text: string;
  /** Seconds into the episode where this line's audio begins. */
  startS: number;
  /** Duration of this line's audio in seconds. */
  durationS: number;
}

/**
 * v2: same per-line synthesis, but track each line's byte length so the
 * section/line start timestamps can be computed. MP3 (48kbps mono) frames
 * are fixed-duration, so seconds = bytes / (48000/8).
 */
export async function synthesizeDialogWithOffsets(lines: DialogLine[]): Promise<{
  audio: Buffer;
  segments: DialogSegment[];
}> {
  const parts: Buffer[] = [];
  const segments: DialogSegment[] = [];
  let offsetS = 0;
  for (const line of lines) {
    const voice = line.speaker === 'host' ? HOST_VOICE : GUEST_VOICE;
    const buf = await speak(line.text, voice);
    const durationS = buf.length / (48000 / 8);
    segments.push({ speaker: line.speaker, text: line.text, startS: offsetS, durationS });
    offsetS += durationS;
    parts.push(buf);
  }
  return { audio: Buffer.concat(parts), segments };
}

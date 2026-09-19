// One smoke check for SelectionTTS + /api/tts — needs `npx tsx server/index.ts` on :3002.
// Runs the route end-to-end (the route is pure logic; the floating menu is plain DOM events).
import { speak } from '../src/tts.js';

const text = 'Smoke check.';
const mp3 = await speak(text, 'en-US-AndrewNeural');
if (mp3.length < 1000 || mp3[0] !== 0xff || (mp3[1] & 0xe0) !== 0xe0) {
  throw new Error(`bad MP3: ${mp3.length} bytes, magic ${mp3[0].toString(16)}${mp3[1].toString(16)}`);
}
console.log(`ok — speak() -> ${mp3.length} bytes of MPEG audio`);

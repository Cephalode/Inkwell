/** Duolingo-style answer feedback sounds — tiny stdlib-generated WAVs in
 *  /public/sfx. Fire-and-forget: play() promises are deliberately unhandled
 *  (autoplay-blocked or rapid re-picks must never throw into the UI). */

let correct: HTMLAudioElement | null = null;
let wrong: HTMLAudioElement | null = null;

function clip(src: string): HTMLAudioElement {
  const a = new Audio(src);
  a.volume = 0.5;
  return a;
}

export function playCorrect() {
  correct ??= clip('/sfx/correct.wav');
  correct.currentTime = 0;
  void correct.play().catch(() => {});
}

export function playWrong() {
  wrong ??= clip('/sfx/wrong.wav');
  wrong.currentTime = 0;
  void wrong.play().catch(() => {});
}

// Read-any-selection TTS — Turbo.ai-style. Text selection → floating [Listen] menu → server TTS (edge-tts, keyless).
// Playback lives in a bottom-anchored bar that slides up while loading/playing.
// This file intentionally mixes the <SelectionTTS/> component with the speak
// engine's exported helpers (stopSpeak/speakAll/currentWordIndex) — LessonRunner
// consumes them directly. A clean split needs a playback-state refactor; until
// then, silence the fast-refresh rule rather than thread state through props.
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { HiPlay, HiPause, HiStop, HiXMark, HiExclamationTriangle, HiSpeakerWave, HiChatBubbleLeftRight } from 'react-icons/hi2';
import Spinner from './Spinner';
import { buildSpeakable, chunkSpeechText } from '../../utils/speechText';
import { useChatStore } from '../../store/chatStore';

const API_BASE: string =
  typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

// ponytail: one module-level audio element, swap src per play. One voice, no
// seek/volume/rate UI; add them only if users ask.
let audio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    // Expose for tests/smoke (document.querySelector('audio') never finds it).
    (window as unknown as { __ttsAudio?: HTMLAudioElement }).__ttsAudio = audio;
  }
  return audio;
}

/** Stop playback and drop any in-flight download. */
export function stopSpeak(): void {
  const a = getAudio();
  a.pause();
  a.removeAttribute('src');
  a.load();
  progressState = { phase: 'idle', partsDone: 0, partsTotal: 0 };
  emitProgress();
}

/** Word timing from the server: t = seconds into this chunk's audio. */
export interface WordMark {
  t: number;
  w: string;
}

/** POST the text to /api/tts. Default: raw MP3 bytes. With Accept: json, the
 * server enables edge-tts word boundaries and returns
 * {audio: base64 mp3, marks: [{t, w}]} — timestamps for the karaoke highlight. */
async function fetchTts(text: string, words = false): Promise<{ bytes: Uint8Array; marks: WordMark[] }> {
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(words ? { Accept: 'application/json' } : {}) },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS failed (${res.status})`);
  if (!words) return { bytes: new Uint8Array(await res.arrayBuffer()), marks: [] };
  const j = (await res.json()) as { audio: string; marks: WordMark[] };
  // ponytail: atob loop — fine at a few MB, drop it if it ever shows a profile
  const bin = atob(j.audio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, marks: j.marks };
}

// ponytail: module-level — LessonRunner reads it per-render, events keep the
// bar alive even when this module's React tree is torn down mid-speech.
let activeWord: number | null = null;
let audioMarks: WordMark[] = [];
let rafId = 0;

/** Progress signal for long reads (lesson Listen): fires on every audio
 * state change with {phase, partsDone, partsTotal}. phase: 'generating' |
 * 'playing' | 'idle'. Fetch ordering makes done counts monotonic. */
export interface SpeakProgress {
  phase: 'generating' | 'playing' | 'idle';
  partsDone: number;
  partsTotal: number;
}
let progressState: SpeakProgress = { phase: 'idle', partsDone: 0, partsTotal: 0 };
const emitProgress = () => window.dispatchEvent(new Event('tts-progress'));
/** Subscribe to read-aloud progress. Returns the unsubscribe fn. */
export function onSpeakProgress(cb: (p: SpeakProgress) => void): () => void {
  const h = () => cb(progressState);
  window.addEventListener('tts-progress', h);
  cb(progressState); // sync current state on subscribe
  return () => window.removeEventListener('tts-progress', h);
}

/** Word index currently being spoken, if any. */
export function currentWordIndex(): number | null {
  return activeWord;
}

function wordIndexAt(a: HTMLAudioElement): number | null {
  if (!audioMarks.length || a.paused) return activeWord && a.paused ? activeWord : null;
  const t = a.currentTime;
  let lo = 0;
  let hi = audioMarks.length - 1;
  let hit: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (audioMarks[mid].t <= t) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit;
}

function startWordRaf(a: HTMLAudioElement) {
  stopWordRaf();
  const tick = () => {
    const idx = wordIndexAt(a);
    if (idx !== activeWord) {
      activeWord = idx;
      window.dispatchEvent(new Event('tts-word'));
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopWordRaf() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function clearWordTracking() {
  stopWordRaf();
  audioMarks = [];
  if (activeWord !== null) {
    activeWord = null;
    window.dispatchEvent(new Event('tts-word'));
  }
}

/** Speak pre-chunked text: fetch each chunk, concatenate the MP3s (MP3 frames
 * concat cleanly — same trick as the podcast pipeline), play as ONE audio so
 * the bar's scrubber covers the whole read. Marks (when fetched) are rebased
 * per chunk byte-length before merging. Fetches SEQUENTIALLY and emits
 * 'tts-progress' after each part so long reads show N/M generation progress
 * (ponytail: serial instead of parallel — the latency cost is progress
 * visibility; parallel + monotonic counting needs in-flight tracking). */
export async function speakAll(chunks: string[], words = false): Promise<void> {
  stopSpeak(); // one voice at a time — a new read always replaces the old
  clearWordTracking();
  progressState = { phase: 'generating', partsDone: 0, partsTotal: chunks.length };
  emitProgress();
  const parts: { bytes: Uint8Array; marks: WordMark[] }[] = [];
  for (const c of chunks) {
    parts.push(await fetchTts(c, words));
    progressState = { ...progressState, partsDone: parts.length };
    emitProgress();
  }
  const total = parts.reduce((n, p) => n + p.bytes.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  audioMarks = [];
  for (const p of parts) {
    if (words) for (const m of p.marks) audioMarks.push({ t: m.t + off / 6000, w: m.w });
    merged.set(p.bytes, off);
    off += p.bytes.byteLength;
  }
  const a = getAudio();
  a.src = URL.createObjectURL(new Blob([merged], { type: 'audio/mpeg' }));
  if (audioMarks.length) startWordRaf(a);
  progressState = { phase: 'playing', partsDone: parts.length, partsTotal: parts.length };
  emitProgress();
  await a.play();
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Global selection listener. On mouseup/keyup with a non-empty selection,
 * floats a [Listen] button at the selection rect (Turbo.ai-style).
 * Mounted once in App — covers every page.
 */
export default function SelectionTTS() {
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bar, setBar] = useState<{ text: string } | null>(null); // what the bottom bar shows
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [scrubbing, setScrubbing] = useState(false);
  const pillPos = useRef({ x: -9999, y: -9999 });
  if (menu) { pillPos.current = { x: menu.x, y: Math.max(menu.y, 8) }; }
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const a = getAudio();
    const onPlay = () => { setSpeaking(true); setLoading(false); setPaused(false); };
    const onPause = () => { setSpeaking(false); setPaused(true); };
    const onEnded = () => { setSpeaking(false); setLoading(false); setPaused(false); setBar(null); clearWordTracking(); progressState = { phase: 'idle', partsDone: 0, partsTotal: 0 }; emitProgress(); };
    const onTime = () => { if (!scrubbing) setTime({ cur: a.currentTime, dur: a.duration || 0 }); };
    const onEmptied = () => { stopWordRaf(); }; // stop/replace drops the element's source
    const onSeeked = () => {
      if (!audioMarks.length) return;
      activeWord = wordIndexAt(a);
      window.dispatchEvent(new Event('tts-word'));
    };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('emptied', onEmptied);
    a.addEventListener('seeked', onSeeked);

    const show = () => {
      // A menu-button click collapses the selection before mouseup fires —
      // keep the current menu if the pointer is on it.
      if (rootRef.current?.matches(':hover')) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!sel || text.length === 0) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setMenu(null), 150); // grace period to reach the button
        return;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current); // a fresh selection outranks a pending hide (fast multi-click)
      if (text.length > 5000) return; // server caps at 5000 anyway
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setMenu({
        x: Math.min(rect.left + rect.width / 2, window.innerWidth - 60),
        y: rect.top - 44,
        text,
      });
    };
    // Pointer went down OUTSIDE the pill: that's a new selection starting —
    // drop the menu. Downs on the pill itself are ignored, otherwise the
    // button unmounts mid-click and onClick never fires (the disappear/reappear
    // bug). pillRef covers both buttons; composeRef collects any child element.
    const onHide = (e: Event) => {
      if (e instanceof MouseEvent && rootRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };

    document.addEventListener('mouseup', show);
    document.addEventListener('keyup', show);
    document.addEventListener('mousedown', onHide);
    window.addEventListener('scroll', onHide, true);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('emptied', onEmptied);
      a.removeEventListener('seeked', onSeeked);
      document.removeEventListener('mouseup', show);
      document.removeEventListener('keyup', show);
      document.removeEventListener('mousedown', onHide);
      window.removeEventListener('scroll', onHide, true);
      stopSpeak();
    };
    // ponytail: scrubbing in deps — timeupdate skips updates only while dragging
  }, [scrubbing]);

  const listen = async () => {
    if (!menu) return;
    const { text } = menu;
    setMenu(null); // selection is gone — keep the pill anchored where it was
    setError(null);
    setLoading(true);
    setBar({ text });
    setTime({ cur: 0, dur: 0 });
    try {
      await speakAll([text]); // 'play' event flips loading→speaking
    } catch (err) {
      console.error('SelectionTTS:', err);
      setLoading(false);
      setSpeaking(false);
      setBar(null);
      setError(err instanceof Error ? err.message : 'Could not read the selected text');
      setTimeout(() => setError(null), 4000);
    }
  };

  const togglePause = () => {
    const a = getAudio();
    if (a.paused) void a.play();
    else a.pause();
  };

  /** "Send to AI": open the chat with the selection attached as a FOCUS — the
   * reference tells the AI what to look at; the page itself (step + activity
   * content) rides along in the system prompt as the real context. */
  const sendToAi = () => {
    if (!menu) return;
    useChatStore.getState().addFocus(menu.text);
    useChatStore.getState().open();
    setMenu(null);
  };

  const pct = time.dur > 0 ? (time.cur / time.dur) * 100 : 0;
  const barVisible = (loading || speaking || paused) && bar !== null;

  return (
    <>
      <div
        ref={rootRef}
        className="fixed z-[9999]"
        style={{ left: menu ? menu.x : pillPos.current.x, top: menu ? Math.max(menu.y, 8) : pillPos.current.y }}
      >
        {menu && (
          <div className="flex -translate-x-1/2 items-center gap-1">
            <button
              onMouseDown={(e) => e.preventDefault()} // don't collapse the selection
              onClick={listen}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-neutral-300)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-md)] hover:bg-[var(--color-neutral-200)]"
              title="Read aloud"
            >
              <HiSpeakerWave className="h-4 w-4 text-[var(--color-accent)]" />
              Listen
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={sendToAi}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-neutral-300)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-md)] hover:bg-[var(--color-neutral-200)]"
              title="Ask the AI about this"
            >
              <HiChatBubbleLeftRight className="h-4 w-4 text-[var(--color-accent)]" />
              Send to AI
            </button>
          </div>
        )}
        {error && !loading && (
          <div
            className={`flex -translate-x-1/2 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm shadow-[var(--shadow-md)] ${menu ? 'mt-1' : ''}`}
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 35%, transparent)',
              background: 'color-mix(in srgb, var(--color-danger) 12%, var(--color-surface))',
              color: 'var(--color-danger)',
            }}
            role="alert"
          >
            <HiExclamationTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Bottom playback bar — slides up while loading/playing, hidden when idle */}
      <div
        className="fixed inset-x-0 bottom-0 z-[9998] transition-transform duration-300 ease-out"
        style={{ transform: barVisible ? 'translateY(0)' : 'translateY(calc(100% + 12px))' }}
        aria-hidden={!barVisible}
      >
        <div className="mx-auto mb-3 flex w-[min(680px,calc(100%-2rem))] items-center gap-3 rounded-lg border border-[var(--color-neutral-300)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-lg)]">
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <button
              onClick={togglePause}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white hover:opacity-90"
              title={paused ? 'Resume' : 'Pause'}
            >
              {paused ? <HiPlay className="h-4 w-4" /> : <HiPause className="h-4 w-4" />}
            </button>
          )}

          <span className="w-10 shrink-0 text-right tabular-nums opacity-70">{fmt(time.cur)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(time.dur, 0.1)}
            step={0.1}
            value={Math.min(time.cur, time.dur || 0)}
            disabled={!speaking || time.dur === 0}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={(e) => {
              const a = getAudio();
              const t = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(t)) a.currentTime = t;
              setScrubbing(false);
            }}
            className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full disabled:animate-pulse disabled:cursor-default"
            style={{
              background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-neutral-300) ${pct}%)`,
            }}
            aria-label="Seek"
          />
          <span className="w-10 shrink-0 tabular-nums opacity-70">
            {time.dur > 0 ? fmt(time.dur) : '--:--'}
          </span>

          {speaking && (
            <button
              onClick={() => { stopSpeak(); setSpeaking(false); setPaused(false); setBar(null); clearWordTracking(); }}
              className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-neutral-300)] px-2.5 py-1 hover:bg-[var(--color-neutral-200)]"
              title="Stop reading"
            >
              <HiStop className="h-3.5 w-3.5 text-[var(--color-accent-2-700)]" />
              Stop
            </button>
          )}
          <button
            onClick={() => { stopSpeak(); setSpeaking(false); setPaused(false); setLoading(false); setBar(null); clearWordTracking(); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-60 hover:opacity-100"
            title="Dismiss"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}



// ── Karaoke highlight: paint the currently-spoken word ─────────────────────
// Speech words and DOM words differ (math becomes spoken words, code is
// dropped), so alignment runs on the longest common word sequence between
// buildSpeakable(source) and the container's rendered words. Painting uses
// the CSS Custom Highlight API — zero DOM mutation, React never notices.

interface TtsNodeInfo {
  tn: Text;
  words: { start: number; len: number }[];
}

/** Collect text nodes under el with their word offsets, in document order. */
function collectTtsNodes(el: Element): TtsNodeInfo[] {
  const out: TtsNodeInfo[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        const words = Array.from(text.matchAll(/\S+/g)).map((m) => ({ start: m.index!, len: m[0].length }));
        if (words.length) out.push({ tn: child as Text, words });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
  return out;
}

/** Normalize a word for comparison: NFKD (KaTeX combining marks fold away),
 * strip non-alphanumerics, lowercase. */
function normWord(w: string): string {
  return w.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

/** Longest-common-subsequence alignment: map[domWordIdx] = speechWordIdx | null.
 * ponytail: O(n·m) DP table (≤ ~10M cells, then bails to no-highlight) —
 * runs once per read, not per word. Exported for the self-check below. */
export function alignWords(speech: string[], dom: string[]): (number | null)[] {
  const map: (number | null)[] = new Array(dom.length).fill(null);
  const n = speech.length;
  const m = dom.length;
  if (!n || !m || n * m > 10_000_000) return map;
  const a = speech.map(normWord);
  const b = dom.map(normWord);
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const ai = a[i];
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ai && ai === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) {
      map[j] = i;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

interface TtsMapState {
  bySpeech: Map<number, { tn: Text; start: number; len: number }>;
}

/** Map every speech word index to its DOM (text node, char range), or null. */
function buildTtsMap(container: HTMLElement, source: string): TtsMapState {
  const nodes = collectTtsNodes(container);
  const domWords: string[] = [];
  for (const n of nodes) for (const w of n.words) domWords.push(n.tn.data.substr(w.start, w.len));
  const speech = Array.from(buildSpeakable(source).matchAll(/\S+/g)).map((m) => m[0]);
  const map = alignWords(speech, domWords);
  const bySpeech = new Map<number, { tn: Text; start: number; len: number }>();
  let j = 0;
  for (const n of nodes) {
    for (const w of n.words) {
      const s = map[j];
      if (s !== null && !bySpeech.has(s)) bySpeech.set(s, { tn: n.tn, start: w.start, len: w.len });
      j++;
    }
  }
  return { bySpeech };
}

const HL_NAME = 'tts-active';

function clearTtsHighlight(): void {
  window.CSS?.highlights?.delete(HL_NAME);
}

/** React hook: while enabled, highlight the word being spoken inside the
 * container element and keep it in view. No-ops on browsers without the
 * CSS Custom Highlight API. */
export function useSpokenWord(
  containerRef: RefObject<HTMLElement | null>,
  source: string,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !containerRef.current || !window.CSS?.highlights) return;
    const state = buildTtsMap(containerRef.current, source);
    const paint = () => {
      const idx = currentWordIndex();
      const hit = idx === null ? undefined : state.bySpeech.get(idx);
      if (!hit || !hit.tn.isConnected) {
        clearTtsHighlight();
        return;
      }
      const r = document.createRange();
      r.setStart(hit.tn, hit.start);
      r.setEnd(hit.tn, hit.start + hit.len);
      window.CSS.highlights.set(HL_NAME, new Highlight(r));
      const rect = r.getBoundingClientRect();
      if (rect.height && (rect.top < 72 || rect.bottom > window.innerHeight - 72)) {
        hit.tn.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    window.addEventListener('tts-word', paint);
    return () => {
      window.removeEventListener('tts-word', paint);
      clearTtsHighlight();
    };
  }, [containerRef, source, enabled]);
}

// Self-check: npx tsx src/components/shared/SelectionTTS.tsx — exercises the
// LCS alignment in isolation (DOM collection/painting need a real browser;
// covered by the live smoke test instead).
if (typeof process !== 'undefined' && process.argv[1]?.includes('SelectionTTS')) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`FAIL: ${msg}`);
    console.log(`ok: ${msg}`);
  };
  // Exact match, no noise: identity map.
  const m1 = alignWords(['the', 'cat', 'sat'], ['the', 'cat', 'sat']);
  assert(JSON.stringify(m1) === '[0,1,2]', 'identity alignment');
  // Extra DOM words around a match (markdown markers stripped from speech).
  const m2 = alignWords(['cat', 'sat'], ['**', 'the', 'cat', 'sat', '**']);
  assert(m2[2] === 0 && m2[3] === 1, 'match survives DOM padding');
  // Speech-only words (math → spoken) must map to nothing.
  const m3 = alignWords(['x', 'squared', 'plus', 'one'], ['x', '+', 'one']);
  assert(m3[0] === 0 && m3[2] === 3, 'speech extras skipped');
  // Punctuation differs (speech "squared" vs DOM "squared."): norm strips it.
  assert(normWord('Squared.') === normWord('squared'), 'normalization folds case/punct');
  // Diacritics (KaTeX combining marks) fold: x̃ === x.
  assert(normWord('x\u0303') === normWord('x'), 'combining marks fold');
  // Empty inputs never crash.
  assert(alignWords([], ['a']).every((v) => v === null), 'empty speech → all null');
  assert(alignWords(['a'], []).length === 0, 'empty dom → empty map');
  // LCS prefers in-order matches over greedy grabs.
  const m4 = alignWords(['a', 'b'], ['b', 'a', 'b']);
  assert(m4[1] === 0 && m4[2] === 1, 'in-order preference');
  console.log('all SelectionTTS alignment checks passed');
}

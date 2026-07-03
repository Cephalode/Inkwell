import { create } from 'zustand';

/**
 * Strip markdown formatting from text so it reads naturally when spoken aloud.
 * Removes code fences, inline code, links, images, headings, bold/italic,
 * strikethrough, blockquotes, list markers, and tables; collapses whitespace.
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    // Fenced code blocks ```lang\n...\n```  → keep inner text, drop fence
    .replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => code.replace(/\n/g, ' '))
    // Inline code `code`
    .replace(/`([^`]+)`/g, '$1')
    // Images ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Reference-style links leftovers [text]
    .replace(/\[([^\]]+)\]/g, '$1')
    // ATX headings: leading #'s
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // Setext headings underlines (=== / ---) on their own line
    .replace(/^\s{0,3}=+\s*$/gm, '')
    // Bold + italic markers **text** __text__ *text* _text_
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
    // Strikethrough ~~text~~
    .replace(/~~([^~]+)~~/g, '$1')
    // Blockquote markers >
    .replace(/^\s{0,3}>\s?/gm, '')
    // Horizontal rules --- / *** / ___
    .replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '')
    // Unordered list markers (- * +) at line start
    .replace(/^\s*[-*+]\s+/gm, '')
    // Ordered list markers (1. 2. ) at line start
    .replace(/^\s*\d+\.\s+/gm, '')
    // Tables — turn pipes into spaces, drop separator rows (| --- |)
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, (line) =>
      /^\s*\|[\s:|-]+\|\s*$/.test(line) ? '' : line.replace(/\|/g, ' '),
    )
    .replace(/\|/g, ' ')
    // Collapse runs of whitespace; sentence-separate hard line breaks
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    // Tidy doubled punctuation / spacing introduced above
    .replace(/\s*\.\s*\.\s*/g, '. ')
    .replace(/\.\.\./g, '.')
    .trim();
}

/** Choose a sensible default voice (prefers high-quality English voices). */
function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (en.length === 0) return voices[0];
  const preferred = ['Samantha', 'Google US English', 'Microsoft Aria', 'Alex', 'Daniel', 'Karen'];
  for (const name of preferred) {
    const match = en.find((v) => v.name.includes(name));
    if (match) return match;
  }
  return en.find((v) => v.localService) ?? en[0];
}

/** A single queued chunk of text with a human-readable title for display. */
export interface TTSSection {
  title: string;
  text: string;
}

interface TTSState {
  // ── Reactive state ─────────────────────────────────────────────────────
  /** True while the synthesizer is producing speech. */
  isSpeaking: boolean;
  /** True while the user has intentionally paused playback. */
  isPaused: boolean;
  /** Output volume (0.0 – 1.0), applied to each utterance. */
  volume: number;
  /** Playback speed multiplier (0.5 – 2.0). */
  rate: number;
  /** voiceURI of the selected voice (null = browser default). */
  selectedVoiceURI: string | null;
  /** Available voices from speechSynthesis.getVoices(). */
  voices: SpeechSynthesisVoice[];
  /** Index of the section currently being read (0-based) in a sequence. */
  currentSectionIndex: number;
  /** Total number of sections queued in the current sequence. */
  totalSections: number;
  /** True while reading a multi-section sequence (vs a single speak()). */
  isSequential: boolean;
  /** Human-readable label for what's being read (e.g. "Chapter Notes"). */
  currentTitle: string;
  /** The queue of {title, text} being read sequentially. */
  sections: TTSSection[];

  // ── Actions ────────────────────────────────────────────────────────────
  /** Speak a single text (cancels anything currently playing). Sets non-sequential. */
  speak: (text: string, title?: string) => void;
  /** Queue and start sequential reading of multiple sections. */
  speakSequence: (sections: TTSSection[], startIndex?: number) => void;
  /** Cancel all speech and clear the queue. */
  stop: () => void;
  /** Pause playback (user-initiated). */
  pause: () => void;
  /** Resume playback. */
  resume: () => void;
  /** Skip forward to the next section; stops at the end of the sequence. */
  skipNext: () => void;
  /** Skip back to the previous section; restarts when already at the first. */
  skipPrevious: () => void;
  /** Set the output volume (clamped 0–1). */
  setVolume: (v: number) => void;
  /** Set the playback rate (clamped 0.5–2). */
  setRate: (r: number) => void;
  /** Select a voice by its voiceURI. */
  setVoice: (uri: string) => void;
  /** Re-populate the voices list from speechSynthesis. */
  loadVoices: () => void;
}

// ── Module-level (non-reactive) bookkeeping ───────────────────────────────
// These live outside Zustand state because they're internal implementation
// details that mustn't trigger React re-renders.

const isSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function getSynth(): SpeechSynthesis | null {
  return isSupported ? window.speechSynthesis : null;
}

// Generation counter — bumped each time we intentionally start/cancel an
// utterance. Lets onend/onerror callbacks tell "I was cancelled" from
// "I finished" — a common Web Speech quirk guard.
let genRef = 0;
// Tracks whether the *user* paused (vs Chrome's auto-pause that we fight).
let userPausedRef = false;
// Keep-alive interval id (Chrome silently pauses long utterances ~15s).
let keepAliveId: number | null = null;

export const useTTSStore = create<TTSState>()((set, get) => {
  // ── Internal helpers (closure over set/get) ────────────────────────────

  const startKeepAlive = () => {
    stopKeepAlive();
    const synth = getSynth();
    if (!synth) return;
    keepAliveId = window.setInterval(() => {
      if (!userPausedRef && synth.paused) {
        synth.resume();
      }
    }, 10000);
  };

  const stopKeepAlive = () => {
    if (keepAliveId !== null) {
      window.clearInterval(keepAliveId);
      keepAliveId = null;
    }
  };

  /** Reset all playback state to idle. */
  const finishAll = () => {
    stopKeepAlive();
    userPausedRef = false;
    set({
      isSpeaking: false,
      isPaused: false,
      isSequential: false,
      currentSectionIndex: 0,
      totalSections: 0,
      currentTitle: '',
      sections: [],
    });
  };

  /**
   * Create + start an utterance for a single raw text chunk.
   * Always cancels in-flight speech and bumps the generation guard first.
   * Returns false if there was nothing to say (caller should advance again).
   */
  const speakUtterance = (raw: string): boolean => {
    const synth = getSynth();
    if (!synth) return false;

    synth.cancel(); // cancel anything in-flight before starting new
    genRef += 1; // supersede any previous utterance's callbacks

    const text = stripMarkdown(raw);
    if (!text.trim()) return false;

    const myGen = genRef;
    const { volume, rate, selectedVoiceURI, voices } = get();

    const u = new SpeechSynthesisUtterance(text);
    const voice = selectedVoiceURI
      ? voices.find((v) => v.voiceURI === selectedVoiceURI) ?? null
      : null;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = rate;
    u.volume = volume;
    u.onstart = () => {
      if (myGen !== genRef) return;
      set({ isSpeaking: true, isPaused: false });
    };
    u.onpause = () => {
      if (myGen !== genRef) return;
      set({ isPaused: true });
    };
    u.onresume = () => {
      if (myGen !== genRef) return;
      set({ isPaused: false });
    };
    u.onend = () => {
      if (myGen !== genRef) return;
      advance();
    };
    u.onerror = () => {
      if (myGen !== genRef) return;
      advance();
    };
    synth.speak(u);
    return true;
  };

  /** Move to the next chunk (single or sequence), or finish. */
  const advance = () => {
    const { isSequential, sections, currentSectionIndex } = get();
    if (!isSequential || sections.length === 0) {
      // A single speak() just finished.
      finishAll();
      return;
    }
    const nextIndex = currentSectionIndex + 1;
    if (nextIndex < sections.length) {
      const section = sections[nextIndex];
      set({ currentSectionIndex: nextIndex, currentTitle: section.title });
      if (!speakUtterance(section.text)) {
        // Empty chunk — skip silently to the next.
        advance();
      }
    } else {
      // Whole sequence finished.
      finishAll();
    }
  };

  // ── Initialise voices + listen for the async population quirk ──────────
  if (isSupported) {
    const synth = window.speechSynthesis;
    const load = () => {
      const v = synth.getVoices();
      if (v.length > 0) {
        const { selectedVoiceURI } = get();
        set({
          voices: v,
          selectedVoiceURI: selectedVoiceURI ?? pickDefaultVoice(v)?.voiceURI ?? null,
        });
      }
    };
    load();
    synth.addEventListener('voiceschanged', load);
    // Some engines populate only after a tick — retry once shortly after load.
    window.setTimeout(load, 250);
  }

  return {
    // ── State ────────────────────────────────────────────────────────────
    isSpeaking: false,
    isPaused: false,
    volume: 1.0,
    rate: 1.0,
    selectedVoiceURI: null,
    voices: [],
    currentSectionIndex: 0,
    totalSections: 0,
    isSequential: false,
    currentTitle: '',
    sections: [],

    // ── Actions ──────────────────────────────────────────────────────────
    speak: (text, title = '') => {
      const synth = getSynth();
      if (!synth) return;
      // Reset to single-section mode.
      set({
        isSequential: false,
        totalSections: 0,
        currentSectionIndex: 0,
        currentTitle: title,
        sections: [],
        isSpeaking: false,
        isPaused: false,
      });
      if (!speakUtterance(text)) {
        // Nothing to say — stay idle.
        finishAll();
        return;
      }
      startKeepAlive();
    },

    speakSequence: (sections, startIndex = 0) => {
      const synth = getSynth();
      if (!synth) return;
      const filtered = sections.filter((s) => stripMarkdown(s.text).trim().length > 0);
      if (filtered.length === 0) return;
      const start = Math.min(Math.max(0, startIndex), filtered.length - 1);
      const first = filtered[start];
      set({
        isSequential: true,
        sections: filtered,
        totalSections: filtered.length,
        currentSectionIndex: start,
        currentTitle: first.title,
        isSpeaking: false,
        isPaused: false,
      });
      if (!speakUtterance(first.text)) {
        advance(); // skip empty leading chunk
        startKeepAlive();
        return;
      }
      startKeepAlive();
    },

    stop: () => {
      const synth = getSynth();
      if (synth) synth.cancel();
      genRef += 1; // invalidate any pending callbacks
      finishAll();
    },

    pause: () => {
      const synth = getSynth();
      if (synth && synth.speaking && !synth.paused) {
        synth.pause();
        userPausedRef = true;
        set({ isPaused: true });
      }
    },

    resume: () => {
      const synth = getSynth();
      if (synth && synth.paused) {
        synth.resume();
        userPausedRef = false;
        set({ isPaused: false });
      }
    },

    skipNext: () => {
      const { isSequential, sections, currentSectionIndex } = get();
      if (!isSequential || sections.length === 0) return;
      const nextIndex = currentSectionIndex + 1;
      if (nextIndex >= sections.length) {
        // Already on the last section — finish.
        const synth = getSynth();
        if (synth) synth.cancel();
        genRef += 1;
        finishAll();
        return;
      }
      const section = sections[nextIndex];
      set({ currentSectionIndex: nextIndex, currentTitle: section.title });
      if (!speakUtterance(section.text)) {
        advance();
      }
    },

    skipPrevious: () => {
      const { isSequential, sections, currentSectionIndex } = get();
      if (!isSequential || sections.length === 0) return;
      let prevIndex = currentSectionIndex - 1;
      if (prevIndex < 0) prevIndex = 0; // restart from the beginning
      const section = sections[prevIndex];
      set({ currentSectionIndex: prevIndex, currentTitle: section.title });
      if (!speakUtterance(section.text)) {
        advance();
      }
    },

    setVolume: (v) => {
      set({ volume: Math.min(1.0, Math.max(0.0, v)) });
    },

    setRate: (r) => {
      set({ rate: Math.min(2.0, Math.max(0.5, r)) });
    },

    setVoice: (uri) => {
      set({ selectedVoiceURI: uri });
    },

    loadVoices: () => {
      const synth = getSynth();
      if (!synth) return;
      const v = synth.getVoices();
      if (v.length > 0) {
        const { selectedVoiceURI } = get();
        set({
          voices: v,
          selectedVoiceURI: selectedVoiceURI ?? pickDefaultVoice(v)?.voiceURI ?? null,
        });
      }
    },
  };
});

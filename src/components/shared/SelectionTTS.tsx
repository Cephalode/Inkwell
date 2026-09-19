// Read-any-selection TTS — Turbo.ai-style. Text selection → floating [Listen] menu → server TTS (edge-tts, keyless).
import { useEffect, useRef, useState } from 'react';
import { HiSpeakerWave, HiStop } from 'react-icons/hi2';

const API_BASE: string =
  typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

// ponytail: one module-level audio element, swap src per play. One voice, no
// player UI; add playlist/rate/voice picker only if users ask.
let audio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement {
  if (!audio) audio = new Audio();
  return audio;
}

/** Stop playback and drop any in-flight download. */
export function stopSpeak(): void {
  const a = getAudio();
  a.pause();
  a.removeAttribute('src');
  a.load();
}

/** POST the text to /api/tts and play the returned MP3. */
async function playTts(text: string): Promise<void> {
  stopSpeak(); // one voice at a time — a new read always replaces the old
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS failed (${res.status})`);
  const a = getAudio();
  a.src = URL.createObjectURL(await res.blob());
  await a.play();
}

/**
 * Global selection listener. On mouseup/keyup with a non-empty selection,
 * floats a [Listen] button at the selection rect (Turbo.ai-style).
 * Mounted once in App — covers every page.
 */
export default function SelectionTTS() {
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const syncFromAudio = () => setSpeaking(!getAudio().paused);
    const a = getAudio();
    a.addEventListener('play', syncFromAudio);
    a.addEventListener('pause', syncFromAudio);
    a.addEventListener('ended', syncFromAudio);

    const show = () => {
      // A menu-button click collapses the selection before mouseup fires —
      // keep the current menu if the pointer is on it.
      if (btnRef.current?.matches(':hover')) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!sel || text.length === 0) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setMenu(null), 150); // grace period to reach the button
        return;
      }
      if (text.length > 5000) return; // server caps at 5000 anyway
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setMenu({
        x: Math.min(rect.left + rect.width / 2, window.innerWidth - 60),
        y: rect.top - 44,
        text,
      });
    };
    const onHide = () => setMenu(null);

    document.addEventListener('mouseup', show);
    document.addEventListener('keyup', show);
    // Stop speaking whenever a brand-new selection is started (mousedown).
    document.addEventListener('mousedown', onHide);
    window.addEventListener('scroll', onHide, true);
    return () => {
      a.removeEventListener('play', syncFromAudio);
      a.removeEventListener('pause', syncFromAudio);
      a.removeEventListener('ended', syncFromAudio);
      document.removeEventListener('mouseup', show);
      document.removeEventListener('keyup', show);
      document.removeEventListener('mousedown', onHide);
      window.removeEventListener('scroll', onHide, true);
      stopSpeak();
    };
  }, []);

  const listen = async () => {
    if (!menu) return;
    setMenu(null);
    setSpeaking(true);
    try {
      await playTts(menu.text);
    } catch (err) {
      console.error('SelectionTTS:', err);
      setSpeaking(false);
    }
  };

  if (!menu && !speaking) return null;

  return (
    <div
      className="fixed z-[9999]"
      style={{ left: menu ? menu.x : -9999, top: menu ? Math.max(menu.y, 8) : -9999 }}
    >
      {menu && (
        <button
          ref={btnRef}
          onMouseDown={(e) => e.preventDefault()} // don't collapse the selection
          onClick={listen}
          className="flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-[var(--color-neutral-300)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-md)] hover:bg-[var(--color-neutral-200)]"
          title="Read aloud"
        >
          <HiSpeakerWave className="h-4 w-4 text-[var(--color-accent)]" />
          Listen
        </button>
      )}
      {speaking && (
        <button
          onClick={() => stopSpeak()}
          className={`flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-[var(--color-neutral-300)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-md)] hover:bg-[var(--color-neutral-200)] ${menu ? 'mt-1' : ''}`}
          title="Stop reading"
        >
          <HiStop className="h-4 w-4 text-[var(--color-accent-2-700)]" />
          Stop
        </button>
      )}
    </div>
  );
}

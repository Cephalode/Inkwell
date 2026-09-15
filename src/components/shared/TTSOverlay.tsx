import {
  HiVolumeUp,
  HiVolumeOff,
  HiPause,
  HiStop,
  HiPlay,
  HiChevronDoubleLeft,
  HiChevronDoubleRight,
} from 'react-icons/hi';
import { useTTSStore } from '../../store/ttsStore';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Global, persistent text-to-speech transport overlay.
 *
 * Always rendered in Layout; it slides up / fades in whenever speech is
 * active (isSpeaking) and disappears when idle. Because it lives at the
 * layout level (outside any route), audio continues uninterrupted across
 * page navigation — the defining feature of the global TTS refactor.
 *
 * Design: Broadsheet surface bar fixed to the bottom of the viewport with
 * a hairline divider top border and accent-token highlights.
 */
export default function TTSOverlay() {
  const isSpeaking = useTTSStore((s) => s.isSpeaking);
  const isPaused = useTTSStore((s) => s.isPaused);
  const isSequential = useTTSStore((s) => s.isSequential);
  const currentSectionIndex = useTTSStore((s) => s.currentSectionIndex);
  const totalSections = useTTSStore((s) => s.totalSections);
  const currentTitle = useTTSStore((s) => s.currentTitle);
  const volume = useTTSStore((s) => s.volume);
  const rate = useTTSStore((s) => s.rate);
  const voices = useTTSStore((s) => s.voices);
  const selectedVoiceURI = useTTSStore((s) => s.selectedVoiceURI);

  const stop = useTTSStore((s) => s.stop);
  const pause = useTTSStore((s) => s.pause);
  const resume = useTTSStore((s) => s.resume);
  const skipNext = useTTSStore((s) => s.skipNext);
  const skipPrevious = useTTSStore((s) => s.skipPrevious);
  const setVolume = useTTSStore((s) => s.setVolume);
  const setRate = useTTSStore((s) => s.setRate);
  const setVoice = useTTSStore((s) => s.setVoice);

  const handlePlayPause = () => {
    if (isPaused) resume();
    else if (isSpeaking) pause();
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.findIndex((s) => Math.abs(s - rate) < 0.01);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setRate(next);
  };

  const toggleMute = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  const prevDisabled = !isSequential || currentSectionIndex <= 0;
  const nextDisabled = !isSequential || currentSectionIndex >= totalSections - 1;

  const btnBase =
    'inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed';

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${
        isSpeaking
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isSpeaking}
    >
      <div
        style={{
          borderTop: '1px solid var(--color-divider)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="mx-auto flex h-[60px] max-w-screen-2xl items-center gap-2 px-4">
          {/* ── Transport: previous / play-pause / next / stop ─────────── */}
          {isSequential && (
            <button
              type="button"
              onClick={skipPrevious}
              disabled={prevDisabled}
              title="Previous section"
              aria-label="Previous section"
              className={`${btnBase} text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]`}
            >
              <HiChevronDoubleLeft className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handlePlayPause}
            title={isPaused ? 'Resume' : 'Pause'}
            aria-label={isPaused ? 'Resume speech' : 'Pause speech'}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-600)] transition-colors shrink-0"
            style={{ color: 'var(--color-bg)' }}
          >
            {isSpeaking && !isPaused ? (
              <HiPause className="w-4 h-4" />
            ) : (
              <HiPlay className="w-4 h-4 ml-0.5" />
            )}
          </button>

          {isSequential && (
            <button
              type="button"
              onClick={skipNext}
              disabled={nextDisabled}
              title="Next section"
              aria-label="Next section"
              className={`${btnBase} text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]`}
            >
              <HiChevronDoubleRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={stop}
            title="Stop"
            aria-label="Stop speech"
            className={`${btnBase} opacity-75 hover:opacity-100 hover:bg-[var(--color-neutral-200)] shrink-0`}
          >
            <HiStop className="w-4 h-4" />
          </button>

          {/* ── Now-reading indicator + section counter ─────────────────── */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <HiVolumeUp className={`w-4 h-4 shrink-0 ${isPaused ? '' : 'animate-pulse'}`} style={{ color: 'var(--color-accent)' }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs leading-tight" style={{ opacity: 0.6 }}>
                {isPaused ? 'Paused' : 'Now reading'}
              </div>
              <div className="text-sm font-medium truncate leading-tight">
                {currentTitle || 'Untitled'}
              </div>
            </div>
            {isSequential && totalSections > 0 && (
              <span className="text-xs tabular-nums shrink-0 whitespace-nowrap" style={{ color: 'var(--color-accent-700)' }}>
                {currentSectionIndex + 1} / {totalSections}
              </span>
            )}
          </div>

          {/* ── Volume slider ───────────────────────────────────────────── */}
          <div className="hidden sm:inline-flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              title={volume === 0 ? 'Unmute' : 'Mute'}
              aria-label={volume === 0 ? 'Unmute' : 'Mute'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-md)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] transition-colors"
            >
              {volume === 0 ? (
                <HiVolumeOff className="w-3.5 h-3.5" />
              ) : (
                <HiVolumeUp className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="Volume"
              title={`Volume ${Math.round(volume * 100)}%`}
              className="w-16 h-1.5 cursor-pointer"
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </div>

          {/* ── Speed cycle ─────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Cycle playback speed"
            aria-label={`Playback speed ${rate}×`}
            className="inline-flex items-center justify-center min-w-[2.75rem] h-8 px-2 text-xs font-medium bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] transition-colors shrink-0"
            style={{
              color: 'var(--color-accent-700)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {rate}×
          </button>

          {/* ── Voice selector ──────────────────────────────────────────── */}
          <select
            value={selectedVoiceURI ?? ''}
            onChange={(e) => setVoice(e.target.value)}
            aria-label="Select voice"
            title="Voice"
            className="hidden md:block max-w-[9rem] truncate text-xs px-1.5 py-1.5 shrink-0"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-divider)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text)',
            }}
          >
            {voices.length === 0 && <option value="">Default voice</option>}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

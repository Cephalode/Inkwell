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
 * Design: dark frosted-glass bar fixed to the bottom of the viewport with
 * a subtle teal top border and cyan/teal accents.
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
    'inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed';

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${
        isSpeaking
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isSpeaking}
    >
      <div className="border-t border-cyan-500/40 bg-slate-950/80 backdrop-blur-md shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.6)]">
        <div className="mx-auto flex h-[60px] max-w-screen-2xl items-center gap-2 px-4">
          {/* ── Transport: previous / play-pause / next / stop ─────────── */}
          {isSequential && (
            <button
              type="button"
              onClick={skipPrevious}
              disabled={prevDisabled}
              title="Previous section"
              aria-label="Previous section"
              className={`${btnBase} text-cyan-300 hover:bg-cyan-500/15`}
            >
              <HiChevronDoubleLeft className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handlePlayPause}
            title={isPaused ? 'Resume' : 'Pause'}
            aria-label={isPaused ? 'Resume speech' : 'Pause speech'}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shrink-0"
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
              className={`${btnBase} text-cyan-300 hover:bg-cyan-500/15`}
            >
              <HiChevronDoubleRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={stop}
            title="Stop"
            aria-label="Stop speech"
            className={`${btnBase} text-slate-300 hover:bg-slate-700/50 shrink-0`}
          >
            <HiStop className="w-4 h-4" />
          </button>

          {/* ── Now-reading indicator + section counter ─────────────────── */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <HiVolumeUp className={`w-4 h-4 text-cyan-400 shrink-0 ${isPaused ? '' : 'animate-pulse'}`} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-400 leading-tight">
                {isPaused ? 'Paused' : 'Now reading'}
              </div>
              <div className="text-sm text-cyan-100 font-medium truncate leading-tight">
                {currentTitle || 'Untitled'}
              </div>
            </div>
            {isSequential && totalSections > 0 && (
              <span className="text-xs text-cyan-300/80 tabular-nums shrink-0 whitespace-nowrap">
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
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-cyan-300 hover:bg-cyan-500/15 transition-colors"
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
              className="w-16 h-1.5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* ── Speed cycle ─────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Cycle playback speed"
            aria-label={`Playback speed ${rate}×`}
            className="inline-flex items-center justify-center min-w-[2.75rem] h-8 px-2 rounded-md text-xs font-medium text-teal-200 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 transition-colors shrink-0"
          >
            {rate}×
          </button>

          {/* ── Voice selector ──────────────────────────────────────────── */}
          <select
            value={selectedVoiceURI ?? ''}
            onChange={(e) => setVoice(e.target.value)}
            aria-label="Select voice"
            title="Voice"
            className="hidden md:block max-w-[9rem] truncate text-xs bg-slate-800 border border-slate-700/60 rounded-md px-1.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 shrink-0"
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

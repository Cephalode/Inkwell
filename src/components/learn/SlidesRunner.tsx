import { useCallback, useEffect, useRef, useState } from 'react';
import { HiChevronDown, HiChevronLeft, HiChevronRight, HiCheck, HiSpeakerWave } from 'react-icons/hi2';
import Spinner from '../shared/Spinner';
import Markdown from '../shared/Markdown';
import { getActivity } from '../../services/api/learning';
import { useLearningStore } from '../../store/learningStore';
import type { Slide, SlidesContent } from '../../types/learning';
import type { ActivityRunnerProps } from './runnerProps';

/**
 * Slides runner — presents the generated deck one slide at a time on a 16:9
 * stage: a title slide, bullet slides, and SVG diagram slides. Arrows / ← →
 * keys / dot navigation; the speaker notes of the current slide sit below the
 * stage. Like the podcast, the narrated MP3 is rendered fire-and-forget — the
 * deck reads fine meanwhile, and once the audio (plus its per-slide timing)
 * lands, playback auto-advances the slides. "Finish deck" submits; viewing is
 * weak evidence (XP only).
 */
export default function SlidesRunner({ activity, onComplete, onAbandon, onLeave }: ActivityRunnerProps) {
  const submitActivity = useLearningStore((s) => s.submitActivity);
  const [current, setCurrent] = useState(activity);
  const [i, setI] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Fresh content from a poll must be visible to the render: poll writes into
  // `current` (same pattern as PodcastRunner — `activity` stays frozen).
  const content = current.content as SlidesContent | null;
  const slides = content?.slides ?? [];
  const last = Math.max(0, slides.length - 1);

  // Poll while the narration render is in flight (bounded ~5 min at 5s).
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (content && (content.audioPath || content.renderError)) return;
    if (polls >= 60) return;
    const t = setTimeout(() => {
      getActivity(activity.id)
        .then(setCurrent)
        .catch(() => {/* transient — next tick retries */})
        .finally(() => setPolls((n) => n + 1));
    }, 5000);
    return () => clearTimeout(t);
  }, [content, polls, activity.id]);

  const go = useCallback((d: number) => setI((n) => Math.max(0, Math.min(last, n + d))), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!content || slides.length === 0) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ opacity: 0.7 }}>
          This deck has no slides — it may have failed to generate.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onAbandon}>
          Back to strategies
        </button>
      </div>
    );
  }

  const audioPath = content.audioPath;
  const renderError = content.renderError;
  const rendering = !audioPath && !renderError && polls < 60;
  const gaveUp = !audioPath && !renderError && polls >= 60;

  // Auto-advance: while narration plays, the audio clock picks the slide.
  const onTime = () => {
    const segs = content.slideAudio;
    const t = audioRef.current?.currentTime;
    if (!segs || segs.length !== slides.length || t == null) return;
    let idx = 0;
    for (let n = 0; n < segs.length; n++) if (t >= segs[n].startS) idx = n;
    setI(idx);
  };

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onComplete(await submitActivity(activity.id, {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish the deck');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stage — fixed 16:9, slide content scaled to fit */}
      <div
        className="card overflow-hidden"
        style={{ padding: 0, cursor: last > 0 ? 'pointer' : undefined }}
        onClick={(e) => {
          const rect = stageRef.current?.getBoundingClientRect();
          if (!rect) return;
          go(e.clientX - rect.left > rect.width / 2 ? 1 : -1);
        }}
      >
        <div ref={stageRef} className="relative w-full" style={{ aspectRatio: '16 / 9', background: 'var(--color-bg)' }}>
          <SlideView slide={slides[i]} />
          <span className="absolute text-xs" style={{ right: 12, bottom: 10, opacity: 0.55 }}>
            {i + 1} / {slides.length}
          </span>
        </div>
      </div>

      {/* Speaker notes for the current slide */}
      {slides[i].notes && (
        <div className="card p-4">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '2px 4px', fontSize: 12.5 }}
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((o) => !o)}
          >
            {notesOpen ? <HiChevronDown className="h-4 w-4" /> : <HiChevronRight className="h-4 w-4" />}
            Notes
          </button>
          {notesOpen && (
            <p className="text-sm" style={{ margin: '6px 0 0', opacity: 0.75, lineHeight: 1.5 }}>
              {slides[i].notes}
            </p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide">
          <HiChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <div className="flex items-center gap-1.5">
          {slides.map((_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Go to slide ${n + 1}`}
              aria-current={n === i}
              onClick={() => setI(n)}
              className="transition-colors"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: n === i ? 'var(--color-accent)' : 'var(--color-divider)',
              }}
            />
          ))}
        </div>
        {i < last ? (
          <button type="button" className="btn btn-primary" onClick={() => go(1)}>
            Next
            <HiChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={finish}>
            {submitting ? <Spinner size="sm" /> : <HiCheck className="h-4 w-4" aria-hidden />}
            Finish deck
          </button>
        )}
      </div>

      {/* Narration audio (renders fire-and-forget, like the podcast) */}
      {audioPath ? (
        <audio
          ref={audioRef}
          controls
          className="w-full"
          src={`/api/learning-activities/${activity.id}/audio`}
          preload="none"
          onTimeUpdate={onTime}
        />
      ) : rendering ? (
        <div className="flex items-center gap-2 text-sm" style={{ opacity: 0.7 }}>
          <Spinner size="sm" />
          <HiSpeakerWave className="h-4 w-4" aria-hidden />
          Rendering narration… the deck above is ready meanwhile.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs" style={{ opacity: 0.6 }}>
          <HiSpeakerWave className="h-4 w-4 shrink-0" aria-hidden />
          {renderError ? `Narration render failed (${renderError}) — the slides are still useful.` : gaveUp ? 'Narration is taking longer than expected — the slides are above.' : ''}
        </div>
      )}

      {error && (
        <div
          className="text-sm"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          Back to strategies
        </button>
      </div>
    </div>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  if (slide.type === 'title') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
        <h2 style={{ fontSize: 'clamp(24px, 4.5vw, 40px)', margin: 0 }}>{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-base" style={{ opacity: 0.65, margin: 0, maxWidth: 640 }}>
            {slide.subtitle}
          </p>
        )}
      </div>
    );
  }
  if (slide.type === 'diagram') {
    return (
      <div className="flex h-full flex-col" style={{ padding: '16px 20px' }}>
        <h3 className="section-label" style={{ margin: '0 0 4px' }}>
          {slide.title}
        </h3>
        {/* ponytail: dangerouslySetInnerHTML on server-sanitized SVG (script/handler/URL stripping in buildSlides) */}
        <div className="min-h-0 flex-1 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: slide.svg }} />
        {slide.caption && (
          <p className="text-xs" style={{ opacity: 0.6, margin: '4px 0 0', textAlign: 'center' }}>
            {slide.caption}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" style={{ padding: '16px 32px' }}>
      <h3 style={{ fontSize: 'clamp(18px, 2.6vw, 26px)', margin: '0 0 10px' }}>{slide.title}</h3>
      <ul
        className="flex flex-col justify-center gap-2.5 [&>li]:text-[clamp(13px,1.8vw,17px)]"
        style={{ flex: 1, margin: 0, padding: 0, listStyle: 'none' }}
      >
        {slide.bullets.map((b, n) => (
          <li key={n} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-[0.55em] shrink-0"
              style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--color-accent)' }}
            />
            <span>
              <Markdown content={b} compact className="[&_p]:m-0" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

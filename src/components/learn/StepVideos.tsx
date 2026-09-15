import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';
import Spinner from '../shared/Spinner';
import VideoCard from '../videos/VideoCard';
import { useVideoStore } from '../../store/videoStore';
import type { StepDetail } from '../../types/learning';

/** How many ranked videos the step page shows; the full list lives on /learn/videos. */
const TOP = 3;
const ACCENT_BORDER = 'color-mix(in srgb, var(--color-accent) 45%, transparent)';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function ErrorNote({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-sm"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
        color: 'var(--color-danger)',
      }}
    >
      <HiOutlineExclamationTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        className="btn btn-ghost"
        style={{
          padding: '4px 10px',
          fontSize: 12,
          color: 'var(--color-danger)',
          border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
        }}
        onClick={onAction}
      >
        <HiOutlineArrowPath className="h-3.5 w-3.5" />
        {actionLabel}
      </button>
    </div>
  );
}

/**
 * Videos judged for this step's milestone (skill), shown under the work area
 * of the step page. The search runs on demand (20-90 s live). The store's
 * ranking is by time-efficiency score, which does not guarantee that a video
 * teaching several still-unlearned milestones outranks a short single-milestone
 * one — so multi-milestone videos are lifted to the front here (score order is
 * kept within each group).
 */
export default function StepVideos({ step }: { step: StepDetail }) {
  const navigate = useNavigate();
  const skillId = step.skillId;
  const data = useVideoStore((s) => s.videosBySkill[skillId]);
  const searching = useVideoStore((s) => !!s.searchingSkills[skillId]);
  const loadSkillVideos = useVideoStore((s) => s.loadSkillVideos);
  const searchSkillVideos = useVideoStore((s) => s.searchSkillVideos);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Load on mount — and again whenever the store drops its cache (it does so
  // after a video is watched, since mastery may have moved the ranking).
  const loaded = data !== undefined;
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    loadSkillVideos(skillId).catch((err: unknown) => {
      if (!cancelled) setLoadError(errorMessage(err));
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, skillId, loadSkillVideos]);

  // The cached snapshot carries mastery too (per-milestone chips, the
  // "N milestones in one" badge, the ordering). The video store only drops it
  // after a watch or a plan run — not when a quiz / recall / discussion or
  // "I already know this" moves this skill's mastery — so re-fetch whenever
  // the snapshot disagrees with the step. The ref refreshes once per mastery
  // value, so a server that keeps disagreeing cannot cause a loop.
  const mastery = step.skill.mastery;
  const stale = !!data && data.skill.mastery !== mastery;
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!stale || refreshedFor.current === mastery) return;
    refreshedFor.current = mastery;
    loadSkillVideos(skillId, true).catch(() => {});
  }, [stale, mastery, skillId, loadSkillVideos]);

  // A search queued elsewhere (the video plan page, another tab) reports
  // 'searching' from the server with nothing local to await; poll until it settles.
  const remoteSearching = data?.skill.searchStatus === 'searching' && !searching;
  useEffect(() => {
    if (!remoteSearching) return;
    const id = window.setInterval(() => {
      loadSkillVideos(skillId, true).catch(() => {});
    }, 3000);
    return () => window.clearInterval(id);
  }, [remoteSearching, skillId, loadSkillVideos]);

  const retryLoad = () => {
    setLoadError(null);
    loadSkillVideos(skillId, true).catch((err: unknown) => setLoadError(errorMessage(err)));
  };

  const search = async (force: boolean) => {
    setSearchError(null);
    try {
      await searchSkillVideos(skillId, force);
    } catch (err) {
      setSearchError(errorMessage(err));
    }
  };

  let body: ReactNode;

  if (!data) {
    body = loadError ? (
      <ErrorNote message={loadError} actionLabel="Retry" onAction={retryLoad} />
    ) : (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  } else if (searching || data.skill.searchStatus === 'searching') {
    body = (
      <div className="card flex items-center gap-3 p-4" style={{ borderColor: ACCENT_BORDER }}>
        <Spinner size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ margin: 0, color: 'var(--color-accent)' }}>
            Searching YouTube, reading captions, judging…
          </p>
          <p className="text-xs" style={{ margin: 0, opacity: 0.55 }}>
            This can take a minute or two — you can keep working on a strategy meanwhile.
          </p>
        </div>
      </div>
    );
  } else if (searchError || data.skill.searchStatus === 'error') {
    body = (
      <ErrorNote
        message={searchError ?? data.skill.searchError ?? 'Video search failed'}
        actionLabel="Retry"
        onAction={() => void search(true)}
      />
    );
  } else if (data.skill.searchStatus === 'none') {
    body = (
      <div className="card flex items-start gap-3 p-4" style={{ borderColor: ACCENT_BORDER }}>
        <HiOutlineVideoCamera className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
            No videos yet. Inkwell searches YouTube, reads the captions and keeps only videos that actually teach
            this milestone — and prefers ones that also cover what comes next.
          </p>
          <button type="button" className="btn btn-primary mt-3" onClick={() => void search(false)}>
            <HiOutlineMagnifyingGlass className="h-4 w-4" />
            Find videos
          </button>
        </div>
      </div>
    );
  } else {
    // Product rule: a video that teaches ≥2 still-unlearned milestones leads;
    // the store's score order is kept within each group (sort is stable).
    const top = [...data.videos]
      .sort((a, b) => Number(b.unlearnedMilestones >= 2) - Number(a.unlearnedMilestones >= 2))
      .slice(0, TOP);
    const n = data.videos.length;
    body = (
      <>
        {top.length === 0 ? (
          <p className="text-sm" style={{ margin: 0, opacity: 0.6 }}>
            No video taught this milestone well enough to keep. Try again later — YouTube changes daily.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {top.map((v, i) => (
              <VideoCard key={v.id} video={v} compact highlightSkillId={skillId} rank={i + 1} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs" style={{ opacity: 0.5 }}>
            {n} video{n === 1 ? '' : 's'} judged{n > TOP ? ` · top ${TOP} shown` : ''}
          </span>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => void search(true)}>
            <HiOutlineArrowPath className="h-3.5 w-3.5" />
            Search again
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="section-label" style={{ margin: 0 }}>
          Videos for this milestone
        </h3>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '2px 6px' }}
          onClick={() => navigate('/learn/videos')}
        >
          All videos →
        </button>
      </div>
      {body}
    </section>
  );
}

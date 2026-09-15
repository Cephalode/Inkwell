import { useNavigate } from 'react-router-dom';
import { HiCheck, HiOutlineClock, HiOutlinePlay, HiOutlineSparkles } from 'react-icons/hi2';
import { formatDuration, type RankedVideo } from '../../types/videos';

/** Milestone chips: unlearned first, learned ones muted; shared ones say so. */
export function MilestoneChips({
  video,
  highlightSkillId,
  max = 4,
}: {
  video: RankedVideo;
  highlightSkillId?: string;
  max?: number;
}) {
  const sorted = [...video.milestones].sort((a, b) => {
    if (a.skillId === highlightSkillId) return -1;
    if (b.skillId === highlightSkillId) return 1;
    if ((a.mastery === 'learned') !== (b.mastery === 'learned')) return a.mastery === 'learned' ? 1 : -1;
    return b.coverage - a.coverage;
  });
  const shown = sorted.slice(0, max);
  const rest = sorted.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((m) => {
        const learned = m.mastery === 'learned';
        const shared = m.courses.length > 1;
        const strong = m.skillId === highlightSkillId;
        return (
          <span
            key={m.skillId}
            title={`${Math.round(m.coverage * 100)}% of the objectives${shared ? ` · taught in ${m.courses.map((c) => c.courseName).join(', ')}` : ''}${learned ? ' · already learned' : ''}`}
            className="inline-flex items-center gap-1 whitespace-nowrap"
            style={{
              fontSize: 11,
              lineHeight: '16px',
              padding: '1px 8px',
              borderRadius: 999,
              opacity: learned ? 0.5 : 1,
              color: learned ? 'var(--color-success)' : strong ? 'var(--color-accent)' : 'var(--color-text)',
              background: learned
                ? 'color-mix(in srgb, var(--color-success) 10%, transparent)'
                : strong
                  ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-text) 6%, transparent)',
              border: `1px solid ${learned ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : strong ? 'color-mix(in srgb, var(--color-accent) 35%, transparent)' : 'var(--color-divider)'}`,
            }}
          >
            {learned && <HiCheck className="h-3 w-3" />}
            {m.label}
            {shared && <span style={{ opacity: 0.6 }}>· {m.courses.length} courses</span>}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="text-xs" style={{ opacity: 0.5 }}>
          +{rest} more
        </span>
      )}
    </div>
  );
}

/**
 * One ranked video. The badges say why it is worth the learner's time:
 * how many still-unlearned milestones it teaches (several = "in one"),
 * across how many courses, and the minutes per milestone.
 */
export default function VideoCard({
  video,
  highlightSkillId,
  compact = false,
  rank,
}: {
  video: RankedVideo;
  highlightSkillId?: string;
  compact?: boolean;
  rank?: number;
}) {
  const navigate = useNavigate();
  const multi = video.unlearnedMilestones >= 2;
  const minutes = Math.round(video.durationSeconds / 60);
  return (
    <button
      type="button"
      onClick={() => navigate(`/learn/videos/${video.id}`)}
      className="card group flex w-full gap-3 text-left transition-colors hover:border-[var(--color-accent)]"
      style={{ padding: compact ? 10 : 14, alignItems: 'flex-start', cursor: 'pointer' }}
    >
      <div className="relative shrink-0" style={{ width: compact ? 112 : 160 }}>
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          className="w-full"
          style={{ aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 'var(--radius-md)', background: 'var(--color-neutral-200)' }}
        />
        <span
          className="absolute bottom-1 right-1 inline-flex items-center gap-1"
          style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,.72)', color: '#fff' }}
        >
          <HiOutlineClock className="h-3 w-3" />
          {formatDuration(video.durationSeconds)}
        </span>
        {video.watchedAt && (
          <span
            className="absolute left-1 top-1 inline-flex items-center gap-1"
            style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-success)', color: '#fff' }}
          >
            <HiCheck className="h-3 w-3" /> Watched
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5" style={{ marginBottom: 4 }}>
          {typeof rank === 'number' && (
            <span className="text-xs font-semibold" style={{ opacity: 0.45 }}>
              #{rank}
            </span>
          )}
          {multi && (
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{
                fontSize: 11,
                padding: '1px 8px',
                borderRadius: 999,
                color: 'var(--color-bg)',
                background: 'var(--color-accent)',
              }}
            >
              <HiOutlineSparkles className="h-3 w-3" />
              {video.unlearnedMilestones} milestones in one
            </span>
          )}
          {video.coursesTouched > 1 && (
            <span className="text-xs" style={{ color: 'var(--color-accent-700)' }}>
              counts in {video.coursesTouched} courses
            </span>
          )}
          {video.level && (
            <span className="text-xs uppercase tracking-wider" style={{ opacity: 0.45 }}>
              {video.level}
            </span>
          )}
        </div>
        <p className={`${compact ? 'text-sm' : 'text-[15px]'} font-semibold leading-snug group-hover:text-[var(--color-accent-700)]`} style={{ margin: 0 }}>
          <HiOutlinePlay className="mr-1 inline h-3.5 w-3.5 -mt-0.5" style={{ color: 'var(--color-accent)' }} />
          {video.title}
        </p>
        <p className="text-xs" style={{ opacity: 0.55, margin: '2px 0 6px' }}>
          {video.channel}
          {video.channel ? ' · ' : ''}
          {minutes} min · ≈ {video.minutesPerMilestone} min per milestone
        </p>
        <MilestoneChips video={video} highlightSkillId={highlightSkillId} max={compact ? 3 : 5} />
        {!compact && video.summary && (
          <p className="text-xs" style={{ opacity: 0.6, margin: '8px 0 0', lineHeight: 1.5 }}>
            {video.summary}
          </p>
        )}
      </div>
    </button>
  );
}

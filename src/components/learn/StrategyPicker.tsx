import { ACTIVITY_META, type ActivityKind, type StepDetail } from '../../types/learning';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';

interface StrategyPickerProps {
  step: StepDetail;
  /** The kind currently being prepared by the server (tile shows a spinner). */
  busyKind: ActivityKind | null;
  onPick: (kind: ActivityKind) => void;
}

const KINDS = Object.keys(ACTIVITY_META) as ActivityKind[];

/**
 * Strategy picker — five tiles (one per activity kind) with the learner's
 * history for that kind on this step: completed count, best score, and a
 * "Resume" marker when an activity was started but not finished.
 */
export default function StrategyPicker({ step, busyKind, onPick }: StrategyPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {KINDS.map((kind) => {
        const meta = ACTIVITY_META[kind];
        const mine = step.activities.filter((a) => a.kind === kind);
        const completed = mine.filter((a) => a.status === 'completed');
        const scores = completed.map((a) => a.score).filter((s): s is number => typeof s === 'number');
        const best = scores.length ? Math.round(Math.max(...scores) * 100) : null;
        const resumable = mine.some((a) => a.status === 'in_progress' && a.content);
        const isBusy = busyKind === kind;
        const disabled = busyKind !== null && !isBusy;

        const history =
          completed.length === 0
            ? 'Not tried yet'
            : `${best !== null ? `Best ${best}% · ` : ''}${completed.length} done`;

        return (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            disabled={disabled}
            aria-busy={isBusy}
            className="card relative flex flex-col p-4 text-left transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ minHeight: 168 }}
          >
            <div className="flex items-start justify-between gap-2">
              <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>
                {meta.emoji}
              </span>
              {resumable && <Badge color="yellow">Resume</Badge>}
            </div>
            <div className="mt-2 text-sm font-semibold">{meta.label}</div>
            <div className="mt-0.5 text-xs leading-snug" style={{ opacity: 0.6 }}>
              {meta.blurb}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                +{meta.xp} XP
              </span>
              {meta.assessed && <Badge color="green">Counts toward mastery</Badge>}
            </div>
            <div className="mt-1.5 text-[11px]" style={{ opacity: 0.5 }}>
              {history}
            </div>

            {isBusy && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
                style={{ background: 'var(--color-surface)', borderRadius: 'inherit', padding: 'var(--space-3)' }}
              >
                <Spinner size="sm" />
                <span className="text-xs" style={{ opacity: 0.7 }}>
                  Preparing your {meta.label.toLowerCase()}…
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

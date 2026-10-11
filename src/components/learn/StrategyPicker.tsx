import { ACTIVITY_META, STRATEGY_STAGES, type ActivityKind, type StepDetail } from '../../types/learning';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';

interface StrategyPickerProps {
  step: StepDetail;
  /** Kinds currently being prepared by the server (tile shows a spinner). */
  busyKinds: ReadonlySet<ActivityKind>;
  /** Kinds whose background generation failed (tile offers tap-to-retry). */
  errorKinds: ReadonlySet<ActivityKind>;
  onPick: (kind: ActivityKind) => void;
}

/**
 * Strategy picker — the activity kinds grouped into stages (learn → test →
 * demonstrate) with the learner's history for each kind on this step:
 * completed count, best score, and a "Resume" marker when an activity was
 * started but not finished. While strategies are being prepared (single pick
 * or generate-all) not-yet-ready tiles stay greyed; the moment content lands
 * the tile lights up and opens on tap.
 */
export default function StrategyPicker({ step, busyKinds, errorKinds, onPick }: StrategyPickerProps) {
  const generating = busyKinds.size > 0;
  return (
    <div className="space-y-4">
      {STRATEGY_STAGES.map((stage) => (
        <div key={stage.n}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="section-label" style={{ margin: 0 }}>
              Stage {stage.n} · {stage.label}
            </h4>
            <span className="text-xs" style={{ opacity: 0.5 }}>
              {stage.hint}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {stage.kinds.map((kind) => {
              const meta = ACTIVITY_META[kind];
              const mine = step.activities.filter((a) => a.kind === kind);
              const completed = mine.filter((a) => a.status === 'completed');
              const scores = completed.map((a) => a.score).filter((s): s is number => typeof s === 'number');
              const best = scores.length ? Math.round(Math.max(...scores) * 100) : null;
              const resumable = mine.some((a) => a.status === 'in_progress' && a.content);
              const isBusy = busyKinds.has(kind);
              // Ready content: a resumable in-progress activity, or any completed one.
              const hasContent = mine.some((a) => (a.status === 'in_progress' || a.status === 'completed') && a.content);
              const errored = errorKinds.has(kind);
              // Greyed while its content isn't ready yet; failed tiles stay tappable to retry.
              const locked = generating && !hasContent && !errored;

              const history =
                completed.length === 0
                  ? 'Not tried yet'
                  : `${best !== null ? `Best ${best}% · ` : ''}${completed.length} done`;

              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onPick(kind)}
                  disabled={locked}
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
                    {isBusy ? 'Generating…' : errored ? 'Generation failed — tap to retry' : locked ? 'Waiting for a slot…' : history}
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
        </div>
      ))}
    </div>
  );
}

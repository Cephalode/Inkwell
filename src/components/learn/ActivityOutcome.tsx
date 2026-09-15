import type { ReactNode } from 'react';
import { HiCheck, HiXMark } from 'react-icons/hi2';
import {
  ACTIVITY_META,
  MASTERY_LABEL,
  type DiscussionResult,
  type FlashcardsResult,
  type LearningActivity,
  type LessonResult,
  type Mastery,
  type QuizContent,
  type QuizResult,
  type RecallResult,
  type StepDetail,
  type SubmitResponse,
} from '../../types/learning';
import Badge from '../shared/Badge';

interface ActivityOutcomeProps {
  result: SubmitResponse;
  step: StepDetail;
  onNext: () => void;
  onAgain: () => void;
  onBack: () => void;
}

const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);

const scoreColor = (s: number) =>
  s >= 0.8 ? 'var(--color-success)' : s >= 0.5 ? 'var(--color-accent)' : 'var(--color-warning)';

const masteryColor = (m: Mastery) =>
  m === 'learned' ? 'var(--color-success)' : m === 'learning' ? 'var(--color-accent)' : 'var(--color-neutral-600)';

/** Present a stored answer (true/false answers travel as booleans or "true"/"false"). */
function fmtAnswer(v: string | boolean | undefined): string {
  if (v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (v === 'true') return 'True';
  if (v === 'false') return 'False';
  return v;
}

// ── Shared mastery widgets (also used by the step header) ───────────────────

export function MasteryPill({ mastery }: { mastery: Mastery }) {
  const color = masteryColor(mastery);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
      style={{
        padding: '3px 10px',
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {MASTERY_LABEL[mastery]}
    </span>
  );
}

export function MasteryBar({ score, mastery }: { score: number; mastery: Mastery }) {
  const p = pct(score);
  return (
    <div
      className="h-1.5 w-full overflow-hidden"
      style={{ background: 'var(--color-neutral-200)', borderRadius: 999 }}
      role="progressbar"
      aria-label="Mastery"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          width: `${p}%`,
          height: '100%',
          background: mastery === 'learned' ? 'var(--color-success)' : 'var(--color-accent)',
          borderRadius: 999,
          transition: 'width .4s ease',
        }}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <svg width={96} height={96} viewBox="0 0 96 96" role="img" aria-label={`Score ${pct(score)}%`}>
      <circle cx={48} cy={48} r={r} fill="none" stroke="var(--color-neutral-300)" strokeWidth={7} />
      <circle
        cx={48}
        cy={48}
        r={r}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, score)))}
        transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text x={48} y={54} textAnchor="middle" fontSize={19} fontWeight={600} fill="var(--color-text)">
        {pct(score)}%
      </text>
    </svg>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="section-label" style={{ margin: 0 }}>
          {title}
        </h3>
        {aside && (
          <span className="text-xs" style={{ opacity: 0.6 }}>
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function CheckList({ items, tone }: { items: string[]; tone: 'success' | 'warning' }) {
  const color = `var(--color-${tone})`;
  if (items.length === 0)
    return (
      <p className="text-xs" style={{ opacity: 0.5 }}>
        Nothing here
      </p>
    );
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 shrink-0" style={{ color }}>
            {tone === 'success' ? <HiCheck className="h-4 w-4" /> : <HiXMark className="h-4 w-4" />}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const NON_ASSESSED_HINT = 'This strategy earns XP but does not count toward mastery on its own — try a quiz or teach-back to lock it in.';

function QuizDetail({ result, content }: { result: QuizResult; content: QuizContent | null }) {
  const byId = new Map((content?.questions ?? []).map((q) => [q.id, q]));
  const correct = result.graded.filter((g) => g.isCorrect).length;
  return (
    <Section
      title="Answers"
      aside={`${correct}/${result.graded.length} correct · ${result.passed ? 'Passed' : `Pass mark ${pct(content?.passScore ?? 0.7)}%`}`}
    >
      {result.graded.map((g, i) => {
        const q = byId.get(g.questionId);
        const color = g.isCorrect ? 'var(--color-success)' : 'var(--color-danger)';
        return (
          <div key={g.questionId} className="card space-y-2 p-4" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0" style={{ color }} aria-label={g.isCorrect ? 'Correct' : 'Incorrect'}>
                {g.isCorrect ? <HiCheck className="h-4 w-4" /> : <HiXMark className="h-4 w-4" />}
              </span>
              <p className="flex-1 text-sm font-semibold">{q?.prompt ?? `Question ${i + 1}`}</p>
            </div>
            <p className="text-xs">
              <span style={{ opacity: 0.55 }}>Your answer: </span>
              {fmtAnswer(g.studentAnswer)}
            </p>
            {!g.isCorrect && q?.correctAnswer !== undefined && (
              <p className="text-xs" style={{ color: 'var(--color-success)' }}>
                Correct answer: {fmtAnswer(q.correctAnswer)}
              </p>
            )}
            {g.feedback && (
              <p className="text-xs" style={{ opacity: 0.7 }}>
                {g.feedback}
              </p>
            )}
            {q?.explanation && (
              <p className="pt-2 text-xs" style={{ opacity: 0.6, borderTop: '1px solid var(--color-divider)' }}>
                {q.explanation}
              </p>
            )}
          </div>
        );
      })}
    </Section>
  );
}

function RecallDetail({ result }: { result: RecallResult }) {
  return (
    <Section title="Tutor review" aside={`${result.covered.length}/${result.covered.length + result.missing.length} rubric points`}>
      <div className="card space-y-4 p-4">
        {result.feedback && <p className="text-sm leading-relaxed">{result.feedback}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>
              Covered
            </div>
            <CheckList items={result.covered} tone="success" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>
              Missing
            </div>
            <CheckList items={result.missing} tone="warning" />
          </div>
        </div>
        {result.answer && (
          <details className="text-xs">
            <summary className="cursor-pointer" style={{ opacity: 0.6 }}>
              Your explanation
            </summary>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed" style={{ opacity: 0.8 }}>
              {result.answer}
            </p>
          </details>
        )}
      </div>
    </Section>
  );
}

const VERDICT: Record<DiscussionResult['verdict'], { label: string; color: 'green' | 'cyan' | 'yellow' }> = {
  learned: { label: 'Convinced', color: 'green' },
  progressing: { label: 'Progressing', color: 'cyan' },
  struggling: { label: 'Struggling', color: 'yellow' },
};

function DiscussionDetail({ result }: { result: DiscussionResult }) {
  const verdict = VERDICT[result.verdict] ?? VERDICT.progressing;
  return (
    <Section title="Tutor verdict" aside={`${result.turns} turn${result.turns === 1 ? '' : 's'}`}>
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge color={verdict.color}>{verdict.label}</Badge>
          <span className="text-sm" style={{ opacity: 0.7 }}>
            Tutor confidence {pct(result.confidence)}%
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>
              Covered objectives
            </div>
            <CheckList items={result.coveredObjectives} tone="success" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>
              Gaps
            </div>
            <CheckList items={result.gaps} tone="warning" />
          </div>
        </div>
      </div>
    </Section>
  );
}

function TallyDetail({ title, done, total, noun }: { title: string; done: number; total: number; noun: string }) {
  return (
    <Section title={title}>
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1 }}>
          {done}
          <span style={{ opacity: 0.4 }}>/{total}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            {total === 0 ? `No ${noun} this time` : `${noun} right`}
          </p>
          <p className="text-xs" style={{ opacity: 0.55 }}>
            {NON_ASSESSED_HINT}
          </p>
        </div>
      </div>
    </Section>
  );
}

function KindDetail({ activity }: { activity: LearningActivity }) {
  const r = activity.result;
  if (!r) return null;
  switch (activity.kind) {
    case 'quiz':
      return <QuizDetail result={r as QuizResult} content={activity.content as QuizContent | null} />;
    case 'recall':
      return <RecallDetail result={r as RecallResult} />;
    case 'discussion':
      return <DiscussionDetail result={r as DiscussionResult} />;
    case 'flashcards': {
      const fr = r as FlashcardsResult;
      return <TallyDetail title="Cards" done={fr.correct} total={fr.total} noun="cards" />;
    }
    case 'lesson': {
      const lr = r as LessonResult;
      return <TallyDetail title="Checkpoints" done={lr.checkpointsCorrect} total={lr.total} noun="checkpoints" />;
    }
    default:
      return null;
  }
}

// ── Outcome ─────────────────────────────────────────────────────────────────

/** Celebration + breakdown after an activity is submitted. */
export default function ActivityOutcome({ result, step, onNext, onAgain, onBack }: ActivityOutcomeProps) {
  const { activity, skill, previousMastery, justLearned, xpGained, profile } = result;
  const meta = ACTIVITY_META[activity.kind];
  const score = activity.score;
  const masteryChanged = previousMastery !== skill.mastery;

  return (
    <div className="space-y-5">
      <div
        className="card"
        style={{
          padding: 'var(--space-6)',
          borderColor: justLearned ? 'color-mix(in srgb, var(--color-success) 55%, transparent)' : undefined,
        }}
      >
        <div className="card-kicker">
          {meta.emoji} {meta.label} complete
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <div style={{ fontSize: 48, fontWeight: 600, lineHeight: 1, color: 'var(--color-accent)' }}>
              +{xpGained} XP
            </div>
            <p className="mt-2 text-sm" style={{ opacity: 0.6 }}>
              {step.title}
            </p>
          </div>
          {score !== null && <ScoreRing score={score} />}
        </div>

        {justLearned && (
          <div
            className="mt-5 text-sm"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'color-mix(in srgb, var(--color-success) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-success) 40%, transparent)',
            }}
          >
            <span style={{ fontSize: 18 }} aria-hidden>
              🎉
            </span>{' '}
            <strong style={{ color: 'var(--color-success)' }}>Topic learned!</strong> It now counts in every course that
            teaches it.
          </div>
        )}

        <div
          className="mt-5 flex flex-wrap items-center gap-3"
          style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}
        >
          <span className="text-xs" style={{ opacity: 0.55 }}>
            Mastery
          </span>
          <MasteryPill mastery={previousMastery} />
          {masteryChanged ? (
            <>
              <span style={{ opacity: 0.5 }} aria-hidden>
                →
              </span>
              <MasteryPill mastery={skill.mastery} />
            </>
          ) : (
            <span className="text-xs" style={{ opacity: 0.45 }}>
              unchanged
            </span>
          )}
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <MasteryBar score={skill.masteryScore} mastery={skill.mastery} />
            <span className="text-xs font-semibold" style={{ minWidth: 34, textAlign: 'right' }}>
              {pct(skill.masteryScore)}%
            </span>
          </div>
        </div>

        <p className="mt-3 text-sm" style={{ opacity: 0.75 }}>
          🔥 {profile.streak}-day streak · {profile.xpToday}/{profile.dailyGoalXp} XP today
          {profile.goalHitToday && (
            <span style={{ color: 'var(--color-success)' }}> · Daily goal hit ✓</span>
          )}
        </p>
      </div>

      <KindDetail activity={activity} />

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {step.nextStepId ? 'Next topic' : 'Back to roadmap'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          Try another strategy
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back to course
        </button>
      </div>
    </div>
  );
}

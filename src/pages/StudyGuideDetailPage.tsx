import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HiArrowLeft,
  HiSparkles,
  HiTrash,
  HiAcademicCap,
  HiClipboardDocumentList,
  HiMapPin,
  HiListBullet,
  HiBookmark,
  HiHashtag,
} from 'react-icons/hi2';
import Badge from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Card from '../components/shared/Card';
import Spinner from '../components/shared/Spinner';
import { useStudyGuides } from '../hooks/useStudyGuides';
import { useStudyGuideGeneration } from '../hooks/useStudyGuideGeneration';
import type { StudyGuideStatus, StudyGuideContent } from '../types/studyGuide';

// ── Animation variants ─────────────────────────────────────────────────────
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function StudyGuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentGuide, isLoading, loadGuide, deleteGuide } = useStudyGuides();
  const { progress, isGenerating, generate } = useStudyGuideGeneration(id);

  useEffect(() => {
    if (id) loadGuide(id);
  }, [id, loadGuide]);

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('Delete this study guide? This cannot be undone.')) return;
    try {
      await deleteGuide(id);
      navigate('/study-guides');
    } catch (err) {
      console.error('Failed to delete study guide:', err);
    }
  };

  const handleGenerate = () => {
    if (id) generate(id);
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading && !currentGuide) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Spinner />
        <p className="mt-4 text-sm text-slate-400">Loading study guide…</p>
      </div>
    );
  }

  if (!currentGuide || !id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <HiAcademicCap className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-400">Study guide not found.</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate('/study-guides')}>
          ← Back to Study Guides
        </Button>
      </div>
    );
  }

  const guide = currentGuide;
  const hasContent = guide.status === 'done' && guide.content;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start sm:items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/study-guides')}>
          <HiArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-bold text-white truncate flex items-center gap-2">
            <HiAcademicCap className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
            <span className="truncate">{guide.title}</span>
          </h1>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            <GuideStatusBadge status={guide.status} isGenerating={isGenerating} />
            <Badge color="gray">
              Updated {new Date(guide.updatedAt).toLocaleDateString()}
            </Badge>
          </div>
        </div>
      </div>

      {/* ── Action bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {guide.status !== 'done' && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            isLoading={isGenerating}
          >
            <HiSparkles className="w-4 h-4" />
            {isGenerating ? 'Generating…' : guide.status === 'error' ? 'Retry Generation' : 'Generate'}
          </Button>
        )}
        {guide.status === 'done' && (
          <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={isGenerating}>
            <HiSparkles className="w-4 h-4" />
            Regenerate
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <HiTrash className="w-4 h-4" />
          Delete
        </Button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {hasContent ? (
        <GuideContent content={guide.content!} />
      ) : (
        <GenerationPanel status={guide.status} progress={progress} error={guide.error} />
      )}
    </div>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────
function GuideStatusBadge({
  status,
  isGenerating,
}: {
  status: StudyGuideStatus;
  isGenerating: boolean;
}) {
  if (isGenerating) return <Badge color="cyan">Generating…</Badge>;
  if (status === 'done') return <Badge color="green">Ready</Badge>;
  if (status === 'error') return <Badge color="red">Error</Badge>;
  if (status === 'generating') return <Badge color="cyan">Generating…</Badge>;
  return <Badge color="gray">Pending</Badge>;
}

// ── Generation progress panel ──────────────────────────────────────────────
function GenerationPanel({
  status,
  progress,
  error,
}: {
  status: StudyGuideStatus;
  progress: ReturnType<typeof useStudyGuideGeneration>['progress'];
  error: string | null;
}) {
  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const active = status === 'generating' || !!progress;
  const message = progress?.message ?? (status === 'error' ? error : 'Waiting to generate…');

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <div className="flex flex-col items-center justify-center text-center py-10 px-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-5">
            {status === 'error' ? (
              <HiTrash className="w-7 h-7 text-red-400" />
            ) : active ? (
              <Spinner size="lg" />
            ) : (
              <HiSparkles className="w-7 h-7 text-cyan-400" />
            )}
          </div>

          <h3 className="text-lg font-semibold text-slate-200 mb-1.5">
            {status === 'error'
              ? 'Generation failed'
              : active
                ? 'Generating your study guide'
                : 'Ready to generate'}
          </h3>
          <p className="text-sm text-slate-400 max-w-md">
            {status === 'error' && error
              ? error
              : message ||
                'Click “Generate” to synthesize an overview, concept roadmap, and suggested study order from your materials.'}
          </p>

          {/* Progress bar */}
          {active && progress && progress.total > 0 && (
            <div className="w-full max-w-md mt-6">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>{progress.status === 'synthesizing' ? 'Synthesizing' : 'Analyzing materials'}</span>
                <span className="text-cyan-400">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-700/60 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-500 to-teal-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              {progress.currentTitle && (
                <p className="mt-2 text-xs text-slate-500 truncate">{progress.currentTitle}</p>
              )}
            </div>
          )}

          {/* Spinner-only state (collecting, no total yet) */}
          {active && progress && progress.total === 0 && progress.message && (
            <p className="mt-4 text-xs text-cyan-400 animate-pulse">{progress.message}</p>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ── Full content renderer ──────────────────────────────────────────────────
function GuideContent({ content }: { content: StudyGuideContent }) {
  return (
    <motion.div
      className="space-y-4 sm:space-y-5"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
    >
      {/* Overview */}
      <Section icon={<HiBookmark className="w-4 h-4" />} title="Overview">
        <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{content.overview}</p>
      </Section>

      {/* Prerequisites */}
      {content.prerequisites.length > 0 && (
        <Section icon={<HiClipboardDocumentList className="w-4 h-4" />} title="Prerequisites">
          <ul className="space-y-2">
            {content.prerequisites.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Concept Roadmap */}
      {content.conceptRoadmap.length > 0 && (
        <Section icon={<HiMapPin className="w-4 h-4" />} title="Concept Roadmap">
          <div className="space-y-3">
            {content.conceptRoadmap.map((item, i) => (
              <div
                key={i}
                className="rounded-lg bg-slate-900/40 border border-slate-700/40 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-600/20 text-cyan-400 text-xs font-bold shrink-0">
                    {i + 1}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-200">{item.concept}</h4>
                </div>
                <p className="text-sm text-slate-400 ml-8">{item.description}</p>
                {item.dependsOn.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2 ml-8">
                    <span className="text-xs text-slate-500">Depends on:</span>
                    {item.dependsOn.map((dep, j) => (
                      <span
                        key={j}
                        className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600/50"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Per-material digests */}
      {content.perMaterial.length > 0 && (
        <Section icon={<HiClipboardDocumentList className="w-4 h-4" />} title="Material Digests">
          <div className="space-y-4">
            {content.perMaterial.map((mat, i) => (
              <div
                key={`${mat.documentId}-${i}`}
                className="rounded-lg bg-slate-900/40 border border-slate-700/40 p-4"
              >
                <h4 className="text-sm font-semibold text-cyan-300 mb-2">{mat.title}</h4>
                <p className="text-sm text-slate-400 mb-3">{mat.summary}</p>

                {mat.keyPoints.length > 0 && (
                  <DigestList label="Key Points" items={mat.keyPoints} />
                )}
                {mat.formulas.length > 0 && (
                  <DigestList label="Formulas" items={mat.formulas} mono />
                )}
                {mat.definitions.length > 0 && (
                  <DigestList label="Definitions" items={mat.definitions} />
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Key Formulas & Definitions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {content.keyFormulas.length > 0 && (
          <Section icon={<HiHashtag className="w-4 h-4" />} title="Key Formulas">
            <ul className="space-y-2">
              {content.keyFormulas.map((f, i) => (
                <li
                  key={i}
                  className="text-sm font-mono text-teal-300 bg-slate-900/50 border border-slate-700/40 rounded-md px-3 py-2 break-words"
                >
                  {f}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {content.keyDefinitions.length > 0 && (
          <Section icon={<HiBookmark className="w-4 h-4" />} title="Key Definitions">
            <dl className="space-y-2.5">
              {content.keyDefinitions.map((d, i) => (
                <div key={i} className="text-sm text-slate-300">
                  <p className="leading-relaxed">{d}</p>
                </div>
              ))}
            </dl>
          </Section>
        )}
      </div>

      {/* Suggested Study Order */}
      {content.suggestedOrder.length > 0 && (
        <Section icon={<HiListBullet className="w-4 h-4" />} title="Suggested Study Order">
          <ol className="space-y-2.5">
            {content.suggestedOrder.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-600/20 text-cyan-400 text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200">{item.title}</p>
                  {item.reason && <p className="text-xs text-slate-500 mt-0.5">{item.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {content.generatedAt && (
        <p className="text-xs text-slate-600 text-center pt-2">
          Generated {new Date(content.generatedAt).toLocaleString()}
        </p>
      )}
    </motion.div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={sectionVariants} transition={{ duration: 0.3 }}>
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-cyan-400">{icon}</span>
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">{title}</h3>
        </div>
        {children}
      </Card>
    </motion.div>
  );
}

// ── Digest sub-list ─────────────────────────────────────────────────────────
function DigestList({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className={`text-sm text-slate-300 flex items-start gap-2 ${mono ? 'font-mono' : ''}`}
          >
            <span className="mt-1.5 w-1 h-1 rounded-full bg-teal-400 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

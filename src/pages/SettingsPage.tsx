import { useEffect, useState } from 'react';
import SettingsPanel from '../components/settings/SettingsPanel';
import IntegrationsSection from '../components/settings/IntegrationsSection';
import McpSettings from '../components/settings/McpSettings';
import { useAuthStore } from '../store/authStore';
import { useLearningStore } from '../store/learningStore';
import type { LearningMode } from '../types/learning';

type Tab = 'ai' | 'integrations';

const MODES: Array<{ id: LearningMode; label: string; blurb: string }> = [
  { id: 'legacy', label: 'Classic strategies', blurb: 'Pick your own — lessons, quizzes, flashcards, teach-backs and more.' },
  { id: 'flow', label: 'Guided flow', blurb: 'Duolingo-style: the app picks each lesson for you — learn, review, test.' },
];

/** Learning style: legacy strategies vs the guided flow. Saved on the account. */
function LearningStyle() {
  const learningMode = useLearningStore((s) => s.learningMode);
  const loadLearningMode = useLearningStore((s) => s.loadLearningMode);
  const setLearningMode = useLearningStore((s) => s.setLearningMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLearningMode();
  }, [loadLearningMode]);

  const pick = async (mode: LearningMode) => {
    if (mode === learningMode || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setLearningMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3" style={{ padding: 'var(--space-4)' }}>
      <div className="card-kicker">Learning style</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => {
          const on = learningMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              disabled={busy || learningMode === null}
              onClick={() => void pick(m.id)}
              className="p-3 text-left transition-colors"
              style={{
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                background: on ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent',
              }}
            >
              <div className="text-sm font-semibold">{m.label}{on ? ' ✓' : ''}</div>
              <div className="mt-1 text-xs" style={{ opacity: 0.6 }}>{m.blurb}</div>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('ai');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="space-y-4 sm:space-y-6" style={{ maxWidth: 860 }}>
      <div>
        <div className="card-kicker" style={{ fontSize: 13 }}>Workspace</div>
        <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Settings</h1>
        <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>Configure your study environment</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setTab('ai')}
          className={`btn ${tab === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
        >
          AI
        </button>
        <button
          onClick={() => setTab('integrations')}
          className={`btn ${tab === 'integrations' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Accounts &amp; Calendars
        </button>
      </div>
      {tab === 'ai' ? (
        <div className="space-y-4 sm:space-y-6">
          <LearningStyle />
          <SettingsPanel />
          <McpSettings />
        </div>
      ) : (
        <IntegrationsSection />
      )}

      {/* Account — sign out lives where people actually look for it */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="card-kicker">Account</div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user?.name || 'Signed in'}</div>
            <div className="truncate text-xs" style={{ opacity: 0.55 }}>{user?.email}</div>
          </div>
          <button
            onClick={() => void logout()}
            className="btn btn-secondary shrink-0"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

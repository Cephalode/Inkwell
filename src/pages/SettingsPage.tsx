import { useState } from 'react';
import SettingsPanel from '../components/settings/SettingsPanel';
import IntegrationsSection from '../components/settings/IntegrationsSection';

type Tab = 'ai' | 'integrations';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('ai');

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
      {tab === 'ai' ? <SettingsPanel /> : <IntegrationsSection />}
    </div>
  );
}

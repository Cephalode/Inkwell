import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiArrowPath, HiExclamationTriangle } from 'react-icons/hi2';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';
import IntegrationCard from './IntegrationCard';
import LinkIntegrationModal from './LinkIntegrationModal';
import { CATEGORY_META, CATEGORY_ORDER } from '../../config/integrations';
import type { IntegrationStatus } from '../../types/integration';
import { listIntegrations, refreshIntegration } from '../../services/api/integrations';

export default function IntegrationsSection() {
  const navigate = useNavigate();
  const [items, setItems] = useState<IntegrationStatus[] | null>(null);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState<IntegrationStatus | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const load = useCallback(() => {
    setError('');
    setItems(null);
    listIntegrations()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load integrations'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      await Promise.allSettled((items ?? []).filter((i) => i.connected && !i.managedElsewhere).map((i) => refreshIntegration(i.id)));
    } finally {
      setRefreshingAll(false);
      load();
    }
  };

  if (error && items === null) {
    return (
      <div className="max-w-3xl w-full">
        <div className="card p-6 space-y-3">
          <div className="flex items-center gap-2">
            <HiExclamationTriangle className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
            <span className="font-medium">Could not load integrations</span>
          </div>
          <p className="text-sm" style={{ opacity: 0.6 }}>{error}</p>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="max-w-3xl w-full flex items-center gap-3" style={{ opacity: 0.6 }}>
        <Spinner />
        <span className="text-sm">Loading integrations…</span>
      </div>
    );
  }

  const connectedCount = items.filter((i) => i.connected).length;

  return (
    <div className="max-w-3xl w-full space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ opacity: 0.6 }}>{connectedCount} of {items.length} connected</p>
        {connectedCount > 0 && (
          <Button size="sm" variant="ghost" onClick={refreshAll} isLoading={refreshingAll}>
            <HiArrowPath className="w-4 h-4" />
            Refresh all
          </Button>
        )}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const inCat = items.filter((i) => i.category === cat);
        if (inCat.length === 0) return null;
        const meta = CATEGORY_META[cat];
        const CatIcon = meta.icon;
        const n = inCat.filter((i) => i.connected).length;
        return (
          <section key={cat} className="space-y-3">
            <div className="flex items-center gap-2">
              <CatIcon className="w-5 h-5 text-[var(--color-accent)]" />
              <h3 className="section-label" style={{ margin: 0 }}>{meta.label}</h3>
              <span className="text-xs" style={{ opacity: 0.5 }}>{n} connected</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inCat.map((i) => (
                <IntegrationCard
                  key={i.id}
                  integration={i}
                  onChanged={load}
                  onConnect={setLinking}
                  onManage={navigate}
                />
              ))}
            </div>
          </section>
        );
      })}

      {linking && (
        <LinkIntegrationModal
          integration={linking}
          onClose={() => setLinking(null)}
          onLinked={load}
        />
      )}
    </div>
  );
}

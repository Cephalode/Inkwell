import { useState } from 'react';
import { HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import Button from '../shared/Button';
import Card from '../shared/Card';
import ConfirmDialog from '../shared/ConfirmDialog';
import Spinner from '../shared/Spinner';
import { primaryAccountLine, providerIcon } from '../../config/integrations';
import type { CalendarEvent, IntegrationStatus } from '../../types/integration';
import { getIntegrationEvents, refreshIntegration, unlinkIntegration } from '../../services/api/integrations';

interface IntegrationCardProps {
  integration: IntegrationStatus;
  onChanged: () => void;
  onConnect: (i: IntegrationStatus) => void;
  onManage: (path: string) => void;
}

export default function IntegrationCard({ integration: s, onChanged, onConnect, onManage }: IntegrationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const Icon = providerIcon(s.id);
  const isCalendar = s.category === 'calendar';

  const toggleEvents = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && events === null && !eventsLoading) {
      setEventsLoading(true);
      setEventsError('');
      try {
        setEvents(await getIntegrationEvents(s.id));
      } catch (e) {
        setEventsError(e instanceof Error ? e.message : 'Failed to load events');
      } finally {
        setEventsLoading(false);
      }
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      await refreshIntegration(s.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');
    try {
      await unlinkIntegration(s.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  const dimmed = !s.available && !s.connected ? ' opacity-60' : '';

  return (
    <div className={dimmed}>
      <Card className="h-full">
        <div className="flex flex-col gap-3 h-full">
          <div className="flex items-start gap-3">
            <Icon className="w-6 h-6 shrink-0 mt-0.5 text-[var(--color-accent)]" />
            <div className="min-w-0 flex-1">
              <h4 className="leading-tight">{s.label}</h4>
              <p className="text-xs line-clamp-2 mt-0.5" style={{ opacity: 0.6 }}>{s.description}</p>
            </div>
          </div>

          <div className="flex-1" />

          {!s.available && !s.connected && (
            <div>
              <span
                className="inline-block text-xs px-2.5 py-1"
                style={{ background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-sm)', opacity: 0.75 }}
              >
                Coming soon
              </span>
            </div>
          )}

          {!s.connected && s.available && !s.managedElsewhere && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs" style={{ opacity: 0.5 }}>Not connected</span>
              <Button size="sm" onClick={() => onConnect(s)}>Connect</Button>
            </div>
          )}

          {s.connected && s.managedElsewhere && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-success)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-success)' }} />
                Connected
              </span>
              <Button size="sm" variant="ghost" onClick={() => onManage(s.managedElsewhere!)}>Manage</Button>
            </div>
          )}

          {s.connected && !s.managedElsewhere && (
            <>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--color-success)' }} />
                  <span className="truncate">{primaryAccountLine(s)}</span>
                </div>
                {s.linkedAt && <p className="text-xs pl-3.5" style={{ opacity: 0.5 }}>Linked {new Date(s.linkedAt).toLocaleDateString()}</p>}
              </div>
              {isCalendar && (
                <button
                  onClick={toggleEvents}
                  className="flex items-center gap-1 text-xs self-start"
                  style={{ color: 'var(--color-accent-700)' }}
                  type="button"
                >
                  Upcoming
                  {expanded ? <HiChevronUp className="w-3.5 h-3.5" /> : <HiChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
              {isCalendar && expanded && (
                <div
                  className="p-2.5 space-y-1.5"
                  style={{
                    background: 'var(--color-neutral-200)',
                    border: '1px solid var(--color-divider)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {eventsLoading && (
                    <div className="flex items-center gap-2 text-xs" style={{ opacity: 0.6 }}><Spinner size="sm" /> Loading events…</div>
                  )}
                  {!eventsLoading && eventsError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{eventsError}</p>}
                  {!eventsLoading && !eventsError && events !== null && events.length === 0 && (
                    <p className="text-xs" style={{ opacity: 0.5 }}>No upcoming events</p>
                  )}
                  {!eventsLoading && !eventsError && events?.slice(0, 5).map((ev, i) => (
                    <div key={i} className="text-xs">
                      <p className="truncate">{ev.title}</p>
                      <p style={{ opacity: 0.5 }}>{ev.allDay ? 'All day' : new Date(ev.start).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant="ghost" onClick={refresh} isLoading={busy}>Refresh</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)} disabled={busy}>Disconnect</Button>
              </div>
            </>
          )}

          {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect integration?"
        message={`Disconnect ${s.label}? You can reconnect it later.`}
        confirmLabel="Disconnect"
        onConfirm={() => { setConfirmDisconnect(false); void disconnect(); }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

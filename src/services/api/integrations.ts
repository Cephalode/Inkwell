import type { AccountInfo, CalendarEvent, IntegrationStatus } from '../../types/integration';

const API = (typeof window !== 'undefined' ? window.location.origin : '') + '/api/integrations';

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}

export const listIntegrations = () =>
  fetch(API).then((r) => json<{ integrations: IntegrationStatus[] }>(r)).then((d) => d.integrations);

export const linkIntegration = (id: string, values: Record<string, string>) =>
  fetch(`${API}/${id}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  }).then((r) => json<{ ok: boolean; accountInfo?: AccountInfo }>(r));

export const unlinkIntegration = (id: string) =>
  fetch(`${API}/${id}/link`, { method: 'DELETE' }).then((r) => json<{ ok: boolean }>(r));

export const refreshIntegration = (id: string) =>
  fetch(`${API}/${id}/refresh`, { method: 'POST' }).then((r) => json<{ ok: boolean; accountInfo?: AccountInfo }>(r));

export const getIntegrationEvents = (id: string) =>
  fetch(`${API}/${id}/events`).then((r) => json<{ events: CalendarEvent[] }>(r)).then((d) => d.events);

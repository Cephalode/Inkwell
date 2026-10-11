import { Router, type Request, type Response } from 'express';
import pool from '../db.js';
import { providers, getProvider } from '../src/integrations/registry.js';
import { errorKind } from '../src/integrations/types.js';

const router = Router();

interface Row {
  provider: string;
  credentials: Record<string, string>;
  account_info: Record<string, unknown> | null;
  linked_at: Date;
  updated_at: Date;
}

async function getRows(): Promise<Map<string, Row>> {
  const { rows } = await pool.query<Row>('SELECT * FROM integrations');
  return new Map(rows.map((r) => [r.provider, r]));
}

async function courseraConnected(): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM coursera_account LIMIT 1');
  return rows.length > 0;
}

interface StatusEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  authKind: string;
  docsUrl: string | undefined;
  available: boolean;
  fields: unknown[];
  connected: boolean;
  accountInfo?: Record<string, unknown>;
  linkedAt?: string;
  managedElsewhere?: string;
}

function statusEntry(p: (typeof providers)[number], row: Row | undefined): StatusEntry {
  return {
    id: p.id, label: p.label, description: p.description,
    category: p.category, authKind: p.authKind, docsUrl: p.docsUrl,
    available: p.available, fields: p.fields,
    connected: !!row,
    accountInfo: row?.account_info ?? undefined,
    linkedAt: row?.linked_at instanceof Date ? row.linked_at.toISOString() : row?.linked_at,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await getRows();
    const list: ReturnType<typeof statusEntry>[] = providers.map((p) => statusEntry(p, rows.get(p.id)));
    const courseraRow = await courseraConnected();
    list.push({
      id: 'coursera', label: 'Coursera', description: 'Import courses from your Coursera account.',
      category: 'learning', authKind: 'token', docsUrl: 'https://www.coursera.org',
      available: true, fields: [], connected: courseraRow,
      managedElsewhere: '/coursera',
    });
    res.json({ integrations: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function providerOr404(req: Request, res: Response, allowUnavailable = false) {
  const p = getProvider(String(req.params.id));
  if (!p) {
    res.status(404).json({ error: 'Unknown integration' });
    return null;
  }
  if (!allowUnavailable && !p.available) {
    res.status(400).json({ error: `${p.label} is not available yet` });
    return null;
  }
  return p;
}

function sendValidateError(res: Response, err: unknown, label: string) {
  const kind = errorKind(err);
  if (kind === 'auth') return res.status(401).json({ error: err instanceof Error ? err.message : 'Credentials rejected' });
  if (kind === 'network') return res.status(502).json({ error: err instanceof Error ? err.message : `Could not reach ${label}` });
  res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

router.post('/:id/link', async (req: Request, res: Response) => {
  const p = providerOr404(req, res);
  if (!p) return;
  const values: Record<string, string> = req.body?.values ?? {};
  for (const f of p.fields) {
    if (!values[f.key] || !String(values[f.key]).trim()) {
      return res.status(400).json({ error: `${f.label} is required` });
    }
  }
  try {
    const accountInfo = await p.validate(values);
    await pool.query(
      `INSERT INTO integrations (provider, credentials, account_info, linked_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (provider) DO UPDATE
       SET credentials = EXCLUDED.credentials, account_info = EXCLUDED.account_info, updated_at = NOW()`,
      [p.id, JSON.stringify(values), JSON.stringify(accountInfo)],
    );
    res.json({ ok: true, accountInfo });
  } catch (err) {
    sendValidateError(res, err, p.label);
  }
});

router.delete('/:id/link', async (req: Request, res: Response) => {
  const p = providerOr404(req, res, true);
  if (!p) return;
  try {
    await pool.query('DELETE FROM integrations WHERE provider = $1', [p.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/refresh', async (req: Request, res: Response) => {
  const p = providerOr404(req, res, true);
  if (!p) return;
  try {
    const { rows } = await pool.query('SELECT * FROM integrations WHERE provider = $1', [p.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Not linked' });
    if (!p.available) return res.status(400).json({ error: `${p.label} is not available yet` });
    const accountInfo = await p.validate(row.credentials);
    await pool.query(
      'UPDATE integrations SET account_info = $1, updated_at = NOW() WHERE provider = $2',
      [JSON.stringify(accountInfo), p.id],
    );
    res.json({ ok: true, accountInfo });
  } catch (err) {
    if (errorKind(err) === 'auth') return res.status(401).json({ error: 'Connection lost — relink required' });
    sendValidateError(res, err, p.label);
  }
});

router.get('/:id/events', async (req: Request, res: Response) => {
  const p = providerOr404(req, res);
  if (!p) return;
  if (!p.fetchUpcomingEvents) return res.status(400).json({ error: `${p.label} does not provide calendar events` });
  try {
    const { rows } = await pool.query('SELECT credentials FROM integrations WHERE provider = $1', [p.id]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Not linked' });
    res.json({ events: await p.fetchUpcomingEvents(row.credentials) });
  } catch (err) {
    sendValidateError(res, err, p.label);
  }
});

export default router;

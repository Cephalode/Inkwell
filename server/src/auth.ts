// Google OAuth sign-in + cookie sessions + multi-user scoping.
// Data model: every row has user_id; 'shared' rows are the pre-auth legacy
// dataset and get claimed by the first person to sign in.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomBytes, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import '../env.js';

// ── Config (project .env; process env wins) ─────────────────────────────────
let envVal: string | undefined;
try {
  envVal = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), 'utf8');
} catch { /* no .env */ }
const envGet = (k: string): string | undefined => process.env[k] || envVal?.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();

export const GOOGLE_CLIENT_ID = envGet('GOOGLE_CLIENT_ID') || '';
export const GOOGLE_CLIENT_SECRET = envGet('GOOGLE_CLIENT_SECRET') || '';
export const PUBLIC_ORIGIN = envGet('PUBLIC_ORIGIN') || 'https://inkwell.cephalode.com';
export const AUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const SESSION_SECRET_SOURCE = envGet('SESSION_SECRET') || ''; // reserved; tokens are random 32B

const SESSION_COOKIE = 'inkwell_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

// ── Types ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  plan: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: User | null }
  }
}

// ── Session helpers ─────────────────────────────────────────────────────────
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = newToken();
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)],
  );
  // httpOnly + sameSite=lax (survives the OAuth redirect back); secure on prod
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PUBLIC_ORIGIN.startsWith('https'),
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

async function userForToken(token: string): Promise<User | null> {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.picture, u.plan
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return (rows[0] as User) || null;
}

/** Read the session cookie and attach req.user (or null). */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = null;
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) {
    try { req.user = await userForToken(token); } catch { req.user = null; }
  }
  next();
}

/**
 * Enforce auth. Unless AUTH is explicitly disabled (no OAuth creds configured),
 * every API request must carry a valid session.
 * ponytail: single global gate — the shared legacy dataset is claimed on first
 * sign-in; if multi-owner sharing is ever wanted, replace CLAIM + this gate.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_ENABLED) return next(); // dev without OAuth creds — legacy single-user behavior
  if (req.user) return next();
  res.status(401).json({ error: 'Sign in required' });
}

/** The current tenant key for writes/scopes. */
export function uid(req: Request): string {
  return req.user?.id || 'shared';
}

// ── First sign-in claims the legacy shared dataset ──────────────────────────
async function claimSharedRows(userId: string): Promise<void> {
  const tables = [
    'documents', 'textbooks', 'courses', 'chat_sessions',
    'flashcard_decks', 'study_guides', 'practice_tests', 'roadmaps',
    'integrations', 'coursera_account',
  ];
  for (const t of tables) {
    await pool.query(`UPDATE ${t} SET user_id = $1 WHERE user_id = 'shared'`, [userId]);
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────
const router = Router();

// GET /api/auth/google/start — redirect to Google's consent screen
router.get('/google/start', (_req: Request, res: Response) => {
  if (!AUTH_ENABLED) return res.status(501).json({ error: 'OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)' });
  const state = newToken();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${PUBLIC_ORIGIN}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  // stash state in a short-lived cookie for CSRF check at the callback
  res.cookie('inkwell_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: PUBLIC_ORIGIN.startsWith('https'), maxAge: 10 * 60 * 1000, path: '/' });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — exchange code, upsert user, set session
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const cookieState = (req as Request & { cookies?: Record<string, string> }).cookies?.['inkwell_oauth_state'];
    if (!code || !state || !cookieState || state !== cookieState) {
      return res.status(400).send('OAuth state mismatch');
    }
    res.clearCookie('inkwell_oauth_state', { path: '/' });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${PUBLIC_ORIGIN}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResp.ok) {
      console.error('Google token exchange failed:', await tokenResp.text());
      return res.status(502).send('Google token exchange failed');
    }
    const { id_token } = (await tokenResp.json()) as { id_token?: string };
    if (!id_token) return res.status(502).send('No id_token from Google');

    const claimsResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
    if (!claimsResp.ok) return res.status(502).send('id_token verification failed');
    const claims = await claimsResp.json() as {
      aud?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; picture?: string;
    };
    if (claims.aud !== GOOGLE_CLIENT_ID) return res.status(401).send('Wrong audience');
    if (!claims.sub || !claims.email || claims.email_verified === 'false' || claims.email_verified === false) {
      return res.status(401).send('Email not verified');
    }

    const email = claims.email.toLowerCase();
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, name, picture, google_sub)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, picture = EXCLUDED.picture, google_sub = EXCLUDED.google_sub
       RETURNING id, email, name, picture, plan`,
      [randomBytes(12).toString('hex'), email, claims.name || null, claims.picture || null, claims.sub],
    );
    const user = rows[0] as User;

    // Anonymous-first linking: if this browser had an anon session, fold its
    // content into the real account (Turbo's "no data migration" behavior).
    // The anon session cookie is still on the request during the callback —
    // the new session replaces it only after createSession below.
    const anonToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
    if (anonToken) {
      try {
        const anon = await pool.query(
          `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()`,
          [hashToken(anonToken)],
        );
        const anonId = (anon.rows[0] as { user_id: string } | undefined)?.user_id;
        if (anonId && anonId !== user.id) {
          const anonUser = await pool.query('SELECT is_anonymous FROM users WHERE id = $1', [anonId]);
          if ((anonUser.rows[0] as { is_anonymous: boolean } | undefined)?.is_anonymous) {
            await mergeAnonUser(anonId, user.id);
          }
        }
      } catch (err) {
        console.error('Anon merge failed (continuing with sign-in):', err);
      }
    }

    await claimSharedRows(user.id);
    await createSession(res, user.id);
    res.redirect('/');
  } catch (err: unknown) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Sign-in failed');
  }
});

// ── Anonymous-first sessions (E8 / PRD 9) ───────────────────────────────────
// Every visitor gets a session immediately; Google sign-in later claims the
// same rows (no data migration). Requires OAuth to be configured — without it
// the app runs in legacy shared-user mode anyway.

/** Move every row this anon user owns to the claiming user, then remove them. */
async function mergeAnonUser(anonId: string, intoId: string): Promise<void> {
  const tables = [
    'documents', 'textbooks', 'courses', 'chat_sessions',
    'flashcard_decks', 'study_guides', 'practice_tests', 'roadmaps',
    'integrations', 'coursera_account', 'folders', 'lessons',
  ];
  for (const t of tables) {
    try { await pool.query(`UPDATE ${t} SET user_id = $2 WHERE user_id = $1`, [anonId, intoId]); }
    catch { /* table without user_id — skip */ }
  }
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [anonId]);
  await pool.query('DELETE FROM users WHERE id = $1', [anonId]);
}

// POST /api/auth/anon — get (or create) an anonymous session.
router.post('/anon', async (req: Request, res: Response) => {
  if (!AUTH_ENABLED) return res.status(501).json({ error: 'Auth not configured' });
  if (req.user) return res.json({ user: req.user }); // already signed in — nothing to do
  try {
    const id = randomBytes(12).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, is_anonymous) VALUES ($1, $2, true)
       RETURNING id, email, name, picture, plan`,
      [id, `anon_${id}@anonymous.inkwell.local`],
    );
    const user = rows[0] as User;
    await createSession(res, user.id);
    res.status(201).json({ user });
  } catch (err: unknown) {
    console.error('Anon session creation failed:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/auth/referral — one-time funnel capture on the current user.
router.post('/referral', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  const source = String(req.body.source || '').slice(0, 200);
  if (!source) return res.status(400).json({ error: 'source required' });
  await pool.query('UPDATE users SET referral_source = $2 WHERE id = $1 AND referral_source IS NULL', [req.user.id, source]);
  res.json({ ok: true });
});

// GET /api/auth/me — current user (null when signed out)
router.get('/me', (req: Request, res: Response) => {
  res.json({ user: req.user || null, authEnabled: AUTH_ENABLED });
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) {
    try { await pool.query('DELETE FROM sessions WHERE token = $1', [hashToken(token)]); } catch { /* best effort */ }
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

export default router;

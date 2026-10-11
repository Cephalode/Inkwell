# Account Isolation + Apple/Google Sign-In Migration Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close every cross-user data leak, then add Apple ID sign-in alongside the existing Google flow.

**Architecture:** The multi-user skeleton already exists (users, sessions, cookies, `user_id` columns, global `requireUser` gate). The gap is enforcement: ~12 route paths load rows by ID without a `user_id` predicate, `collectMaterials` (the AI context feed) is unscoped, and `integrations`/`coursera_account`/`learner_profile`/`videos`-watch-state are still global. Fix = one ownership helper + param threading, then Apple is a third OAuth callback shaped exactly like the Google one.

**Tech Stack:** Express + pg (Supabase Postgres), cookie sessions, OAuth. No new dependencies — Apple OAuth is plain fetch + crypto (already imported in `src/auth.ts`).

**Verified current state (audited 2026-10-01):**
- ✅ Scoped correctly: `documents.ts`, `textbooks.ts`, `chatSessions.ts`, `folders.ts`, `shares.ts`, `courses.ts`, `zipExtract.ts`
- ✅ Anon-first sessions + merge-on-signin (`mergeAnonUser`), legacy `shared` claim (`claimSharedRows`)
- 🔴 Unscoped by-ID reads/writes: `chapters.ts` (:86,:118,:162), `chapterAnalysis.ts` (:62,:220), `chapterVideos.ts` (:17,:51), `roadmaps.ts` (`findRoadmap` :186, :282, :300, :253), `learning.ts` (`loadStep` :80, :205, :591), `flashcards.ts`, `studyGuides.ts`, `practiceTests.ts`, `lessons.ts` (:88,:159,:180,:197,:221,:242)
- 🔴 Global state: `integrations.ts` (`ON CONFLICT (provider)`, credential read :149), `coursera.ts` (`WHERE id = 1`), `src/mastery.ts` `learner_profile WHERE id = 1` (:183,:198,:227), `videos.watched_at`/`watch_quiz` (shared cache rows)
- 🔴 AI context: `src/materials.ts` `collectMaterials` (:91,:119) — no user filter; `src/generationPipeline.ts:229` calls it with no args
- Frontend: `src/pages/SignInPage.tsx`, `src/store/authStore.ts` — Google button lives here; Apple button goes next to it.

---

## Phase 0 — Safety net (before any code)

### Task 0.1: Backup the database
```bash
pg_dump "$DATABASE_URL" --format=custom --file ~/inkwell-backup-$(date +%Y%m%d).dump
```
Verify: `pg_restore --list ~/inkwell-backup-*.dump | head` prints table list.

---

## Phase 1 — Data model (migration 023)

### Task 1.1: Write `server/migrations/023_tenant_hardening.sql`

```sql
-- Tenant hardening: per-user integrations, coursera, learner profile, video watch state.

-- integrations: (provider, user_id) unique instead of provider alone.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_provider_user ON integrations (provider, user_id);

-- coursera_account: drop singleton id=1 assumption. Keep PK, but code stops
-- relying on id=1 (see Task 2.4). Existing row stays claimable via user_id.
CREATE INDEX IF NOT EXISTS idx_coursera_account_user ON coursera_account (user_id);

-- learner_profile: per-user rows (old singleton id=1 becomes 'shared' history).
ALTER TABLE learner_profile DROP CONSTRAINT IF EXISTS learner_profile_id_check;
ALTER TABLE learner_profile ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
CREATE UNIQUE INDEX IF NOT EXISTS idx_learner_profile_user ON learner_profile (user_id);
-- Seed one row per existing user; keep id sequence out of the way (id becomes non-meaningful).
INSERT INTO learner_profile (user_id)
SELECT u.id FROM users u WHERE u.is_anonymous = false
ON CONFLICT (user_id) DO NOTHING;

-- videos: cache rows stay shared, but watch/quiz state moves to a join table.
CREATE TABLE IF NOT EXISTS video_watch_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  watch_quiz JSONB,
  PRIMARY KEY (user_id, video_id)
);
```

**Note:** if `videos.watch_quiz` has data you care about, copy it first:
```sql
-- one-time, inspect before running:
-- INSERT INTO video_watch_state (user_id, video_id, watch_quiz) SELECT 'shared', id, watch_quiz FROM videos WHERE watch_quiz IS NOT NULL;
```
`ponytail:` watch state on the shared cache row is the ceiling; per-user join table fixes it without duplicating transcript/summary cache.

### Task 1.2: Run migration
```bash
cd server && npx tsx migrations/run.ts
```
Expected: applies 023 cleanly. Verify columns: `psql "$DATABASE_URL" -c '\d integrations'`.

---

## Phase 2 — Enforcement sweep (the actual leak fixes)

Root cause is one shape: **by-ID loads without `user_id`**. One helper, then every call site uses it.

### Task 2.1: Add `assertOwn` to `server/src/auth.ts`

```ts
/** 404 unless row `id` in `table` belongs to the current tenant. Table names are
 *  from a fixed allowlist at call sites — never user input. */
const OWNED_TABLES = new Set([
  'documents', 'textbooks', 'courses', 'chat_sessions', 'flashcard_decks',
  'study_guides', 'practice_tests', 'roadmaps', 'integrations',
  'coursera_account', 'folders', 'lessons', 'chapters',
]);
export async function assertOwn(
  req: Request, res: Response, table: string, id: string,
): Promise<boolean> {
  if (!OWNED_TABLES.has(table)) throw new Error(`assertOwn: unknown table ${table}`);
  const { rowCount } = await pool.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND user_id = $2`, [id, uid(req)],
  );
  if (!rowCount) { res.status(404).json({ error: 'Not found' }); return false; }
  return true;
}
```

**Test (one runnable check, `server/scripts/check-isolation.ts`):**
```ts
// Fails loudly if any owned row is loadable without a matching user_id.
import pool from '../db.js';
const { rows } = await pool.query(`
  SELECT 'chapters' t, count(*)::int n FROM chapters c
    JOIN documents d ON d.id = c.parent_id WHERE d.user_id = 'shared' AND c.parent_id IS NOT NULL
  UNION ALL SELECT 'integrations', count(*)::int FROM integrations WHERE user_id = 'shared'
`);
console.table(rows);
// run against prod after migration; 'shared' counts should be 0 post-claim
```

### Task 2.2: Scope the AI context chain (highest value)
- `server/src/materials.ts` — `collectMaterials(opts)` gains `userId: string` (required). Add `AND user_id = $n` to:
  - `:119` documents query: `WHERE id = ANY($1) AND user_id = $2`
  - chapters query: join `documents d` and filter `d.user_id = $2`
- `server/src/generationPipeline.ts:229` — `runGeneration` options gain `userId`; pass to `collectMaterials({ userId })`. Update 4 callers (`flashcards.ts:127`, `practiceTests.ts:155`, `roadmaps.ts:422`, `studyGuides.ts`) to pass `uid(req)` — each already has `req`.
- `server/src/tutor.ts:40` — thread `userId` from the chat-session owner (tutor entry loads the session; add `user_id` to that SELECT and pass it down).

### Task 2.3: Scope child-resource routes
Each fix is: resolve parent ownership first, 404 if not owned.
- `routes/chapters.ts:86` → `assertOwn(req, res, 'documents', parentId)` (replaces existence check). Also `:118` and `:162`: join through `documents` — `SELECT c.* FROM chapters c JOIN documents d ON d.id = c.parent_id WHERE c.id = $1 AND d.user_id = $2`.
- `routes/chapterAnalysis.ts:62` + `:220` → `assertOwn(req, res, 'documents', id)` before read/analyze.
- `routes/chapterVideos.ts:17` + `:51` → same.
- `routes/lessons.ts`: `:88`/`:159` create-path → `assertOwn(req, res, 'documents', documentId)`; `:180,:197,:221,:242` → `assertOwn(req, res, 'lessons', id)`. (Lessons already carry `user_id`.)

### Task 2.4: Scope roadmaps/learning + generation sources
- `routes/roadmaps.ts`: `findRoadmap(where, value)` gains `userId` param → `WHERE ${where} = $1 AND user_id = $2` (all callers pass `uid(req)`; ~8 call sites). `:282`, `:300` → `assertOwn(req, res, 'roadmaps', id)` before the unscoped queries. `:253` busy-check and `:262` count-check: add `AND user_id = $n`.
- `routes/learning.ts`: `loadStep` joins roadmaps → add `AND r.user_id = $2`; `:205`, `:591` roadmap re-loads → `assertOwn` or `AND user_id = $n`.
- `routes/flashcards.ts`, `routes/studyGuides.ts`, `routes/practiceTests.ts`: every `WHERE id = $1` gains `AND user_id = $n`; list endpoints gain `WHERE user_id = $1`. (Tables already have the column from 014.)

### Task 2.5: De-globalize integrations / coursera / learner profile / video watch
- `routes/integrations.ts`: every query gains `user_id`; upsert becomes `ON CONFLICT (provider, user_id)` (index from Task 1.1). Credential read `:149` gains `AND user_id = $n`.
- `routes/coursera.ts` + `src/coursera.ts`: replace `WHERE id = 1` with per-user row: `getCauth(userId)` → `SELECT cauth FROM coursera_account WHERE user_id = $1 LIMIT 1`; upsert `ON CONFLICT (user_id)` (drop the singleton-PK assumption; if PK blocks it, `ALTER TABLE coursera_account DROP CONSTRAINT coursera_account_pkey, ADD PRIMARY KEY (user_id)` inside 023 — check actual constraint name first). `uid(req)` when auth enabled; `'shared'` fallback keeps dev-without-OAuth working.
- `server/src/mastery.ts:183,198,227`: `learner_profile` reads/writes keyed by `user_id` instead of `id = 1`. Thread `userId` from the route callers (`routes/learning.ts`, `routes/videos.ts`).
- `routes/videos.ts:178` watch-marking → write `video_watch_state` (upsert); reads (`watched_at`/`watch_quiz`) LEFT JOIN `video_watch_state` on `(uid(req), videos.id)`. Cache rows (title/transcript/summary) stay shared — they're public YouTube data.

### Task 2.6: Verify the sweep
```bash
cd server && npx tsc --noEmit && npm run lint   # from repo root
```
Grep audit (expected: zero by-ID loads missing user scoping on owned tables):
```bash
grep -rn "WHERE id = \$1\b" server/routes server/src | grep -v "user_id"
# remaining hits allowed only on: videos (cache), document_shares, feature_flags, sessions, users
```
**End-to-end isolation test (two browsers or incognito):** sign in as two Google accounts. Account B must get 404 (not 200) on: A's document GET, A's chapter analysis, A's roadmap steps, A's flashcard deck list, A's integrations credentials. B's AI tutor must have zero knowledge of A's documents (ask it what documents exist).

---

## Phase 3 — Apple ID sign-in (after isolation is green)

### Task 3.1: Migration 024 — `server/migrations/024_apple_signin.sql`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT UNIQUE;
```
Run via `migrations/run.ts`.

### Task 3.2: Apple routes in `server/src/auth.ts` (same shape as Google)
Env: `APPLE_SERVICE_ID` (the Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH` (the `.p8`). `AUTH_ENABLED` stays Google-driven; Apple routes 501 when their own env is missing.

- `GET /api/auth/apple/start` — redirect to
  `https://appleid.apple.com/auth/authorize?response_type=code&response_mode=form_post&scope=name%20email&client_id=$APPLE_SERVICE_ID&redirect_uri=$PUBLIC_ORIGIN/api/auth/apple/callback&state=…`
  (state cookie same pattern as Google).
- `POST /api/auth/apple/callback` — Apple POSTs `code`, `id_token`, `state` as form data (`express.urlencoded` is already mounted at index.ts:86).
  1. Verify `state` cookie (CSRF) — same as Google callback.
  2. **Verify the JWT properly**: decode header `kid`, fetch Apple's public keys from `https://appleid.apple.com/auth/keys`, verify RS256 signature + `iss === 'https://appleid.apple.com'` + `aud === APPLE_SERVICE_ID` + `exp`. Do NOT reuse the Google tokeninfo-endpoint pattern — Apple has no tokeninfo endpoint. Implement with `crypto.createVerify('RSA-SHA256')` on the JWK (stdlib — no jsonwebtoken dependency).
  3. Extract `sub` (Apple's stable user ID) and `email`. Apple only sends `email`/`name` on the **first** authorization — upsert `ON CONFLICT (email)` like Google, and store `apple_sub`.
  4. Reuse the exact existing flow: anon-merge check → `claimSharedRows` → `createSession` → `redirect('/')`. Extract that block from the Google callback into `finishSignIn(req, res, { email, sub, provider })` so Google and Apple share it (deletes ~30 lines, one code path).
- Note: Apple posts to the callback (`response_mode=form_post`), so the route must accept POST and the CSP/form width is fine on default Express.

### Task 3.3: Frontend — `src/pages/SignInPage.tsx`
Apple button next to Google: `window.location.href = '/api/auth/apple/start'`. `src/store/authStore.ts` needs no changes (`/api/auth/me` is provider-agnostic).

### Task 3.4: Verify Apple flow locally
Apple requires a public HTTPS redirect URI. Options in order of laziness:
1. Existing prod host (`inkwell.cephalode.com`) — configure Apple Developer: Services ID `inkwell` + return URL `https://inkwell.cephalode.com/api/auth/apple/callback`, Sign in with Apple enabled, key with `Sign in with Apple` capability, download `.p8`, set env vars, deploy.
2. For local testing: `cloudflare-tunnel`/`tailscale-funnel` the dev server and set `PUBLIC_ORIGIN` to the tunnel URL.

Smoke test: sign in with a personal Apple ID → redirected to `/`, `/api/auth/me` shows the Apple email, previously-anon content merged. Second sign-in (Apple re-asks nothing) → same user row, no duplicate.

---

## Phase 4 — Deploy checklist
1. Env vars added: `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH`.
2. `.p8` key file present on server, not committed to git.
3. `023` + `024` migrations applied to prod.
4. Two-account isolation test re-run against prod (Phase 2.6 checklist).
5. Monitor: log a console line on `assertOwn` 404s for a week — a spike from a legit user means a frontend is calling cross-tenant by stale ID (bugs surface as 404s now, which is the point).

---

## Risks / tradeoffs
- **404-vs-403 semantics:** returning 404 for not-owned rows hides existence (correct); frontend error handling already treats 404 as "gone" in most views — spot-check flashcards/study guides UIs.
- **`claimSharedRows` + first sign-in:** with Apple AND Google live, whoever signs in first claims the legacy `shared` dataset. If Cephalode wants a specific account to own it, sign in with that account once before anyone else.
- **Apple name/email only on first auth:** if the users row was created by Google with the same email first, `ON CONFLICT (email)` merges them — that's desired (one human, one account, two providers). Handle `email === null` (Apple private relay edge) with 401.
- **`generationPipeline` called outside requests?** Verified: all 4 callers are route handlers with `req`. If a cron/batch caller appears later, it must pass an explicit userId.

## Files touched (summary)
- `server/migrations/023_tenant_hardening.sql`, `024_apple_signin.sql` (new)
- `server/src/auth.ts` (assertOwn + finishSignIn + apple routes)
- `server/src/materials.ts`, `generationPipeline.ts`, `tutor.ts`, `mastery.ts` (userId threading)
- `server/routes/chapters.ts`, `chapterAnalysis.ts`, `chapterVideos.ts`, `lessons.ts`, `roadmaps.ts`, `learning.ts`, `flashcards.ts`, `studyGuides.ts`, `practiceTests.ts`, `integrations.ts`, `coursera.ts`, `videos.ts` (scoping)
- `src/pages/SignInPage.tsx` (Apple button)
- `server/scripts/check-isolation.ts` (audit check)

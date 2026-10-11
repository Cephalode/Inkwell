-- Multi-user: users, sessions, per-user data scoping, share links, plans.
-- Incumbent data stays on user_id='shared' and is claimed by the first
-- Google sign-in (see claimSharedRows in src/auth.ts).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  google_sub TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- ── Tenant keys on top-level tables (children scope through their parent) ──
ALTER TABLE documents       ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE textbooks       ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE courses         ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE chat_sessions   ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE flashcard_decks ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE study_guides    ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE practice_tests  ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE roadmaps        ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE integrations    ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE coursera_account ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'shared';

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (user_id);

-- ── Share links (public read-only doc pages) ────────────────────────────────
CREATE TABLE IF NOT EXISTS document_shares (
  token TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

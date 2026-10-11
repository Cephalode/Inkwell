-- Turbo-parity batch (E1/E2/E4/E6/E8/E9):
--   feature_flags (E9), failure-as-data + needs_upgrade (E2), folders + recency (E1),
--   podcast sections (E4), lessons (E6), anon/funnel/billing fields (E8).

-- ── E9: feature flags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT
);
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('learn_mode', true, 'E6: Learn-mode lessons (nav + API gate)'),
  ('chat_generators', true, 'E7: generator tools inside chat'),
  ('podcast_v2', true, 'E4: sectioned podcast with transcript')
ON CONFLICT (key) DO NOTHING;

-- ── E2: generation failures are data (never silent) ─────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary_error TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS podcast_error TEXT;

-- E2/E8: entitlement failures set a flag on the row (UI upsells; no 500s)
ALTER TABLE documents       ADD COLUMN IF NOT EXISTS needs_upgrade BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE study_guides    ADD COLUMN IF NOT EXISTS needs_upgrade BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE flashcard_decks ADD COLUMN IF NOT EXISTS needs_upgrade BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE practice_tests  ADD COLUMN IF NOT EXISTS needs_upgrade BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE roadmaps        ADD COLUMN IF NOT EXISTS needs_upgrade BOOLEAN NOT NULL DEFAULT false;

-- ── E1: folders + last-opened recency ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'shared',
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_last_opened ON documents (user_id, last_opened_at DESC NULLS LAST);

-- ── E4: podcast v2 — sectioned script with timestamps ───────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS podcast_sections JSONB;

-- ── E6: learn-mode lessons ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'shared',
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|generating|done|error
  error TEXT,
  needs_upgrade BOOLEAN NOT NULL DEFAULT false,
  outline JSONB,           -- [{title, kind: intro|teach|quiz}]
  progress JSONB,          -- {completed: number[]} section indexes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lesson_sections (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL,      -- intro|teach|quiz
  title TEXT NOT NULL,
  content JSONB,           -- teach: {markdown}; quiz: {questions: [...]}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS percent_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'pending'; -- pending|complete|failed
CREATE INDEX IF NOT EXISTS idx_lesson_sections_lesson ON lesson_sections (lesson_id, idx);

-- ── E3: deck config + quiz hints + topic labels ─────────────────────────────
ALTER TABLE flashcard_decks ADD COLUMN IF NOT EXISTS config JSONB; -- {count, instructions}
ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS hint TEXT;
ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS topic TEXT;

-- ── E8: anonymous-first + funnel + billing fields ───────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_platform TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

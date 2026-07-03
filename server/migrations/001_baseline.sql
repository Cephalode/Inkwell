-- 001_baseline.sql
-- Baseline capturing the full Inkwell schema as of US-013.
--
-- Idempotent: safe to run on a fresh database (creates everything) and on an
-- already-up-to-date database (no-op — every statement is guarded with
-- IF NOT EXISTS). The inline ALTER TABLE statements from the original
-- schema.sql have been folded into the canonical CREATE TABLE definitions,
-- except `documents.textbook_id` which must be added after the `textbooks`
-- table exists (cross-table FK ordering).

-- Extensions
-- pgcrypto provides gen_random_uuid() (in core since PostgreSQL 13, but the
-- extension is harmless to create when absent).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pgvector is not yet installed in this environment; uncomment once available.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  parsed_text TEXT DEFAULT '',
  thumbnail TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  file_path TEXT,
  video_summary JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chapters
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chapter_title TEXT NOT NULL,
  chapter_index INT NOT NULL DEFAULT 0,
  start_page INT NOT NULL DEFAULT 0,
  end_page INT NOT NULL DEFAULT 0,
  parsed_text TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  file_path TEXT,
  analysis JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chapters_parent ON chapters(parent_id);

-- Embeddings
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  -- embedding vector(1536),  -- pgvector not installed yet
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_embeddings_document ON embeddings(document_id);

-- Textbooks (virtual containers for chapter-based documents)
CREATE TABLE IF NOT EXISTS textbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add textbook_id column to documents (nullable FK; depends on textbooks table existing).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS textbook_id TEXT REFERENCES textbooks(id) ON DELETE CASCADE;

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_courses_updated ON courses(updated_at DESC);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_document ON chat_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

-- Study Guides
CREATE TABLE IF NOT EXISTS study_guides (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_guides_course ON study_guides(course_id);
CREATE INDEX IF NOT EXISTS idx_study_guides_document ON study_guides(document_id);
CREATE INDEX IF NOT EXISTS idx_study_guides_status ON study_guides(status);

-- Flashcard Decks
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  source JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_course ON flashcard_decks(course_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_status ON flashcard_decks(status);

-- Flashcards
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  deck_id TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  review_stats JSONB DEFAULT '{"timesReviewed":0,"timesCorrect":0,"lastReviewedAt":null}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_position ON flashcards(deck_id, position);

-- Practice Tests
CREATE TABLE IF NOT EXISTS practice_tests (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  source JSONB NOT NULL,
  config JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_practice_tests_course ON practice_tests(course_id);
CREATE INDEX IF NOT EXISTS idx_practice_tests_status ON practice_tests(status);

-- Test Questions
CREATE TABLE IF NOT EXISTS test_questions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  test_id TEXT NOT NULL REFERENCES practice_tests(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  qtype TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB,
  correct_answer JSONB NOT NULL,
  explanation TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_questions_test ON test_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_test_questions_position ON test_questions(test_id, position);

-- Test Attempts
CREATE TABLE IF NOT EXISTS test_attempts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  test_id TEXT NOT NULL REFERENCES practice_tests(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  score DECIMAL(5,2),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_test_attempts_test ON test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_completed ON test_attempts(completed_at DESC);

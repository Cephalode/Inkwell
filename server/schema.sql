-- CREATE EXTENSION IF NOT EXISTS vector;
-- NOTE: pgvector not installed yet; will enable after Nix config update.

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapters_parent ON chapters(parent_id);

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  -- embedding vector(1536),  -- pgvector not installed yet
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_document ON embeddings(document_id);

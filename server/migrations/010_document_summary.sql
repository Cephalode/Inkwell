-- Auto-generated document summaries: single markdown doc (TL;DR + key points),
-- generated server-side and chained after classification on upload.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary_status TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_documents_summary_status ON documents (summary_status);

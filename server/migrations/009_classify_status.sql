-- classify_status was used by server/routes/documents.ts but never codified in a
-- migration; Supabase baseline replay dropped it (classify + YouTube import 500).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classify_status TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_documents_classify_status ON documents (classify_status);

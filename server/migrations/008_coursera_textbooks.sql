-- Track Coursera textbook assets already imported so re-running the import is idempotent.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS coursera_asset_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_coursera_asset ON documents (coursera_asset_id);

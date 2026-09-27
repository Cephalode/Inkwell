-- Course ↔ folder binding + soft-copy document links.
-- Every course owns a folder in the documents tree (created automatically).
-- A document physically lives in ONE folder (documents.folder_id) but can be
-- soft-linked into any number of course folders, so courses can share docs.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS document_folder_links (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  folder_id   TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, folder_id)
);
CREATE INDEX IF NOT EXISTS idx_document_folder_links_folder ON document_folder_links(folder_id);

-- Folder tree: folders become hierarchical (Google Drive style).
-- parent_id NULL = root level. ON DELETE SET NULL promotes children (and
-- documents.folder_id, already SET NULL) instead of cascading deletes.
-- folders.id is TEXT (client-generated ids), so parent_id matches that.
ALTER TABLE folders ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

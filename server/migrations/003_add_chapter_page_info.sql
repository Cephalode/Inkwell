-- 003_add_chapter_page_info.sql
-- Preserve chapter page metadata when chapters are converted into standalone
-- documents via the "convert-to-textbook" flow (documents.ts).
--
-- Chapters originally live in the `chapters` table with start_page / end_page /
-- chapter_index / chapter_title columns. During convert-to-textbook they become
-- standalone rows in `documents`, but until now the page metadata was dropped.
-- These new (nullable) columns on `documents` let that metadata survive the
-- conversion so it can be read back via the documents/textbooks API.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS start_page INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS end_page INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chapter_index INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chapter_title TEXT;

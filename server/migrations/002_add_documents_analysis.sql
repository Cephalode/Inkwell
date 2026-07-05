-- 002_add_documents_analysis.sql
-- Move chapter analysis storage onto the documents table.
--
-- After the "convert-to-textbook" flow (documents.ts), each chapter lives as a
-- standalone row in `documents` (with its own file_path — a full standalone PDF)
-- and the legacy `chapters` rows are deleted. The analysis JSONB column therefore
-- needs to exist on `documents` so chapterAnalysis.ts can read/write analysis
-- results for those chapter-documents.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;

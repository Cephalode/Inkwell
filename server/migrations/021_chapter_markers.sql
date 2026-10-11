-- Chapter markers (detected chapter headings: [{ title, page }]) were created
-- in the pre-migration schema.sql era and only ever existed in the legacy
-- local database. The Supabase DB never got the column, so every
-- PATCH /api/documents/:id carrying chapterMarkers failed with 42703.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chapter_markers JSONB;

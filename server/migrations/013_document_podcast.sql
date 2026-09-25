-- Podcast recaps: TTS audio overview per document, chained after summary.
-- podcast_path = Supabase Storage key (podcasts/{id}.mp3)
-- podcast_status = pending | generating | done | failed | skipped
ALTER TABLE documents ADD COLUMN IF NOT EXISTS podcast_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS podcast_status TEXT NOT NULL DEFAULT 'pending';

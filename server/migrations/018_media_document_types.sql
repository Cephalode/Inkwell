-- Uploaded audio/video: normalize the documents.type column to the canonical
-- DocumentType values the frontend keys on (icons, players, default tab).
-- New uploads already normalize server-side (documents.ts MEDIA_EXTS logic);
-- this backfills legacy rows that stored the raw extension ('mp3', 'mp4', …).
UPDATE documents SET type = 'audio'
WHERE type IN ('mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac')
   OR (type = 'webm' AND mime_type LIKE 'audio/%');

UPDATE documents SET type = 'video'
WHERE type IN ('mp4', 'mov', 'm4v', 'mkv', 'avi')
   OR (type = 'webm' AND (mime_type IS NULL OR mime_type NOT LIKE 'audio/%'));

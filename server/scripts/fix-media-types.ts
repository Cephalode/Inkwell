// One-off: re-run migration 018's normalization as a data fix — it ran before
// some media rows were inserted (backend restart race). Safe to re-run.
import pool from '../db.js';

const r1 = await pool.query(
  `UPDATE documents SET type = 'audio'
   WHERE type IN ('mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac')
      OR (type = 'webm' AND mime_type LIKE 'audio/%')
   RETURNING id, name`,
);
const r2 = await pool.query(
  `UPDATE documents SET type = 'video'
   WHERE type IN ('mp4', 'mov', 'm4v', 'mkv', 'avi')
      OR (type = 'webm' AND (mime_type IS NULL OR mime_type NOT LIKE 'audio/%'))
   RETURNING id, name`,
);
console.log('normalized to audio:', r1.rows.map((r) => r.name));
console.log('normalized to video:', r2.rows.map((r) => r.name));
const { rows } = await pool.query(
  "SELECT type, count(*) FROM documents WHERE type IN ('audio','video') GROUP BY type",
);
console.log('media counts:', rows);
pool.end();

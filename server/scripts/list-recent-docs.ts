// Recent documents dump — find where the user's mp3/wav cards went.
import pool from '../db.js';

const { rows } = await pool.query(
  `SELECT id, name, type, mime_type, size, user_id, created_at
   FROM documents ORDER BY created_at DESC LIMIT 15`,
);
for (const r of rows) {
  const ts = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at;
  console.log(r.id.slice(0, 8), String(r.type).padEnd(8), String(r.mime_type).padEnd(20), String(r.size).padStart(9), r.user_id?.slice(0, 8), ts, r.name);
}
pool.end();

/** Inspect txt docs — run: npx tsx server/scripts/inspect-txt.ts */
import '../env.js';
import pool from '../db.js';

const { rows } = await pool.query(
  `SELECT id, name, type,
          COALESCE(LENGTH(parsed_text), 0) AS text_len,
          (file_path IS NOT NULL) AS has_path,
          created_at
   FROM documents
   WHERE type IN ('txt','md','csv')
   ORDER BY created_at DESC`,
);
for (const r of rows) {
  console.log(`${r.name} | text_len=${r.text_len} | has_path=${r.has_path} | ${r.id}`);
}
await pool.end();

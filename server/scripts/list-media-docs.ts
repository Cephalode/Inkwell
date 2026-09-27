// List media docs (id, name, size, created) — identify test rows vs real uploads.
import pool from '../db.js';

const { rows } = await pool.query(
  "SELECT id, name, type, size, created_at FROM documents WHERE type IN ('audio','video') ORDER BY created_at",
);
for (const r of rows) {
  console.log(r.id.slice(0, 8), r.type, String(r.size).padStart(8), r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at, r.name);
}
pool.end();

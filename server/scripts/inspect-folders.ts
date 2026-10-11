// Diagnose duplicate course folders: which folders have no course binding?
import pool from '../db.js';

const { rows } = await pool.query(`
  SELECT f.id, f.name, f.created_at, c.id AS course_id,
    (SELECT count(*) FROM documents d WHERE d.folder_id = f.id) AS docs,
    (SELECT count(*) FROM document_folder_links l WHERE l.folder_id = f.id) AS links
  FROM folders f LEFT JOIN courses c ON c.folder_id = f.id
  ORDER BY f.created_at`);
for (const r of rows) {
  console.log(
    String(r.created_at?.toISOString?.().slice(0, 16) ?? '?').padEnd(17),
    '|', r.name.slice(0, 38).padEnd(38),
    '| course:', (r.course_id ?? 'NONE').toString().padEnd(26),
    '| docs:', r.docs, '| links:', r.links,
  );
}
process.exit(0);

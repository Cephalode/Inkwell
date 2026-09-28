// One-off cleanup: delete orphan folders (no course binding, no docs, no links).
import pool from '../db.js';

const { rows: orphans } = await pool.query(`
  SELECT f.id, f.name FROM folders f
   LEFT JOIN courses c ON c.folder_id = f.id
  WHERE c.id IS NULL
    AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.folder_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM document_folder_links l WHERE l.folder_id = f.id)`);
for (const o of orphans) {
  await pool.query('DELETE FROM folders WHERE id = $1', [o.id]);
  console.log('deleted orphan:', o.id.slice(0, 8), o.name.slice(0, 40));
}
console.log(`removed ${orphans.length} orphan folders`);
process.exit(0);

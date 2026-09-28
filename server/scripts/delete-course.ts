// Delete a course by id (with its folder) — for test fixtures.
import pool from '../db.js';
const id = process.argv[2];
if (!id) { console.error('usage: npx tsx server/scripts/delete-course.ts <courseId>'); process.exit(1); }
const { rows } = await pool.query('SELECT folder_id FROM courses WHERE id = $1', [id]);
if (rows[0]?.folder_id) await pool.query('DELETE FROM folders WHERE id = $1', [rows[0].folder_id]);
await pool.query('DELETE FROM document_folder_links l USING courses c WHERE c.folder_id = l.folder_id AND c.id = $1', [id]);
await pool.query('DELETE FROM courses WHERE id = $1', [id]);
console.log('deleted course + folder:', id);
process.exit(0);

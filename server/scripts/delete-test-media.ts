// Cleanup: delete the 3 curl-test audio docs (files + Storage objects).
import pool from '../db.js';
import { storageDelete, isStorageKey } from '../src/storage.js';

const ids = ['3c615530-7a4e-4b18-8130-60da1d4f16c6', 'f5e5b05e-41b6-4052-8def-49fc0e6d836d', '38550d4d-4889-465e-a625-dcce9fc20ef5'];
for (const id of ids) {
  const { rows } = await pool.query('SELECT file_path FROM documents WHERE id = $1', [id]);
  if (rows.length === 0) { console.log(id.slice(0, 8), 'already gone'); continue; }
  const fp = rows[0].file_path;
  await pool.query('DELETE FROM documents WHERE id = $1', [id]);
  if (fp && isStorageKey(fp)) {
    try { await storageDelete(fp); console.log(id.slice(0, 8), 'deleted row + storage object'); } catch (e) { console.log(id.slice(0, 8), 'row deleted, storage cleanup failed:', e.message); }
  } else {
    console.log(id.slice(0, 8), 'deleted row (no storage key)');
  }
}
const { rows: left } = await pool.query("SELECT count(*) FROM documents WHERE type IN ('audio','video')");
console.log('remaining media docs:', left[0].count);
pool.end();

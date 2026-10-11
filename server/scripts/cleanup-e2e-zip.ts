// One-shot cleanup: remove leftover e2e-zip test docs + their Storage objects.
// Run: npx tsx server/scripts/cleanup-e2e-zip.ts
import pool from '../db.js';
import { storageDelete, isStorageKey } from '../src/storage.js';

const NAMES = ['lecture-notes.txt', 'diagram.png', 'intro.pdf', 'detailed.pdf', 'normal.txt'];

const { rows } = await pool.query(
  'SELECT id, file_path FROM documents WHERE name = ANY($1)',
  [NAMES],
);
console.log(`Found ${rows.length} leftover test docs`);
for (const row of rows) {
  const filePath = (row as { file_path: string | null }).file_path;
  if (filePath && isStorageKey(filePath)) {
    try { await storageDelete(filePath); } catch (err) { console.error(`storageDelete failed for ${filePath}:`, err); }
  }
  await pool.query('DELETE FROM documents WHERE id = $1', [(row as { id: string }).id]);
}
console.log('Done');
await pool.end();

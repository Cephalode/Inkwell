// One-shot: upload existing document/chapter files to Supabase Storage and
// rewrite file_path from absolute disk paths to Storage keys ({id}_{name}).
import { readFileSync, statSync } from 'fs';
import path from 'path';
import pool from '../db.js';
import { storageUpload } from '../src/storage.js';

const FILES_DIR = '/Users/sqibo/devel/inkwell/server/data/files';

const { rows: docs } = await pool.query(
  "SELECT id, name, mime_type, file_path FROM documents WHERE file_path IS NOT NULL AND file_path NOT LIKE 'http%'",
);
console.log(`documents to migrate: ${docs.length}`);

for (const d of docs) {
  const doc = d as { id: string; name: string; mime_type: string; file_path: string };
  const key = path.basename(doc.file_path);
  const local = path.join(FILES_DIR, key);
  try {
    const buf = readFileSync(local);
    const before = statSync(local).size;
    await storageUpload(key, buf, doc.mime_type || 'application/pdf');
    await pool.query('UPDATE documents SET file_path = $1 WHERE id = $2', [key, doc.id]);
    console.log(`OK  ${doc.id} ← ${key} (${(before / 1048576).toFixed(1)} MB)`);
  } catch (e) {
    console.log(`FAIL ${doc.id} ${key}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// chapters table too (same convention)
const { rows: chs } = await pool.query(
  'SELECT id, file_path FROM chapters WHERE file_path IS NOT NULL',
);
console.log(`chapters to migrate: ${chs.length}`);
for (const c of chs) {
  const ch = c as { id: string; file_path: string };
  const key = path.basename(ch.file_path);
  try {
    await storageUpload(key, readFileSync(path.join(FILES_DIR, key)), 'application/pdf');
    await pool.query('UPDATE chapters SET file_path = $1 WHERE id = $2', [key, ch.id]);
    console.log(`OK  chapter ${ch.id} ← ${key}`);
  } catch (e) {
    console.log(`FAIL chapter ${ch.id}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

await pool.end();

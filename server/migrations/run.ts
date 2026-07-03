import pool from '../db.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const migrationsDir = path.dirname(fileURLToPath(import.meta.url));

// Minimal, dependency-free runner: applies every *.sql file here in lexical
// order, recording each in `schema_migrations` so it runs exactly once.
// To add a new migration: create server/migrations/NNN_description.sql
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Create tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get applied migrations
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r: { filename: string }) => r.filename));

    // Get migration files (lexically sorted so NNN_ prefixes order correctly)
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Apply pending migrations
    for (const file of files) {
      if (!applied.has(file)) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`[migrations] Applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[migrations] Failed: ${file}`, err);
          throw err;
        }
      }
    }
  } finally {
    client.release();
  }
}

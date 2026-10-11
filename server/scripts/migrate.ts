// One-shot: apply all migrations to the configured (Supabase) database.
import { runMigrations } from '../migrations/run.js';
import pool from '../db.js';

try {
  await runMigrations();
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
  );
  console.log('public tables:', rows.map((r) => r.table_name).join(', '));
  await pool.end();
} catch (err) {
  console.error('FAILED:', err);
  process.exit(1);
}

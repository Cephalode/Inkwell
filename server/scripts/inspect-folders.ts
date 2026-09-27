// Inspect the folders table schema (id type for the parent_id FK).
import pool from '../db.js';

const { rows } = await pool.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'folders' ORDER BY ordinal_position`,
);
console.log(rows);
pool.end();

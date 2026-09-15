import pg from 'pg';
const { Pool } = pg;
import { readFileSync } from 'fs';
import './env.js';

// Supabase session pooler serves a certificate signed by Supabase's own CA
// (Supabase Root 2021), which is not in OS/Node trust stores — pin it.
const SUPABASE_CA = (() => {
  try {
    return readFileSync(new URL('./certs/supabase-root-2021.crt', import.meta.url));
  } catch {
    return undefined;
  }
})();

const pool = new Pool({
  host: process.env.PGHOST || 'aws-0-us-east-2.pooler.supabase.com',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres.mfbevwpwwcgzsrkbslrf',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSL === 'false' ? undefined : { ca: SUPABASE_CA },
  max: 10,
});

pool.on('error', (err) => console.error('pg pool error:', err.message));

export default pool;

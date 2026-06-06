import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || '/tmp',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'inkwell',
  user: process.env.PGUSER || 'sqibo',
  password: process.env.PGPASSWORD || '',
  max: 10,
});

export default pool;

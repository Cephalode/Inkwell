/** Roadmap state + recent generation errors — npx tsx server/scripts/inspect-roadmap-state.ts */
import '../env.js';
import pool from '../db.js';

const { rows: rms } = await pool.query(
  `SELECT r.id, r.status, LEFT(r.error, 200) AS err, r.updated_at, c.name AS course
   FROM roadmaps r JOIN courses c ON c.id = r.course_id
   ORDER BY r.updated_at DESC LIMIT 8`,
);
console.log('── roadmaps ──');
for (const r of rms) console.log(`${r.status.padEnd(10)} | ${String(r.err ?? '').slice(0, 120)} | ${r.course} | ${r.updated_at?.toISOString?.()}`);

const { rows: pend } = await pool.query(
  `SELECT course_id, status, updated_at FROM roadmaps WHERE status = 'generating'`,
);
console.log('── stuck generating ──', pend.length);

await pool.end();

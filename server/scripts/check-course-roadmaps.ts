/** Check roadmaps for a course — npx tsx server/scripts/check-course-roadmaps.ts <courseId> */
import '../env.js';
import pool from '../db.js';

const courseId = process.argv[2];
if (!courseId) {
  console.error('usage: npx tsx server/scripts/check-course-roadmaps.ts <courseId>');
  process.exit(1);
}
const { rows } = await pool.query(
  'SELECT id, status, is_active, created_at FROM roadmaps WHERE course_id = $1 ORDER BY created_at',
  [courseId],
);
for (const r of rows) console.log(r.id, '|', r.status, '| active:', r.is_active, '|', r.created_at);
if (rows.length === 0) console.log('(no roadmaps)');
await pool.end();

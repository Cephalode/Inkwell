import '../env.js';
import pool from '../db.js';
import { fetchCourseOutline } from '../src/coursera.js';

const { rows } = await pool.query('SELECT cauth FROM coursera_account WHERE id = 1');
try {
  const outline = await fetchCourseOutline(rows[0].cauth, 'unsupervised-algorithms-in-machine-learning');
  console.log('outline OK,', outline.length, 'modules:');
  for (const m of outline) console.log(' -', m.name, '| lessons:', m.lessons.length);
} catch (e: any) {
  console.log('outline FAILED:', e.message);
}
await pool.end();

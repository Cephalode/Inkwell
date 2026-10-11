// Cleanup for probe-flow-ios.ts: remove the fixture activity's evidence,
// recompute the skill, and decrement the XP the probe submit awarded.
import '../env.js';
import pool from '../db.js';
import { recomputeSkill } from '../src/mastery.js';

const ACTIVITY_ID = 'cd835b25-e9ea-40af-9a15-00c45a2f73e4';
const XP_TO_REVERT = 30;

const stepRow = (await pool.query(
  `SELECT s.skill_id, r.course_id FROM roadmap_steps s JOIN roadmaps r ON r.id = s.roadmap_id
   WHERE s.id = (SELECT step_id FROM learning_activities WHERE id = $1)`,
  [ACTIVITY_ID],
)).rows[0];
if (!stepRow) {
  console.log('activity already gone');
} else {
  const del = await pool.query('DELETE FROM skill_evidence WHERE activity_id = $1 RETURNING id', [ACTIVITY_ID]);
  console.log('evidence rows deleted:', del.rowCount);
  await recomputeSkill(stepRow.skill_id);
  console.log('skill recomputed:', stepRow.skill_id);
  const gone = await pool.query('DELETE FROM learning_activities WHERE id = $1 RETURNING id', [ACTIVITY_ID]);
  console.log('activity deleted:', gone.rowCount);
  const xp = await pool.query(
    `UPDATE learner_profile SET xp = GREATEST(0, xp - $1), xp_today = GREATEST(0, xp_today - $1) WHERE id = 1 RETURNING xp, xp_today`,
    [XP_TO_REVERT],
  );
  console.log('xp reverted, now:', xp.rows[0]);
}
await pool.end();

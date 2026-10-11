// One-off: re-judge the Gradient Descent video via the real search pipeline,
// then print the resulting chapter start times.
import '../env.js';
import pool from '../db.js';
import { searchVideosForSkill } from '../src/videoSearch.js';

const SKILL = 'ebd47712-f2ee-42e6-81fe-8d4c8721f1d8'; // one of the 5 milestones in the video
const { rows } = await pool.query('SELECT label FROM skills WHERE id = $1', [SKILL]);
console.log('skill:', rows[0]?.label);

const ranked = await searchVideosForSkill(SKILL, (m) => console.log('[log]', m));
const vid = ranked.find((v) => v.id === 'QoK1nNAURw4');
console.log('judged video found:', !!vid);
for (const m of vid?.milestones ?? []) {
  const fmt = (s: number | null) => (s === null ? 'null' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  console.log(`  ${m.label} | coverage ${m.coverage} | start ${fmt(m.startSeconds)} | end ${fmt(m.endSeconds)}`);
}
await pool.end();

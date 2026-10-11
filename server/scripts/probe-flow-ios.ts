// Flow contract probe: mint a 30-min QA session, exercise the guided-flow
// endpoints against PROD (what iOS hits), dump real payloads for Swift decode
// verification, then clean up (revoke session, delete fixture activity).
// Usage: cd ~/dev/inkwell && npx tsx server/scripts/probe-flow-ios.ts
import '../env.js';
import pool from '../db.js';
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const BASE = 'https://inkwell.cephalode.com';
const newToken = () => randomBytes(32).toString('base64url');
const hashToken = (t) => createHash('sha256').update(t).digest('hex');

const token = newToken();
const u = (await pool.query('SELECT id FROM users ORDER BY created_at DESC LIMIT 1')).rows[0];
if (!u) { console.log('no users'); process.exit(1); }
await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '30 min')`, [hashToken(token), u.id]);

const call = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `inkwell_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
};

try {
  // 1. learning-mode round trip
  const gm0 = await call('/api/auth/learning-mode');
  const put = await call('/api/auth/learning-mode', 'PUT', { mode: 'flow' });
  const gm1 = await call('/api/auth/learning-mode');
  console.log('MODE:', JSON.stringify({ get0: gm0.data, put: put.data, get1: gm1.data, statuses: [gm0.status, put.status, gm1.status] }));

  // 2. find a step with flow history (steps that have completed flow activities)
  const { rows: flowSteps } = await pool.query(
    `SELECT DISTINCT s.id, s.title FROM learning_activities a JOIN roadmap_steps s ON s.id = a.step_id
     WHERE a.kind = 'flow' AND a.status = 'completed' ORDER BY s.title LIMIT 3`);
  console.log('FLOW STEPS:', flowSteps.map((s) => `${s.id} ${s.title}`).join(' | '));

  // 3. dump one completed flow activity (lesson + quiz shapes) for decode tests
  const { rows: examples } = await pool.query(
    `SELECT a.id FROM learning_activities a JOIN roadmap_steps s ON s.id = a.step_id
     JOIN roadmaps r ON r.id = s.roadmap_id
     WHERE a.kind='flow' AND a.status='completed' AND r.is_active AND a.content ? 'flow'
     ORDER BY a.completed_at DESC LIMIT 4`);
  for (const ex of examples) {
    const act = await call(`/api/learning-activities/${ex.id}`);
    const c = act.data?.content ?? {};
    const shape = {
      id: act.data?.id, kind: act.data?.kind, status: act.data?.status,
      flow: c.flow, slot: c.slot,
      subjectCount: c.subjects?.length,
      questionCount: c.questions?.length,
      firstSubject: c.subjects?.[0] ? Object.keys(c.subjects[0]) : undefined,
      firstQuestion: c.questions?.[0] ? Object.keys(c.questions[0]) : undefined,
      resultKeys: act.data?.result ? Object.keys(act.data.result) : undefined,
      resultSlot: act.data?.result?.slot,
    };
    console.log('ACTIVITY', JSON.stringify(shape));
    if (c.flow === 'lesson' && !globalThis.__flowLessonDumped) {
      globalThis.__flowLessonDumped = true;
      writeFileSync('/tmp/inkwell-decode/flow-lesson.json', JSON.stringify(act.data));
      console.log('   -> dumped lesson to /tmp/inkwell-decode/flow-lesson.json');
    }
    if (c.flow === 'quiz' && !globalThis.__flowQuizDumped) {
      globalThis.__flowQuizDumped = true;
      writeFileSync('/tmp/inkwell-decode/flow-quiz.json', JSON.stringify(act.data));
      console.log('   -> dumped quiz to /tmp/inkwell-decode/flow-quiz.json');
    }
  }

  // 4. in-progress generation probe on the newest active step WITHOUT completed flow rows
  const { rows: cand } = await pool.query(
    `SELECT s.id, s.title, s.roadmap_id, s.position FROM roadmap_steps s
     JOIN roadmaps r ON r.id = s.roadmap_id
     JOIN courses c ON c.id = r.course_id
     WHERE r.is_active AND NOT EXISTS (
       SELECT 1 FROM learning_activities a WHERE a.step_id = s.id AND a.kind='flow' AND a.status='completed')
     ORDER BY c.is_current DESC, s.position ASC LIMIT 1`);
  let stepId = cand[0]?.id;
  if (!stepId) {
    // every active step has flow history — reuse the most recent flow step's step
    const { rows: fallback } = await pool.query(
      `SELECT s.id FROM learning_activities a JOIN roadmap_steps s ON s.id = a.step_id
       JOIN roadmaps r ON r.id = s.roadmap_id WHERE a.kind='flow' AND r.is_active
       ORDER BY a.created_at DESC LIMIT 1`);
    stepId = fallback[0]?.id;
  }
  console.log('PROBE STEP:', stepId);
  if (stepId) {
    const created = await call(`/api/roadmap-steps/${stepId}/activities`, 'POST', { kind: 'flow', slot: 'review_prev' });
    console.log('CREATE:', created.status, JSON.stringify(created.data)?.slice(0, 300));
    if (created.status === 201) {
      const id = created.data.id;
      // poll until content (review_prev on a step with prior history is quick)
      let final = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const g = await call(`/api/learning-activities/${id}`);
        if (g.data?.content || g.data?.status === 'error') { final = g.data; break; }
      }
      console.log('GENERATED:', final?.status, 'flow:', final?.content?.flow, 'slot:', final?.content?.slot,
        'questions:', final?.content?.questions?.length, 'subjects:', final?.content?.subjects?.length);
      if (final?.content) {
        writeFileSync('/tmp/inkwell-decode/flow-generated.json', JSON.stringify(final));
        console.log('   -> dumped to /tmp/inkwell-decode/flow-generated.json');
      }
      // submit round-trip (fixture row — deleted below)
      const questions = final?.content?.questions ?? [];
      const attempts = (final?.content?.flow === 'quiz' ? questions : []).slice(0, 3).map((q) => ({
        subject: q.subject, correct: true,
      }));
      if (attempts.length > 0) {
        const sub = await call(`/api/learning-activities/${id}/submit`, 'POST', {
          slot: 'review_prev', attempts, hintsUsed: 0,
        });
        console.log('SUBMIT:', sub.status, JSON.stringify({
          score: sub.data?.activity?.score, xpGained: sub.data?.xpGained,
          justLearned: sub.data?.justLearned, profileKeys: sub.data?.profile ? Object.keys(sub.data.profile) : undefined,
          resultSlot: sub.data?.activity?.result?.slot,
        }));
        if (sub.status === 200) {
          writeFileSync('/tmp/inkwell-decode/flow-submit.json', JSON.stringify(sub.data));
          console.log('   -> dumped to /tmp/inkwell-decode/flow-submit.json');
        }
        // revert: delete evidence + recompute + XP decrement (previous PRD pattern)
        const stepRow = (await pool.query('SELECT skill_id, course_id FROM roadmap_steps WHERE id=$1', [stepId])).rows[0];
        await pool.query('DELETE FROM skill_evidence WHERE activity_id=$1', [id]);
        await pool.query(`UPDATE learning_activities SET status='in_progress', result=NULL, completed_at=NULL WHERE id=$1`, [id]);
        const { rows: ev } = await pool.query('SELECT count(*)::int AS n FROM skill_evidence WHERE skill_id=$1', [stepRow.skill_id]);
        console.log('REVERT: evidence rows now', ev[0].n, '(recompute + xp handled by recompute script if needed)');
        // XP revert: subtract what was awarded
        const gained = sub.data?.xpGained ?? 0;
        if (gained > 0) {
          await pool.query(`UPDATE learner_profile SET
            xp = GREATEST(0, xp - $1),
            xp_today = GREATEST(0, xp_today - $1) WHERE id = 1`, [gained]);
          console.log('REVERT: xp -', gained);
        }
        // leave row in_progress (no content cleanup needed — content stays valid)
        await pool.query('DELETE FROM learning_activities WHERE id=$1 AND status<>$2', [id, 'completed']);
        console.log('CLEANUP: fixture activity deleted');
      } else {
        // nothing submitted — just delete the fixture row
        await pool.query('DELETE FROM learning_activities WHERE id=$1', [id]);
        console.log('CLEANUP: fixture activity deleted (no submit path)');
      }
    }
  }
} finally {
  await pool.query('DELETE FROM sessions WHERE token = $1', [hashToken(token)]);
  console.log('SESSION REVOKED');
  await pool.end();
}

/**
 * One-off backfill: normalize ASCII pseudo-math to Unicode in existing
 * learning_activities flow rows (subjects/questions/SVG labels). Idempotent —
 * a second run is a no-op since Unicode math doesn't match the ASCII patterns.
 *
 * Usage (from server/):  npx tsx scripts/backfill-ascii-math.ts [--dry]
 */
import { Pool } from 'pg';
import { normalizeMathText, normalizeSvgMath } from '../../src/utils/asciiMath.js';
import { repairArrowheads } from '../src/svgArrows.js';

const dry = process.argv.includes('--dry');

interface FlowSubjectRaw {
  id?: string; title?: string; explanation?: string; example?: string;
  diagram?: string; exampleDiagram?: string;
  mcq?: { prompt?: string; options?: string[]; correct?: string; explanation?: string };
  [k: string]: unknown;
}
interface FlowQuizQRaw {
  id?: string; subject?: string; prompt?: string; options?: string[];
  correct?: string; explanation?: string;
  [k: string]: unknown;
}

function normSubject(s: FlowSubjectRaw): { changed: boolean; out: FlowSubjectRaw } {
  let changed = false;
  const out: FlowSubjectRaw = { ...s };
  const normStr = (v: string | undefined) => {
    if (typeof v !== 'string') return v;
    const n = normalizeMathText(v);
    if (n !== v) changed = true;
    return n;
  };
  out.title = normStr(s.title);
  out.explanation = normStr(s.explanation);
  out.example = normStr(s.example);
  if (typeof s.diagram === 'string') {
    const n = repairArrowheads(normalizeSvgMath(s.diagram)).svg;
    if (n !== s.diagram) changed = true;
    out.diagram = n;
  }
  if (typeof s.exampleDiagram === 'string') {
    const n = repairArrowheads(normalizeSvgMath(s.exampleDiagram)).svg;
    if (n !== s.exampleDiagram) changed = true;
    out.exampleDiagram = n;
  }
  if (s.mcq) {
    const m = { ...s.mcq };
    m.prompt = normStr(m.prompt);
    m.explanation = normStr(m.explanation);
    if (Array.isArray(m.options)) m.options = m.options.map((o) => normStr(o) as string);
    // Normalize correct LAST against the normalized options (same transform
    // on both sides keeps membership intact).
    if (typeof m.correct === 'string') m.correct = normStr(m.correct);
    out.mcq = m;
  }
  return { changed, out };
}

function normQuizQ(q: FlowQuizQRaw): { changed: boolean; out: FlowQuizQRaw } {
  let changed = false;
  const out: FlowQuizQRaw = { ...q };
  const normStr = (v: string | undefined) => {
    if (typeof v !== 'string') return v;
    const n = normalizeMathText(v);
    if (n !== v) changed = true;
    return n;
  };
  out.subject = normStr(q.subject);
  out.prompt = normStr(q.prompt);
  out.explanation = normStr(q.explanation);
  if (Array.isArray(q.options)) out.options = q.options.map((o) => normStr(o) as string);
  out.correct = normStr(q.correct);
  return { changed, out };
}

async function main() {
  const pool = new Pool();
  const { rows } = await pool.query(
    `SELECT id, kind, content FROM learning_activities
     WHERE kind = 'flow' AND content IS NOT NULL
       AND (content::text LIKE '%mu_%' OR content::text LIKE '%_k%' OR content::text LIKE '%_i%'
            OR content::text LIKE '%^{%' OR content::text LIKE '%^(%'
            OR content::text LIKE '%||%' OR content::text LIKE '%alpha%' OR content::text LIKE '%sigma%')`,
  );
  console.log(`candidates: ${rows.length}`);
  let updated = 0;
  for (const row of rows) {
    const content = row.content as Record<string, unknown>;
    let changed = false;
    if (content.flow === 'lesson' && Array.isArray(content.subjects)) {
      const subjects: FlowSubjectRaw[] = [];
      for (const s of content.subjects as FlowSubjectRaw[]) {
        const r = normSubject(s);
        changed = changed || r.changed;
        subjects.push(r.out);
      }
      if (changed) content.subjects = subjects;
    } else if (content.flow === 'quiz' && Array.isArray(content.questions)) {
      const qs: FlowQuizQRaw[] = [];
      for (const q of content.questions as FlowQuizQRaw[]) {
        const r = normQuizQ(q);
        changed = changed || r.changed;
        qs.push(r.out);
      }
      if (changed) content.questions = qs;
    }
    if (!changed) continue;
    updated++;
    if (dry) {
      console.log(`[dry] would update ${row.id}`);
    } else {
      await pool.query(`UPDATE learning_activities SET content = $1::jsonb WHERE id = $2`, [JSON.stringify(content), row.id]);
      console.log(`updated ${row.id}`);
    }
  }
  console.log(`${updated} row(s) ${dry ? 'would be' : ''} updated${dry ? '' : ''}.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

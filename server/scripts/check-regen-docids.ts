/**
 * Self-check for the @-reference materials union — run: npx tsx server/scripts/check-regen-docids.ts
 *
 * Verifies that collectMaterials unions courseId documents with extra
 * documentIds (the @-referenced files from the regenerate dialog): extra
 * units appear, no duplicates, count matches. Reads live DB via server/.env.
 */
import assert from 'node:assert/strict';
import '../env.js';
import pool from '../db.js';
import { collectMaterials } from '../src/materials.js';

const { rows: courses } = await pool.query(
  'SELECT id, document_ids FROM courses WHERE document_ids IS NOT NULL AND jsonb_array_length(document_ids) > 0 LIMIT 1',
);
assert.ok(courses.length > 0, 'need a course with documents');
const courseId: string = courses[0].id;
const courseDocIds: string[] = (courses[0].document_ids ?? []).filter((x: unknown): x is string => typeof x === 'string');

// Find a document NOT in the course to use as the @-reference.
const { rows: others } = await pool.query(
  'SELECT id, name FROM documents WHERE NOT (id = ANY($1)) LIMIT 1',
  [courseDocIds],
);
const extra = others.length > 0 ? others[0] : null;
console.log(`course ${courseId} has ${courseDocIds.length} docs; extra @ref:`, extra ? extra.name : 'none (dupe-path check only)');

const base = await collectMaterials({ courseId });
const union = await collectMaterials({ courseId, documentIds: extra ? [extra.id] : [] });

console.log(`base units: ${base.length}, union units: ${union.length}`);
assert.ok(union.length >= base.length, 'union must not lose course materials');

// No duplicate units per (documentId, chapterId/title).
const keys = new Set<string>();
for (const u of union) {
  const k = `${u.documentId}:${u.chapterId ?? u.title}`;
  assert.ok(!keys.has(k), `duplicate unit: ${k}`);
  keys.add(k);
}

// The extra doc's content must appear, exactly once.
if (extra) {
  const hits = union.filter((u) => u.documentId === extra.id);
  assert.equal(hits.length, 1, `@-referenced doc should appear exactly once, got ${hits.length}`);
  assert.ok(hits[0].text.trim().length > 0, 'extra doc unit has text');
  console.log(`extra doc appears once as: "${hits[0].title}" (${hits[0].source})`);
}

// Unknown ids are silently ignored (no crash, no empty units).
const withJunk = await collectMaterials({ courseId, documentIds: ['nonexistent-id'] });
assert.equal(withJunk.length, base.length, 'unknown ids are ignored');

// Empty extras behave exactly like the old call.
const none = await collectMaterials({ courseId, documentIds: [] });
assert.equal(none.length, base.length, 'empty extras == base');

console.log('PASS: documentIds union works');
await pool.end();
process.exit(0);

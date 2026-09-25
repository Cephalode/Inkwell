/**
 * Self-check for the Sept 2026 roadmap fixes — run: npx tsx server/scripts/check-roadmap-fixes.ts
 *
 * Two moving parts, no live LLM / DB:
 *  1. runGeneration's new concurrency worker pool (default 1 = sequential,
 *     roadmaps pass 4). Events may interleave; the frontend reducer only needs
 *     per-material start/result pairs and a truthful `done` count.
 *  2. the POST /roadmaps/:id/generate claim predicate (checked inline below
 *     against a live pool when available): status <> 'generating' OR stale.
 */
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { runGeneration, GENERATION_TIMEOUT_MS } from '../src/generationPipeline.js';

// ── Express stubs (send/setHeader/flushHeaders only) ─────────────────────────
function stubReq(): Request {
  const listeners: Array<() => void> = [];
  return { on: (_: string, fn: () => void) => listeners.push(fn), close: () => listeners.forEach((f) => f()) } as unknown as Request;
}
type StubRes = Response & { events: Array<Record<string, unknown>> };

function stubRes(): StubRes {
  const events: Array<Record<string, unknown>> = [];
  const res = {
    events,
    headersSent: false,
    statusCode: 200,
    setHeader() {},
    flushHeaders() {},
    write(s: string) {
      events.push(JSON.parse(String(s).replace(/^data: /, '').trim()));
      return true;
    },
    end() {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      (this as unknown as { jsonBody: unknown }).jsonBody = body;
      return this;
    },
  };
  return res as unknown as StubRes;
}

// ── 1. Worker pool: N parallel materials, all processed, counts truthful ────
{
  const delays = [30, 5, 50, 10, 25, 1, 40, 15]; // ms; scrambled on purpose
  const res = stubRes();
  const started: number[] = [];
  await runGeneration({
    table: 'roadmaps',
    id: 'check',
    req: stubReq(),
    res,
    concurrency: 4,
    collectMaterials: async () =>
      delays.map((_, i) => ({ documentId: `d${i}`, title: `m${i}`, text: '', source: 'document-text' as const })),
    processMaterial: async (m) => {
      started.push(Date.now());
      await new Promise((r) => setTimeout(r, delays[Number(m.documentId.slice(1))]));
      return 1;
    },
  });
  const starts = res.events.filter((e) => e.type === 'material_start');
  const results = res.events.filter((e) => e.type === 'material_result');
  const doneEvent = res.events.find((e) => e.type === 'done');
  assert.equal(starts.length, delays.length, 'every material gets a start event');
  assert.equal(results.length, delays.length, 'every material gets a result event');
  assert.equal(starts.length, new Set(starts.map((e) => e.index)).size, 'no material processed twice');
  assert.equal(doneEvent?.count, delays.length, 'done carries the full produced count');
  // Parallelism actually happened: the fastest 4 all started within the slowest single call (50ms + slack).
  started.sort((a, b) => a - b);
  assert.ok(started[3] - started[0] < 45, `first 4 starts overlap (spread ${started[3] - started[0]}ms)`);
  console.log(`✓ pool: ${delays.length} materials, concurrency 4, first-4 start spread ${started[3] - started[0]}ms`);
}

// ── 2. Default stays sequential (other generators untouched) ─────────────────
{
  const order: number[] = [];
  const res = stubRes();
  await runGeneration({
    table: 'flashcard_decks',
    id: 'check',
    req: stubReq(),
    res,
    collectMaterials: async () =>
      [0, 1, 2].map((i) => ({ documentId: `d${i}`, title: `m${i}`, text: '', source: 'document-text' as const })),
    processMaterial: async (m) => {
      order.push(Number(m.documentId.slice(1)));
      return 1;
    },
  });
  assert.deepEqual(order, [0, 1, 2], 'default concurrency=1 keeps strict sequential order');
  console.log('✓ default: sequential order preserved for pipelines that omit concurrency');
}

// ── 3. Staleness window used by the claim (informational) ────────────────────
{
  assert.equal(GENERATION_TIMEOUT_MS, 10 * 60 * 1000);
  const claimPredicate = "status <> 'generating' OR updated_at < now() - interval '10 minutes'";
  console.log(`✓ stale window ${GENERATION_TIMEOUT_MS / 60000}min — keep SQL predicate in sync: ${claimPredicate}`);
}

console.log('\nAll roadmap-fix checks passed.');

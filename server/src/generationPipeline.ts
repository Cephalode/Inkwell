/**
 * Shared server-side generation pipeline.
 *
 * US-007 — extracts the common SSE lifecycle that was duplicated across the
 * study-guide, flashcard, and practice-test generation routes:
 *
 *   • marking the DB row `generating` / `done` / `error`
 *   • emitting the six SSE event types the frontend reducer expects
 *     (`materials_collected`, `material_start`, `material_result`,
 *      `synthesizing`, `done`, `error`)
 *   • breaking on client disconnect
 *   • the `headersSent`-aware error path (500 JSON before headers flush,
 *     SSE `error` event after)
 *
 * The pipeline is fully generic — it makes no assumptions about guides,
 * cards, or questions. Route-specific logic (LLM calls, item caps, synthesis)
 * is injected via callbacks, making the pipeline unit-testable without a live
 * LLM.
 *
 * SSE wire format: `data: <json>\n\n` (delegated to `server/src/sse.ts`).
 */

import type { Request, Response } from 'express';
import pool from '../db.js';
import { send, setSSEHeaders } from './sse.js';
import type { MaterialUnit } from './materials.js';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum wall-clock time a row may stay in the `generating` state before it
 * is considered stale.
 *
 * Previously inlined as `10 * 60 * 1000` in all three route files (and the
 * two GET-staleness guards). Now the single source of truth.
 */
export const GENERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Tables whose status column this module is allowed to touch.
 *
 * SQL identifiers cannot be parameterised, so the table name is interpolated
 * into the query string. This allow-list prevents injection — any other value
 * throws immediately.
 */
const VALID_TABLES = new Set([
  'study_guides',
  'flashcard_decks',
  'practice_tests',
  'roadmaps',
]);

// ── Types ───────────────────────────────────────────────────────────────────

/** Alias for a collected source-material unit (see `materials.ts`). */
export type Material = MaterialUnit;

/**
 * Emit a single SSE event to the client.
 *
 * `type` becomes the `type` field in the JSON payload (used by the frontend
 * reducer for dispatch). `data`, if provided, is spread into the same object.
 */
export type EmitFn = (type: string, data?: Record<string, unknown>) => void;

/**
 * Options that drive a full generation run.
 *
 * Every route supplies its own `collectMaterials`, `processMaterial`, and
 * (optionally) `finalize` — the pipeline itself owns the lifecycle.
 */
export interface GenerationOptions {
  /** DB table backing the row (`study_guides` | `flashcard_decks` | `practice_tests`). */
  table: string;
  /** Primary key of the row to mark. */
  id: string;
  /** Express response used for the SSE stream. */
  res: Response;
  /** Express request used for client-disconnect detection. */
  req: Request;

  /**
   * Gather all source materials to generate from.
   *
   * Throwing inside this callback propagates to the pipeline's error handler.
   */
  collectMaterials: () => Promise<Material[]>;

  /**
   * Process a single material unit.
   *
   * @returns the number of items produced from this material (cards, questions,
   *          digests, …). The pipeline emits `material_result` carrying this
   *          count.
   *
   * The injected `emit` function lets the callback emit route-specific
   * intermediate events (e.g. a `guide` event from studyGuides' synthesis).
   */
  processMaterial: (material: Material, emit: EmitFn) => Promise<number>;

  /**
   * Optional reduce / synthesis step that runs after every material has been
   * processed (studyGuides synthesises a full guide here; flashcards/tests
   * omit it).
   *
   * `items` is the full materials array for reference; route-specific
   * accumulated state (e.g. per-material digests) should be captured in the
   * caller's closure.
   *
   * The pipeline emits `synthesizing` immediately before calling this.
   */
  finalize?: (items: Material[], emit: EmitFn) => Promise<void>;
}

// ── Status helper ───────────────────────────────────────────────────────────

/**
 * Update a generation row's status (and optional error) in the DB.
 *
 * Runs `UPDATE <table> SET status = $1, error = $2, updated_at = now()`.
 * When `error` is omitted the column is set to NULL, clearing any prior error
 * (matching the `SET error = NULL` pattern used when transitioning to
 * `generating` / `done`).
 *
 * Fire-and-forget semantics for DB errors (logged, not thrown) — a failed
 * status write must not crash the generation stream. An invalid table name,
 * however, is a programming error and throws immediately.
 */
export async function updateStatus(
  table: string,
  id: string,
  status: string,
  error?: string,
): Promise<void> {
  if (!VALID_TABLES.has(table)) {
    throw new Error(`updateStatus: invalid table name "${table}"`);
  }
  try {
    await pool.query(
      `UPDATE ${table} SET status = $1, error = $2, updated_at = now() WHERE id = $3`,
      [status, error ?? null, id],
    );
  } catch (err) {
    console.error(`updateStatus: failed to update ${table} ${id} -> ${status}:`, err);
  }
}

// ── Staleness helper ────────────────────────────────────────────────────────

/**
 * Return `true` when a row's `updated_at` is older than `GENERATION_TIMEOUT_MS`.
 *
 * Replaces three inline implementations (one per route) that each compared
 * `updated_at` against a 10-minute window using slightly different arithmetic
 * but identical semantics.
 */
export function checkStale(row: { updated_at: Date | string }): boolean {
  const updatedAt = new Date(row.updated_at).getTime();
  return Date.now() - updatedAt > GENERATION_TIMEOUT_MS;
}

// ── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Run the full generation pipeline over SSE.
 *
 * Lifecycle:
 *  1. Set SSE headers (flushes immediately).
 *  2. Mark the row `generating`.
 *  3. Collect materials → emit `materials_collected`.
 *  4. For each material: emit `material_start`, call `processMaterial`,
 *     emit `material_result` (with the returned count). Break early on
 *     client disconnect.
 *  5. Emit `synthesizing`; if `finalize` is provided, call it.
 *  6. Mark the row `done`.
 *  7. Emit `done` and end the stream.
 *
 * Error path (step 8): the DB row is marked `error` regardless of whether the
 * client is still connected. If headers have not been flushed, a 500 JSON
 * response is sent; otherwise an SSE `error` event is emitted (unless the
 * client already disconnected, in which case the write is silently skipped).
 *
 * @throws if `table` is not in the allow-list (via `updateStatus`).
 */
export async function runGeneration(options: GenerationOptions): Promise<void> {
  const { table, id, res, req, collectMaterials, processMaterial, finalize } = options;

  // 1. SSE headers — flush immediately so the client starts receiving.
  setSSEHeaders(res);

  // Track client disconnects (studyGuides' pattern; works across Express
  // versions, unlike the `req.closed` shortcut used by flashcards/tests).
  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  // Build the emit helper bound to this response.
  const emit: EmitFn = (type, data) => {
    if (data !== undefined) {
      send(res, { type, ...data });
    } else {
      send(res, { type });
    }
  };

  try {
    // 2. Mark generating.
    await updateStatus(table, id, 'generating');

    // 3. Collect materials.
    const materials = await collectMaterials();

    if (materials.length === 0) {
      throw new Error('No source materials found');
    }

    emit('materials_collected', { count: materials.length });

    // 4. MAP phase — process each material unit.
    let totalProduced = 0;

    for (let i = 0; i < materials.length; i++) {
      if (closed) break;

      const material = materials[i];

      emit('material_start', {
        index: i,
        total: materials.length,
        material: { id: material.documentId, title: material.title },
      });

      const count = await processMaterial(material, emit);
      totalProduced += count;

      emit('material_result', {
        index: i,
        count,
        material: { id: material.documentId },
      });

      if (closed) break;
    }

    // 5. REDUCE phase — synthesise (optional).
    emit('synthesizing');
    if (finalize) {
      await finalize(materials, emit);
    }

    // 6. Mark done.
    await updateStatus(table, id, 'done');

    // 7. Emit done and close the stream.
    emit('done', { count: totalProduced });
    res.end();
  } catch (err: unknown) {
    console.error(`Generation pipeline error for ${table}:${id}:`, err);
    const message = err instanceof Error ? err.message : String(err);

    // Always persist the error status, even if the client is gone.
    await updateStatus(table, id, 'error', message);

    // 8. headersSent-aware response.
    if (!res.headersSent) {
      // Headers not yet flushed — send a clean 500.
      res.status(500).json({ error: message });
    } else if (!closed) {
      // SSE stream is open — emit an error event the frontend reducer handles.
      emit('error', { message });
      res.end();
    }
    // else: client already disconnected; DB is updated, nothing more to do.
  }
}

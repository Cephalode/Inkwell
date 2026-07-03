/**
 * Shared generation-progress types used by the flashcard and practice-test
 * pipelines. Centralising them here lets both stores share one SSE-event
 * reducer instead of duplicating inline per-field merge blocks.
 *
 * The study-guide pipeline currently has its own richer progress shape
 * (see `src/store/studyGuideStore.ts`); this module is the neutral base that
 * the two card/question pipelines converge on.
 */

/** Coarse-grained lifecycle stage for any generation pipeline. */
export type GenerationStage =
  | 'idle'
  | 'collecting'
  | 'generating'
  | 'synthesizing'
  | 'done'
  | 'error';

/**
 * Neutral progress state.
 *
 * `itemsGenerated` replaces the old feature-specific `cardsGenerated` /
 * `questionsGenerated` counters. For both pipelines this counts the number of
 * materials that have returned a result (i.e. `material_result` events seen),
 * giving a consistent progress signal regardless of the generated item type.
 */
export interface GenerationProgress {
  stage: GenerationStage;
  itemsGenerated: number;
  error?: string;
}

/** Sentinel for a pipeline that hasn't started (or has no progress yet). */
export const initialProgress: GenerationProgress = {
  stage: 'idle',
  itemsGenerated: 0,
};

/**
 * Shape of a raw SSE event emitted by the generation endpoints
 * (`server/src/sse.ts` → `data: <json>\n\n`). Only `type` is guaranteed; the
 * remaining fields are optional and pipeline-specific.
 */
export interface GenerationEvent {
  type: string;
  /** Total material count (carried by `materials_collected`). */
  count?: number;
  /** Per-material identity/title (carried by `material_start` / `material_result`). */
  material?: { id: string; title?: string };
  /** Cards produced — carried by the flashcard pipeline. */
  cardCount?: number;
  /** Questions produced — carried by the practice-test pipeline. */
  questionCount?: number;
  /** Human-readable detail (`status`, `synthesizing`, `error`). */
  message?: string;
  /** Legacy alias — some paths historically used `error` instead of `message`. */
  error?: string;
}

/**
 * Reduce a raw SSE event into updated generation progress (pure function).
 *
 * Event → stage mapping (see `server/routes/flashcards.ts` &
 * `server/routes/practiceTests.ts`):
 *
 *   `materials_collected` → `collecting`   (materials gathered, generation imminent)
 *   `material_start`      → `generating`
 *   `material_result`     → `generating`   (+1 to `itemsGenerated`)
 *   `synthesizing`        → `synthesizing`
 *   `done`                → `done`
 *   `error`               → `error`        (captures `message`)
 *
 * Unknown event types (e.g. `status`) leave the progress untouched.
 */
export function reduceGenerationEvent(
  progress: GenerationProgress,
  event: GenerationEvent,
): GenerationProgress {
  switch (event.type) {
    case 'materials_collected':
      return { ...progress, stage: 'collecting', itemsGenerated: 0 };
    case 'material_start':
      return { ...progress, stage: 'generating' };
    case 'material_result':
      return { ...progress, stage: 'generating', itemsGenerated: progress.itemsGenerated + 1 };
    case 'synthesizing':
      return { ...progress, stage: 'synthesizing' };
    case 'done':
      return { ...progress, stage: 'done' };
    case 'error':
      return { ...progress, stage: 'error', error: event.message ?? event.error ?? 'Unknown error' };
    default:
      return progress;
  }
}

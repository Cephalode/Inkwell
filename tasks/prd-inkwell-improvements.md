# PRD: Inkwell Post-Review Improvement Plan

## Overview

A July 2026 code review of the study-guides / flashcards / practice-tests work fixed 10 confirmed bugs but deliberately deferred a set of structural improvements. This PRD covers that deferred work: (1) small correctness/UX follow-ups the review flagged, (2) consolidating three copies of the server-side generation pipeline into one, (3) consolidating duplicated frontend SSE parsing, progress types, and navigation config, (4) infrastructure debt (versioned DB migrations, lint burn-down, CI), and (5) small feature polish. The goal is that the *next* generation-style feature (e.g. quizzes) is built on shared mechanisms instead of a fourth copy-paste, and that a broken build can never sit unnoticed on a branch again.

Context for agents:
- Frontend: React + TypeScript + Vite + zustand, in `src/`.
- Backend: Express + TypeScript (run via tsx), Postgres via `pg` Pool (`server/db.ts`), in `server/`.
- The three existing generation features are: study guides (`server/routes/studyGuides.ts`, `src/hooks/useStudyGuideGeneration.ts`), flashcards (`server/routes/flashcards.ts`, `src/store/flashcardStore.ts`), practice tests (`server/routes/practiceTests.ts`, `src/store/practiceTestStore.ts`).
- A shared buffered SSE consumer already exists at `src/utils/sse.ts` (`consumeSSE`) and is used by the two newer stores.
- SSE wire format: `data: <json>\n\n`, events carry a `type` field (`materials_collected`, `material_start`, `material_result`, `synthesizing`, `done`, `error`). Do not change the wire format.

## Goals

- One server-side generation pipeline shared by study guides, flashcards, and practice tests; zero inline copies of the status-UPDATE SQL and staleness timeout.
- One SSE consumer (`src/utils/sse.ts`) used by every SSE-reading code path in `src/`.
- One `GenerationProgress` type and one SSE-event→progress reducer; list pages show accurate "Generating…" state and real progress.
- One navigation config consumed by `Sidebar`, `MobileDrawer`, and `MobileHeader`.
- Versioned, ordered DB migrations replacing ad-hoc `ALTER TABLE ... IF NOT EXISTS` statements in `server/schema.sql`.
- `npx eslint .` passes with zero errors; CI gates every push on typecheck, lint, and build.
- Resolve the three flagged behavior regressions (chat auto-title, thumbnail clearing, hidden textbook documents).

## Quality Gates

These commands must pass for every user story (run from the repo root):
- `npx tsc -b` — type checking (currently passes; must stay passing)
- `npx eslint <files changed by the story>` — zero errors on all files the story touches
- `npm run build` — production build must succeed

After US-014 (lint burn-down) is complete, the lint gate becomes `npx eslint .` for all subsequent stories.

For UI stories, also include:
- Verify in browser using dev-browser skill (dev server: `npm run dev`, frontend on port 3001, backend on 3002; backend requires local Postgres with role/database per `server/db.ts` defaults)

---

## User Stories

### Phase 1 — Correctness and UX follow-ups

### US-001: Chat session auto-titling never fails silently
**Description:** As a user, I want every chat session to get an automatic title so that my session list stays navigable even when the LLM returns an empty completion.

**Acceptance Criteria:**
- [ ] In `server/routes/chatSessions.ts` `POST /:id/generate-title`, when `choices[0].message.content` is empty/missing, fall back to the first user message truncated to 60 characters (word-boundary truncation, ellipsis appended) instead of returning HTTP 500
- [ ] The route only returns 500 when the upstream LLM request itself fails (network/HTTP error)
- [ ] The fallback title is persisted to `chat_sessions.title` exactly like an LLM-generated title

### US-002: Re-parsing a document clears a stale thumbnail
**Description:** As a user, I want a document's thumbnail to reflect its latest parse so that I never see a stale image after re-uploading or re-parsing.

**Acceptance Criteria:**
- [ ] In `src/hooks/useDocuments.ts` (`uploadFile` post-parse persist), send `thumbnail: parsed.thumbnail ?? null` so the PATCH explicitly clears the column when the parser produced no thumbnail (restores pre-regression behavior)
- [ ] Verify `updateDocument` in `src/services/api/client.ts` serializes `null` (not omitted) for the thumbnail field, and the server PATCH handler writes `NULL` to the column

### US-003: Documents page degrades gracefully when textbooks fail to load
**Description:** As a user, I want to know when my textbook chapters could not be loaded so that documents assigned to a textbook don't silently disappear from every list.

**Acceptance Criteria:**
- [ ] `GET /api/documents` behavior is unchanged (still excludes `textbook_id IS NOT NULL` rows)
- [ ] When the textbook list fetch fails on DocumentsPage (`src/pages/DocumentsPage.tsx`), a visible error banner states that textbooks could not be loaded, with a retry button
- [ ] The banner does not appear when the textbook fetch succeeds (including when the user has zero textbooks)

### US-004: One GenerationProgress type with a correct event→stage reducer
**Description:** As a developer, I want a single progress type and a single SSE-event reducer so that flashcards and practice tests cannot drift and the "generating" stage actually occurs.

**Acceptance Criteria:**
- [ ] A single `GenerationProgress` type lives in one module (e.g. `src/types/generation.ts`) with a neutral `itemsGenerated` count; `src/types/flashcards.ts` and `src/types/practiceTest.ts` re-export or use it, deleting their duplicated definitions
- [ ] A shared reducer function maps raw SSE events to progress: `material_start`/`material_result` map to stage `'generating'`; `materials_collected`, `synthesizing`, `done`, `error` map to their stages; unknown event types leave the stage unchanged
- [ ] `src/store/flashcardStore.ts` and `src/store/practiceTestStore.ts` both use the shared reducer inside their `consumeSSE` callbacks; their inline per-field merge blocks are deleted
- [ ] `npx tsc -b` proves no consumer still references `cardsGenerated`/`questionsGenerated` on the progress type (rename or alias consistently)

### US-005: List pages show accurate generating state and real progress
**Description:** As a user, I want the deck/test cards to show a live, truthful progress indicator while generation runs so that I know work is happening and how far along it is.

**Acceptance Criteria:**
- [ ] `src/pages/FlashcardsPage.tsx` and `src/pages/PracticeTestsPage.tsx` derive `isGenerating` from the shared reducer's stage (which now emits `'generating'`; see US-004) or the entity's `status`
- [ ] The static `w-1/2` progress bar in FlashcardsPage is replaced with a width computed from actual progress (e.g. `itemsGenerated` against the 30-card cap, or materials processed / materials total); PracticeTestsPage gets the same treatment
- [ ] While a generation started from the create flow is running, the corresponding card shows "Generating…" (not "Pending") without requiring a page refresh

### US-006: Store fetch errors reach the UI
**Description:** As a user, I want to see an error message when decks/tests fail to load so that I don't stare at a permanently empty list.

**Acceptance Criteria:**
- [ ] `fetchDecks`/`fetchCards` in `src/store/flashcardStore.ts` and `fetchTests`/`fetchTest` in `src/store/practiceTestStore.ts` rethrow after logging, so the `error` state in `useFlashcards`/`useFlashcardDeck`/`usePracticeTests`/`usePracticeTest` becomes reachable
- [ ] `FlashcardsPage` and `PracticeTestsPage` render the hook's `error` (message plus retry affordance) instead of the empty state when a load fails
- [ ] Callers that already handle rejection (`generateDeck`'s internal `fetchCards` call, detail pages) still work — no unhandled promise rejections in the browser console during normal use

### Phase 2 — One server-side generation pipeline

### US-007: Extract a shared generation pipeline helper
**Description:** As a developer, I want one `runGeneration` helper owning status transitions, staleness, SSE emission, and error handling so that cross-cutting fixes land once instead of three times.

**Acceptance Criteria:**
- [ ] New module `server/src/generationPipeline.ts` exports (a) a `runGeneration` helper that owns: marking the row `generating`, emitting `materials_collected`/`material_start`/`material_result`/`synthesizing`/`done`/`error` events, breaking on client disconnect, marking `done`/`error` status, and the `headersSent`-aware error path; and (b) an `updateStatus(table, id, status, error?)` helper for the status-UPDATE SQL
- [ ] A single exported `GENERATION_TIMEOUT_MS` constant (10 minutes) and a `checkStale(row)` helper replace the three inline staleness implementations
- [ ] The helper is parameterized by table name, materials collector, and a per-material callback returning the count of items produced; it makes no assumptions specific to guides/cards/questions
- [ ] SSE wire format (event names and payload fields) is byte-compatible with the current implementation — no frontend change required by this story
- [ ] Unit-testable without a live LLM: the per-material callback is injected

### US-008: Port study guides onto the shared pipeline
**Description:** As a developer, I want `studyGuides.ts` to use `runGeneration` so that its private `updateStatus` and staleness code are deleted.

**Acceptance Criteria:**
- [ ] `server/routes/studyGuides.ts` `POST /:id/generate` uses `runGeneration`; its local `updateStatus`, staleness block, and `fail()` closure are removed
- [ ] `GET /:id` uses the shared `checkStale`
- [ ] Generating a study guide from the UI produces the same event sequence as before (verify by exercising the flow and observing the network tab or server log)

### US-009: Port flashcards and practice tests onto the shared pipeline
**Description:** As a developer, I want both newer routes on `runGeneration` so that no route file contains inline status SQL or SSE plumbing.

**Acceptance Criteria:**
- [ ] `server/routes/flashcards.ts` and `server/routes/practiceTests.ts` `POST /:id/generate` use `runGeneration`; the delete-previous-rows step, 30-card cap short-circuit, and per-material question budgeting move into their per-material callbacks or pipeline options
- [ ] Both `GET /:id` handlers use the shared `checkStale`
- [ ] `grep -rn "SET status" server/routes/` returns no matches in the three generation route files (all transitions go through `updateStatus`)
- [ ] End-to-end: creating a deck and a test from the UI still generates cards/questions and finishes with status `done`

### US-010: Background reaper for wedged generations
**Description:** As a user, I want a deck/test/guide that crashed mid-generation to be marked as errored automatically so that it doesn't sit on "Generating…" until someone happens to fetch it.

**Acceptance Criteria:**
- [ ] On server boot (`server/index.ts`), an interval (every 60s) marks rows in `study_guides`, `flashcard_decks`, and `practice_tests` with `status = 'generating'` and `updated_at` older than `GENERATION_TIMEOUT_MS` as `status = 'error'`, error `'Generation timed out'`
- [ ] The read-time staleness checks from US-007–US-009 remain as a fallback (a fetch immediately after the timeout still reports the error even if the reaper hasn't ticked)
- [ ] The interval is `unref()`ed so it doesn't block process shutdown

### Phase 3 — Frontend consolidation

### US-011: Migrate remaining SSE consumers to the shared parser
**Description:** As a developer, I want every SSE-reading path to use `consumeSSE` from `src/utils/sse.ts` so that the chunk-boundary bug class is dead everywhere.

**Acceptance Criteria:**
- [ ] `src/hooks/useStudyGuideGeneration.ts`, `src/hooks/useChapterAnalysis.ts`, `src/components/upload/VideoSummaryPanel.tsx`, and the SSE reader in `src/services/ai/client.ts` (or wherever `getReader()` + manual `data:` parsing lives — grep for `getReader`) use `consumeSSE`
- [ ] If a consumer needs abort support, extend `consumeSSE` with an optional `AbortSignal` parameter rather than keeping a bespoke loop (study-guide generation currently aborts via its own controller — preserve that behavior)
- [ ] `grep -rn "getReader()" src/` shows no remaining hand-rolled SSE parse loops outside `src/utils/sse.ts`

### US-012: Single navigation config
**Description:** As a developer, I want one navigation definition so that adding a page cannot ship half-navigable again.

**Acceptance Criteria:**
- [ ] New module `src/config/navigation.ts` exports the ordered nav items: path, label, icon component
- [ ] `src/components/layout/Sidebar.tsx`, `src/components/layout/MobileDrawer.tsx`, and `src/components/layout/MobileHeader.tsx` (its `pathTitleMap`) all derive from it; their local arrays/maps are deleted
- [ ] Sidebar and MobileDrawer render the same set of destinations in the same order (current divergence resolved: both include Dashboard, Documents, Textbook, Courses, Study Guides, Flashcards, Tests, Settings)
- [ ] Study Guides, Flashcards, and Tests get visually distinct icons (currently all `HiAcademicCap`)
- [ ] MobileHeader page titles resolve for every nav path, including nested routes via the existing prefix match

### Phase 4 — Infrastructure

### US-013: Versioned database migrations
**Description:** As a developer, I want ordered, versioned migrations so that fresh and long-lived databases converge on the identical schema.

**Acceptance Criteria:**
- [ ] A migrations mechanism exists: either `node-pg-migrate` or a minimal built-in runner (a `schema_migrations` table recording applied filenames, plus `server/migrations/NNN_description.sql` files applied in order at server boot before routes accept traffic)
- [ ] Migration 001 is a baseline capturing the current full schema (current `schema.sql` including all its inline `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements folded in); it must be a no-op on an existing up-to-date database (guarded by `IF NOT EXISTS` or by pre-seeding `schema_migrations`)
- [ ] `server/schema.sql` is either deleted or reduced to documentation pointing at `server/migrations/`
- [ ] README or a comment in `server/index.ts` documents how to add a new migration
- [ ] Starting the server against an empty database creates the full schema; starting it against a database that predates this story applies nothing destructive (verify both paths locally)

### US-014: Lint burn-down to zero
**Description:** As a developer, I want `npx eslint .` to pass so that lint can gate CI and new violations are impossible to miss.

**Acceptance Criteria:**
- [ ] All ~84 remaining problems are fixed — concentrated in `src/services/parsers/*` (`no-explicit-any`), older sections of `src/services/api/client.ts` (11 `any`s in `mapDocument` and friends), `src/store/chatStore.ts` (unused import), and `src/lib/ForceGraph2D.tsx`
- [ ] Fixes use real types (e.g. pdfjs `TextItem` narrowing like `'str' in item`, typed raw-row shapes like the existing `Nullable<T, K>` helper in client.ts) — no `eslint-disable` comments and no rule downgrades except where a rule is genuinely wrong for the file (justify any config change in the PR description)
- [ ] `npx eslint .` exits 0
- [ ] `npx tsc -b` still passes (typing formerly-`any` code must not introduce compile errors)

### US-015: CI pipeline gating typecheck, lint, and build
**Description:** As a developer, I want every push checked so that a broken build can never sit unnoticed on a branch again (the reviewed branch had 4 tsc errors across 2 commits).

**Acceptance Criteria:**
- [ ] `.github/workflows/ci.yml` runs on push and pull_request: checkout, Node 22 setup with npm cache, `npm ci`, `npx tsc -b`, `npx eslint .`, `npm run build`
- [ ] Server deps installed too if needed for tsc project references (`npm ci` in `server/` — check `tsconfig` project layout and include only if required)
- [ ] Workflow passes on the current branch once US-014 is merged (depends on US-014; if run before it, lint step may be marked `continue-on-error: false` only after US-014)
- [ ] No secrets required — DB-dependent tests are out of scope; CI is static checks + build only

### Phase 5 — Feature polish

### US-016: Practice test attempts history
**Description:** As a user, I want to see my past attempts and scores on a test so that I can track improvement over time.

**Acceptance Criteria:**
- [ ] `src/pages/PracticeTestDetailPage.tsx` fetches attempts on mount via the existing `fetchAttempts` store action (`GET /api/practice-tests/:id/attempts` and client `getTestAttempts` already exist)
- [ ] A "Previous attempts" section lists date and score (percentage, rounded) for each attempt, newest first; hidden when there are no attempts
- [ ] After submitting an attempt, the new attempt appears in the list without a page refresh (the store already prepends it in `submitAttempt`)

### US-017: Delete confirmations for decks and tests
**Description:** As a user, I want a confirmation before deleting a deck or test so that a stray click on a hover-revealed trash icon can't destroy generated content.

**Acceptance Criteria:**
- [ ] Clicking the trash icon on `FlashcardsPage` and `PracticeTestsPage` cards opens a confirmation (reuse an existing confirm pattern in the codebase if one exists — check `src/components/shared/`; otherwise a minimal inline confirm state on the card is acceptable)
- [ ] Deletion only proceeds on explicit confirm; Escape or clicking elsewhere cancels
- [ ] The confirmation names the item being deleted (deck/test title)

### US-018: Deck mastery summary from review stats
**Description:** As a user, I want a per-deck summary of my review performance so that the "Got it"/"Missed" tracking has visible payoff.

**Acceptance Criteria:**
- [ ] `FlashcardDetailPage` shows an aggregate above the study area: number of cards reviewed at least once out of total, and overall correct rate across all reviews (computed client-side from each card's `review_stats`)
- [ ] Cards with `timesReviewed === 0` are excluded from the correct-rate denominator
- [ ] The summary updates immediately after a "Got it"/"Missed" click (store already updates the card in place)

---

## Functional Requirements

- FR-1: The system must expose exactly one server-side implementation of generation status transitions, staleness detection, and SSE event emission, shared by all generation features.
- FR-2: The SSE wire format (`data: <json>\n\n`; event `type` values `materials_collected`, `material_start`, `material_result`, `synthesizing`, `done`, `error`) must remain unchanged throughout Phases 2–3.
- FR-3: All frontend SSE consumption must go through `src/utils/sse.ts` `consumeSSE`, which must buffer across network chunks and split on `\n\n`.
- FR-4: A single `GenerationProgress` type and reducer must translate SSE events into UI progress, with `material_start`/`material_result` surfacing as the `generating` stage.
- FR-5: Navigation destinations, labels, and icons must be defined once and consumed by all three layout components.
- FR-6: Database schema changes must be applied through ordered, recorded migrations; the server must apply pending migrations at boot before serving requests.
- FR-7: Rows stuck in `generating` beyond the shared timeout must be transitioned to `error` both lazily (on read) and proactively (background reaper).
- FR-8: Chat session title generation must always persist a non-empty title when the upstream LLM call succeeds, using the truncated first user message as fallback.
- FR-9: CI must fail any push where `npx tsc -b`, `npx eslint .`, or `npm run build` fails.
- FR-10: Store-level fetch failures for decks and tests must propagate to hook `error` state and be rendered by list pages.

## Non-Goals (Out of Scope)

- No changes to the SSE wire protocol, LLM prompts, or generation quality/content.
- No authentication, authorization, or multi-user concerns.
- No database engine change (stays Postgres via `pg`), no ORM adoption.
- No spaced-repetition scheduling algorithm for flashcards (US-018 is display-only aggregation).
- No automated test suite bootstrap (unit/E2E frameworks) — CI is static checks + build only in this PRD.
- No redesign of the mobile navigation UX beyond consolidating its config.
- No backfill or transformation of existing data beyond what the baseline migration requires (which must be non-destructive).

## Technical Considerations

- **Dependencies between stories:** US-004 before US-005; US-007 before US-008/US-009/US-010; US-014 before US-015 (lint gate). Phases are otherwise independent and can be interleaved.
- **Pipeline extraction risk (Phase 2):** studyGuides' generate handler synthesizes a final content payload (REDUCE step) that flashcards/tests lack; design `runGeneration` with an optional `finalize` callback rather than forcing uniformity.
- **`consumeSSE` abort support (US-011):** extend the helper's signature (`signal?: AbortSignal`) — it must cancel the reader and return without throwing on abort, matching `useStudyGuideGeneration`'s current semantics.
- **Migrations (US-013):** the app currently applies `schema.sql` manually/ad hoc; confirm how the schema is applied in dev before wiring boot-time migrations (grep `server/index.ts` and package scripts). Preserve `gen_random_uuid()` (requires `pgcrypto` or PG13+) in the baseline.
- **CI (US-015):** the repo has two package.json files (root and `server/`); tsc project references may require installing server deps in CI. Verify with a clean clone.
- **Existing patterns to reuse:** `Nullable<T, K>` raw-row typing in `src/services/api/client.ts`; buffered SSE parsing in `src/utils/sse.ts`; `updateStatus` helper shape in `server/routes/studyGuides.ts`.

## Success Metrics

- `grep -rn "SET status" server/routes/` → 0 matches in generation route files; one timeout constant repo-wide.
- `grep -rn "getReader()" src/` → matches only in `src/utils/sse.ts`.
- One `GenerationProgress` definition; one nav config module; three layout components with no local nav arrays.
- `npx eslint .` exits 0; CI green on `dev`; a deliberately introduced type error on a test branch fails CI.
- Fresh-database boot and existing-database boot both converge on identical schemas (compare `pg_dump --schema-only` output).
- No deck/test/guide remains in `generating` state longer than 11 minutes after a killed server process.

## Open Questions

- Should the reaper (US-010) also emit a metric/log line for observability, or is silent transition acceptable? (Default: log one line per reaped row.)
- US-013: `node-pg-migrate` (dependency, battle-tested) vs. minimal built-in runner (no dependency, ~50 lines)? Default recommendation: minimal built-in runner, matching the project's low-dependency style.
- Whether `/tests` should be renamed to `/practice-tests` for URL clarity while touching nav config (US-012) — deferred; would break any saved links.

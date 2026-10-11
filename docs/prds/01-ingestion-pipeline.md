# PRD 1 — Content ingestion & processing pipeline

Turn any material (PDF, YouTube link, live recording) into a processed
"content" object that all study features hang off of, with live status the user
can watch.

## Observed UX (Turbo)
1. Dashboard composer "What do you want to learn?" with **Record** (live
   capture), **Upload** (file picker), **YouTube** (paste link). Free-text
   prompt optional alongside the attachment.
2. Attached file = chip in composer. Submit routes through the chat backend.
3. Per-item live status on the dashboard: `current_generation_step` strings —
   "Starting up..." → "Reading your material..." → "Writing your study doc..."
   — plus `eta_seconds` and `percent_completed`.
4. Failure states are data, not dead spinners: `error_message`,
   `not_enough_credits` on the content row.

## Implementation evidence
- Upload: `POST upload-proxy-production.workers-turbo.ai/files` → `PATCH
  /files/<id>` (two-phase create+commit; a HEAD probe precedes PATCH).
  Final storage: `user-uploads-production.api-turbo.ai/<student_id>/documents/<uuid>.pdf`.
- `content_all` columns (shape snapshot): `content_id, content_status
  (PROCESSING→COMPLETE), content_type (pdf…), content_title, current_generation_step,
  eta_seconds, percent_completed, folder_id, student_id, yt_video_id, file_link,
  duration, error_message, not_enough_credits, is_deleted, is_public,
  is_public_view, is_public_edit, is_system_generated, modal_slug,
  multi_file_links, note_priority_index, pm_schema_version, class_subject,
  device_type, source_catalog_item_id, uploaded_at, last_modified, created_at`.
- Generation driven by chat: `POST chat-production.../chat/create-lesson` with
  Vercel-AI-SDK parts (`{type:'file', mediaType, filename, url}`); the model's
  tool-calls spawn per-feature jobs.
- Workers use claim-based queueing: `lessons.outline_attempts/outline_claimed_at`,
  `lesson_sections.attempts/claimed_at/generation_status`.

## Inkwell build
### Schema (migration)
```sql
ALTER TABLE documents
  ADD COLUMN generation_step text,           -- 'uploading'|'extracting'|'reading'|'writing'|null=done
  ADD COLUMN generation_eta_s int,
  ADD COLUMN generation_percent int DEFAULT 0,
  ADD COLUMN error_message text,
  ADD COLUMN needs_upgrade boolean DEFAULT false;  -- entitlement failure flag
```
### Behavior
1. Upload stays direct-to-Supabase-Storage (we don't need Turbo's proxy until
   client-side multipart matters).
2. Existing classify→summary chain gains step updates: each GLM/extract stage
   writes `generation_step` + bumps `generation_percent` (10/35/70/95/100).
3. Any generator failure writes `error_message` and a `generation_failed` UI
   state with a Retry button (reuse the summary reaper pattern to catch stuck
   rows: `generation_step IS NOT NULL AND updated_at < now()-'10 min'` → mark failed).
4. Entitlement denial (PRD 10) sets `needs_upgrade=true` + `error_message`,
   never a bare 500.
5. `generation_step`/`percent` broadcast via one Supabase Realtime channel per
   document; UI subscribes only while a doc is PROCESSING.

## Acceptance criteria
- Uploading a PDF shows ≥3 distinct step labels before completion.
- Killing the server mid-generation results in a failed state + Retry within
  10 min, not an eternal spinner.
- Free-tier limit hit produces the upsell state, verifiable in DB.

**Effort:** 2-3 days. **Skipped:** multi-file bundles, live Record capture
(inkwell-ios already plans recording), YouTube transcript diffing — add when asked.

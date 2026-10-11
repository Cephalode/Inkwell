# PRD 12 — Sync & infra reference (adopt selectively)

What Turbo runs, and what of it we should actually copy.

## Implementation evidence
- **ElectricSQL shapes**: per-table subscriptions
  `GET electric-production.../v1/shape?shape_id=student|folders|content_all|
  lessons|lesson_sections|last_opened` with `handle`/`cursor`/`live=true`
  streaming. Local-first reads; writes via PostgREST/edge functions.
- **Anonymous bootstrap**: `/auth/v1/signup` on first paint (PRD 9).
- **Flags + analytics**: `GET /api/init?platform=web` and periodic
  `POST /api/sync` batches: `{batch_sent_at, context:{student_id, country_code,
  user_type, subscription_tier, subscription_source, platform, sdk_version,
  session_id, flags:{web_learn_mode_v1:'learn'}, student_props_snapshot}}` —
  experiments + funnel instrumentation from day one.
- **Service split**: api (PostgREST) / chat (AI SDK) / podcasts / upload-proxy /
  electric / churnkey — small dedicated workers.

## Inkwell build (the lazy cuts)
- **Sync: skip ElectricSQL.** Our scale doesn't need local-first reconciliation.
  Where live status matters (generation progress, PRD 1), use Supabase Realtime
  on the documents channel; everything else polls on focus. Revisit only if the
  mobile app needs offline.
- **Adopt: flag endpoint** — `GET /api/flags` returning one JSON we control
  (`{learn_mode:false, …}`), read at app boot. One file, and it's the switch
  for every PRD above.
- **Adopt: event batching** — single `POST /api/events` that accepts arrays;
  client buffers 10s/25 events. Server forwards to our analytics sink.
- **Adopt: service posture** — keep generation behind internal endpoints the
  way Turbo splits chat/podcasts: one `worker` entry point per long job so a
  stuck podcast can't starve quizzes (we have this shape via the reaper; keep it).

## Acceptance criteria
- Flag endpoint ships with one flag actually gating a feature.
- Client sends batched events (verify: ≤6 requests/min during normal use).

**Effort:** 2-3 days. **Skipped:** ElectricSQL, CRDTs, offline mode — revisit
when mobile sync hurts.

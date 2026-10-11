# Turbo AI Feature PRDs (reverse-engineered, full spec)

Built Sep 17, 2026 from a live investigation of turbo.ai: signed into a real
account, created a test folder, uploaded a PDF, and captured the app's actual
API traffic, Postgres schema, and full UI. Every PRD states the observed UX,
the implementation evidence, the Inkwell build plan (schema, endpoints,
prompts, UI), acceptance criteria, and effort.

## Evidence index
- API transcripts: `/tmp/turbo-api-*.json`
- ElectricSQL shape snapshots (raw schema): `/tmp/turbo-shapes-raw.jsonl`
- UI text dumps: `/tmp/turbo-tab-*.txt`, `/tmp/turbo-note-text.txt`

## PRDs
| # | Feature | File | Effort |
|---|---------|------|--------|
| 1 | Ingestion & processing pipeline | `01-ingestion-pipeline.md` | 2-3 d |
| 2 | AI study notes | `02-ai-notes.md` | 2 d |
| 3 | Learn mode (Duolingo lessons) | `03-learn-mode.md` | 1.5-2 wk |
| 4 | Quiz engine | `04-quiz-engine.md` | 3-4 d |
| 5 | Flashcards v2 | `05-flashcards.md` | 1 d |
| 6 | Podcast v2 | `06-podcast.md` | 4-6 d |
| 7 | Chat as command line | `07-chat.md` | 1 wk |
| 8 | Folders & recency | `08-folders.md` | 2 d |
| 9 | Auth & sharing v2 | `09-auth-sharing.md` | 3-4 d |
| 10 | Monetization | `10-monetization.md` | 4-5 d |
| 11 | Source viewer | `11-source-viewer.md` | 2 d |
| 12 | Sync & infra | `12-sync-infra.md` | 2-3 d |

Suggested build order: 8 → 2 → 1 → 4 → 5 → 6 → 11 → 3 → 7 → 9 → 10 → 12
(front-load cheap Turbo-parity wins; Learn mode + chat-tools are the differentiators).

## Turbo's observed stack
- **Auth:** Supabase GoTrue, anonymous-first, Google OAuth + PKCE, silent identity link
- **DB:** Supabase Postgres via PostgREST (`rest/v1`) + edge functions (`functions/v1`)
- **Realtime:** ElectricSQL read-shapes per table
- **AI:** Vercel AI SDK stream protocol with tool-calls (chat drives all generation)
- **Uploads:** Cloudflare Worker two-phase proxy (POST create → PATCH commit)
- **Podcasts:** dedicated service (mp3 + cover art + speakers)
- **Flags/analytics:** `/api/init` + `/api/sync` batches (PostHog-style)
- **Billing UI:** Churnkey cancel-save flows

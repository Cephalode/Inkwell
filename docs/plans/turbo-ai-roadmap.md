# Inkwell × Turbo AI — Roadmap

How Turbo AI went 0 → 10M users, and the ordered plan to get the same shape onto Inkwell. Numbers from TechCrunch (Oct 2025), Business Insider (Nov 2025), Inc., and Sacra. **Feature specs live in `docs/prds/` (12 PRDs, reverse-engineered from live turbo.ai Sep 17, 2026) — this doc is the ordered plan that implements them.**

## What Turbo actually did

| Milestone | When | Signal |
|---|---|---|
| Side project at Duke/Northwestern, launch as TurboLearn | early 2024 | notes + flashcards + quizzes from lecture recordings |
| $750k seed (angels, no VC) | Jul 2024 | never spent it — profitable from day one |
| 300k users, $500k revenue | pre-paid-ads | growth = founder social content (Arora's TikTok/IG), campus communities |
| 1M → 5M users in 6 months, ~20k/day | Oct 2025 | rebrand TurboLearn → Turbo AI as audience broadened to professionals |
| ~10M users, $13M+ lifetime revenue, team ~10 | 2026 | $20/mo sub, freemium, no additional funding taken |
| Partnership: Mark Cuban Foundation AI Bootcamps | 2025 | free-tool-for-nonprofits → earned-media flywheel |

The moat was never features — Otter/NotebookLM out-feature them. It was **distribution**: raw founder content + student word-of-mouth + a product students naturally share ("study with me" videos). Pricing deliberately cheap for students; profit reinvested in staying independent.

## Gap analysis — Turbo vs Inkwell today

Updated Sep 17 after live reverse-engineering (see `docs/prds/` for per-feature specs).

| Capability | Turbo | Inkwell |
|---|---|---|
| Upload docs/lectures/YouTube → notes | ✅ | ✅ |
| Flashcards / quizzes / practice tests | ✅ | ✅ |
| AI chat with material | ✅ | ✅ (RAG agent) |
| Chapter extraction | ❌ | ✅ (better) |
| Knowledge graph | ❌ | ✅ (unique) |
| Coursera sync, integrations | ❌ | ✅ (unique) |
| **Podcast/audio recaps** | ✅ (most-loved) | 🟡 basic auto-podcast shipped (v2 spec: PRD 6) |
| **Learn mode (Duolingo lessons)** | ✅ (differentiator) | ❌ (PRD 3) |
| **Live generation status** | ✅ step labels + ETA | ❌ (PRD 1) |
| **Folders + last-opened recency** | ✅ | ❌ (PRD 8) |
| **Source viewer tab** | ✅ | ❌ (PRD 11) |
| **Chat = command line (tool-driven generation)** | ✅ | ❌ (PRD 7) |
| **Anonymous-first auth** | ✅ | 🟡 auth built, anon-first linking missing (PRD 9) |
| **Payments (freemium sub)** | ✅ $20/mo | 🟡 Stripe scaffold (PRD 10) |
| **Mobile app shipped** | ✅ native | 🟡 SwiftUI skeleton |
| **Distribution engine** | ✅ the moat | ❌ |

## Phased roadmap — implementation order

Two sources merged: the original business roadmap (distribution-first thinking)
and the 12 feature PRDs from the Sep 17 Turbo teardown
(`docs/prds/README.md` has evidence + effort per PRD). Engineering order below
is by (leverage ÷ effort); the business phases follow after.

### Engineering phases (from the PRDs)

| Phase | PRDs | What | Effort |
|---|---|---|---|
| **E1 — Dashboard foundations** | 8, 2 | Folders + last-opened recency ("Jump back in"); notes v2 (deep, LaTeX, editable, versioned) | ~4 d |
| **E2 — Generation trust** | 1 | Live step labels + ETA + percent on every generator; failures as data (`error_message`, Retry), entitlement failures set `needs_upgrade` | 2-3 d |
| **E3 — Study suite parity** | 4, 5 | Quiz engine v2 (topic labels, hints, explanations, count presets — one generator reused by lessons); flashcards count presets + special instructions | 4-5 d |
| **E4 — Podcast v2** | 6 | Sectioned script JSON → per-section TTS → timestamps; synced transcript; static cover art; transcript into RAG for chat-over-podcast | 4-6 d |
| **E5 — Source viewer** | 11 | Source tab: PDF.js / YouTube embed / audio player from `content_sources` | 2 d |
| **E6 — Learn mode** | 3 | `lessons` + `lesson_sections` tables; outline-first GLM call, per-section parallel generation, typed sections (intro/teaching/quiz), progress ring, checkpoint gating | 1.5-2 wk |
| **E7 — Chat command line** | 7 | Expose every generator as a chat tool (`generate_quiz/flashcards/podcast/lesson`); file parts in threads; artifact cards in chat | ~1 wk |
| **E8 — Accounts & money** | 9, 10 | Anonymous-first sessions + Google identity linking (keeps content); `referral_source`/`signup_platform` instrumentation; Stripe tiers with data-flag gating (never 500s) | 1.5 wk |
| **E9 — Infra (adopt lazily)** | 12 | `/api/flags` endpoint (gates E6), batched `/api/events`; skip ElectricSQL until mobile hurts | 2-3 d |

Dependency notes: E2's entitlement flag is consumed by E8's tiers — build the
column now, wire pricing later. E6 needs E3's quiz generator. E7 needs every
generator it exposes (E3-E6). E9's flag endpoint should exist before E6 ships.

### Business phases (unchanged thinking, updated mechanics)

### ~~Phase 0 — Podcast recaps~~ — ✅ SHIPPED (v1; v2 = E4)
V1 shipped Sep 15 (edge-tts two voices, chained off summary, `<audio controls>` player).
V2 = **E4** (PRD 6): sectioned transcript, timestamps, cover art, chat-over-podcast.

### Phase 1 — Make it a product (1–2 weeks) — 🟡 mostly built (auth backend, share links, scoping live; blocked on Google 2SV + Stripe finish → E8)
Prereq for anything Turbo-like at scale: other humans must be able to sign up.

1. **Auth** — Supabase Auth (email + Google OAuth). DB is already Supabase; RLS makes the multi-tenant switch mechanical. Biggest migration risk: the server assumes a single implicit user everywhere — add `user_id` columns, scope every query. *(Built. V2 = PRD 9 / E8: anonymous-first sessions + identity linking + referral instrumentation.)*
2. **Stripe freemium** — free tier: N docs/month, no TTS. Pro: unlimited + podcast recaps. Stripe Checkout + webhooks; the free/pro gate is one middleware check. *(Scaffolded. Full spec = PRD 10 / E8: tier fields on user, data-flag gating via `needs_upgrade`.)*
3. **Share links** — read-only public doc pages (`/s/<token>`). Zero-auth viral surface; also the landing page for the TikTok funnel.

### Phase 2 — Mobile (2–4 weeks)
Turbo is a native app; our iOS skeleton (Duolingo-style path, exercise sheets) is the right design but has no API wiring. Don't build everything: wire Path + Chat to the live API, ship a TestFlight. Uploads + recordings from phone can come later via the existing YouTube-import + file endpoints.

### Phase 3 — Distribution engine (continuous, start NOW not after Phase 1)
This is 80% of Turbo's outcome and costs $0. Arora's playbook, adapted:
- Short-form founder content: "study with me," app-in-hand study hacks, before/after of a 30-page PDF → flashcards (Inkwell's chapter-split + graph visuals are inherently demoable — use them)
- Campus/creator communities (UCLA-style), DMs over ads
- Free-for-nonprofits partnership angle (Mark Cuban Foundation-style earned media)
- Referral loop once Phase 1 lands (share links are the mechanic)

**The loop**: content → sign-up → wow moment (upload → podcast + knowledge graph in 30s) → share link → content. Inkwell's graph visualization is a better "wow" than anything Turbo has; it just needs to be in the first 60 seconds. *(Post-teardown addition: Learn mode (E6) is Turbo's own wow-moment machine — demo it in the content.)*

### Phase 4 — Pricing experiments (after traction)
Turbo A/B tests price around student sensitivity ($20/mo, $120/yr). Do the same only once there are users to test on — pricing research before users is procrastination.

## What we deliberately skip
- Burning VC money / growth-at-all-costs — Turbo's profitability is the model; Inkwell is already hosted for pocket change
- Otter-style live meeting capture — different market, professionals not students
- Enterprise/university sales — Turbo hasn't cracked it either (Sacra flags it as their risk too)

## Metrics that matter (Turbo's numbers as targets)
- Signups/day (Turbo: 20k at peak)
- Time-to-wow: upload → first flashcard quiz < 60s
- Free→paid conversion (Turbo: healthy at $20/mo)
- Content output: founder posts/week (the actual leading indicator)

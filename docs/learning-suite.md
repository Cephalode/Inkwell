# Learning suite

Inkwell's learning suite turns a course's materials into a Duolingo-style path:
a **roadmap** of ordered topics, a **skill** per topic that is shared across
courses, and per-topic **learning strategies** whose results feed an evidence
trail that decides when a topic is *learned*.

## Concepts

| Thing | Table | Notes |
| --- | --- | --- |
| Skill | `skills` | One row per distinct topic across all courses (`slug` = normalised label). Holds `mastery` (`not_started` / `learning` / `learned`) and `mastery_score` (0–1). |
| Roadmap | `roadmaps` | One per course. Generated from every material in the course (chapter analyses, transcripts, PDFs) via the shared SSE generation pipeline. |
| Step | `roadmap_steps` | Ordered topic in a roadmap. Points at a skill, carries objectives, key points, source refs and `depends_on` (earlier step ids). |
| Activity | `learning_activities` | One run of a strategy on a step: `lesson`, `quiz`, `flashcards`, `discussion` (Socratic tutor chat) or `recall` (teach it back). `content` is the generated payload, `result` the grading. |
| Evidence | `skill_evidence` | Every mastery signal: kind, score, weight. Mastery is recomputed from the trail (`server/src/mastery.ts`). |
| Profile | `learner_profile` | Single row: XP, today's XP, daily goal, streak. |

### Mastery rules (`server/src/mastery.ts`)

* Score = recency-weighted mean of evidence scores (newest weighs most).
* `learning` as soon as any evidence exists.
* `learned` when score ≥ 0.8, at least two signals, and at least one *assessed*
  strategy (quiz / discussion / recall) scored ≥ 0.7. Reading a lesson or
  drilling flashcards alone never marks a topic learned.
* "I already know this" records a manual signal that is trusted outright;
  "Reset progress" wipes the trail.
* Because the skill row is shared, a topic learned in one course is learned in
  every course whose roadmap teaches it (the roadmap generator is handed the
  existing skill labels so it reuses them).

### XP

lesson 10 · flashcards 15 · quiz 20 · teach-back 25 · discussion 30,
+10 for an assessed score ≥ 80 %, +25 when a skill becomes learned.
Streak advances on the first activity of a day.

## API

```
GET    /api/courses/:courseId/roadmap        roadmap view (steps + skill mastery + state + next step) or 404
POST   /api/courses/:courseId/roadmap        create / reset the roadmap row
POST   /api/roadmaps/:id/generate            SSE generation (pipeline events + a final `roadmap` event)
GET    /api/roadmaps/:id                     DELETE /api/roadmaps/:id
GET    /api/roadmap-steps/:stepId            step detail: activities, evidence, prev/next ids
POST   /api/roadmap-steps/:stepId/activities { kind }  → generated activity (quiz answers hidden)
GET    /api/learning-activities/:id          DELETE (abandon an unfinished one)
POST   /api/learning-activities/:id/submit   quiz {answers} · flashcards {grades} · lesson {checkpointsCorrect} · recall {answer} · discussion {} (close early)
POST   /api/learning-activities/:id/messages { content } — one tutor turn; closes the activity when the tutor is convinced
GET    /api/skills                           every skill with the courses/steps that teach it
POST   /api/skills/:id/mastery               { mastery: 'learned' | 'not_started' }
GET    /api/learning/overview                profile, per-course progress, review suggestions
```

Step `state` is derived on read: `learned` (skill learned), `locked` (a
`depends_on` step is not learned), `current` (first available step), else
`available`.

## Frontend

* `src/types/learning.ts` — shapes + `ACTIVITY_META` (labels, XP, emoji).
* `src/services/api/learning.ts` — fetchers; `src/store/learningStore.ts` — zustand store used by every surface.
* `/courses/:id` — `CourseRoadmap` (path view, build/regenerate, up-next hero).
* `/learn/steps/:stepId` — `LearnStepPage` with `StrategyPicker`, the runners in `src/components/learn/`, and `ActivityOutcome`.
* `/learn` — overview: XP, streak, continue, per-course progress, review suggestions, all skills.
* Topic map and the documents knowledge graph read mastery from skills (`buildTopicMap`, `graphTopics`).

## Developing without API quota

`server/scripts/mock-llm.mjs` answers every learning-suite prompt with canned
JSON. Point the backend at it with `GLM_UPSTREAM`:

```
node server/scripts/mock-llm.mjs
GLM_UPSTREAM=http://localhost:3999/v1/chat/completions npm run dev:backend
```

## Topic videos ("waste as little time as possible")

`server/src/videoSearch.ts` finds YouTube videos for a milestone and judges what
they teach; `server/routes/videos.ts` exposes it. No API key: search results are
scraped from youtube.com and captions come from the Innertube player endpoint.

Pipeline per skill:

1. **Bundle** — the target skill plus the unlearned steps that follow it on every
   roadmap that teaches it, so a video teaching several milestones gets credit.
2. **Queries** — the LLM writes ~4 precise queries (concept + discriminating
   term, lecture-style, and a "combo" naming a neighbour); heuristic fallback.
3. **Retrieve / pre-rank** — dedupe, drop < 1 min and > 3 h, score by title
   overlap, duration sweet spot (4–45 min), known teaching channels.
4. **Evidence** — captions cached on `videos`; start/middle/end sampled.
5. **Judge** — the LLM reports, for every bundle skill, coverage (0–1),
   confidence, objectives covered, where in the video, plus focus / level /
   quality. Every judged pair is stored in `video_coverage` (low coverage too).
6. **Rank on read** — value = Σ coverage × confidence × demand (courses that
   teach the milestone) over *unlearned* milestones, +15 % per extra milestone,
   divided by minutes^0.6, scaled by focus and quality. Shared milestones and
   multi-milestone videos win; already-learned milestones barely count.

```
GET  /api/skills/:id/videos            ranked videos for one milestone (+ search status)
POST /api/skills/:id/videos/search     run the pipeline ({ force } to ignore the 14-day cache)
GET  /api/videos/:id                   detail with milestones, courses, chapters, transcript excerpt
POST /api/videos/:id/watched           weak 'video' evidence on unlearned milestones, +10 XP once
GET  /api/learning/videos?courseId=    the plan: unlearned milestones (most shared first) + best videos
POST /api/learning/videos/plan         queue background searches for the next milestones (202)
POST /api/courses/:id/videos/search    same, scoped to a course
GET  /api/learning/document-usage      which roadmap milestones each document feeds
```

Pages: `/learn/videos` (plan), `/learn/videos/:id` (player with milestone
chapters), a "Videos for this milestone" section on each step, and cross-course
links wherever a milestone is shared.

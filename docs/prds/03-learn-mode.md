# PRD 3 — Learn mode (Duolingo-style lessons)

Turbo's differentiator (server flag `web_learn_mode_v1`): a guided, gamified
path through the material — page-by-page teaching with checkpoint quizzes,
progress ring, and completion gating. Matches Inkwell's iOS skeleton design.

## Observed UX (Turbo)
- "Learn" tab: generated cover image, progress ring (`42%`), **Continue**
  button resuming where you left off.
- Linear TOC: numbered sections with page counts and completion
  ("Classification methods · 11 pages · 7 done"), typed **Checkpoint**
  interstitials between topic groups, **Final Quiz** at the end.
- "4 of 11 complete", "Finish every section to complete the lesson" — sections
  gate the lesson, quiz sections gate completion.
- Sections stream in: TOC appears with early sections ready (`pages_complete`)
  while later ones show pending — no blocking wait.

## Implementation evidence
- `lessons`: `lesson_id, content_id, lesson_status (IN_PROGRESS|…),
  percent_completed, current_generation_step, cover_image_url, title,
  outline_attempts, outline_claimed_at, platform_type, student_id`.
- `lesson_sections`: `section_id, lesson_id, section_type (intro|teaching|quiz),
  title, index, content, generation_status (pending|pages_complete),
  attempts, claimed_at, page_plan, cover_image_url, student_id`.
- Also shapes `lesson_pages`, `lesson_sections` — sections are paginated
  internally (page_plan JSON) though the reader shows continuous scroll.
- Creation: `POST chat-production.../chat/create-lesson` — the LLM plans the
  outline from source as a tool call, then per-section jobs fill content.

## Inkwell build
### Schema
```sql
CREATE TABLE lessons (
  lesson_id uuid PK DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents,
  user_id uuid NOT NULL,
  title text NOT NULL,
  cover_image_url text,
  status text DEFAULT 'generating',   -- generating|ready
  percent_completed int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE lesson_sections (
  section_id uuid PK DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES lessons ON DELETE CASCADE,
  idx int NOT NULL,
  section_type text NOT NULL,         -- intro|teaching|quiz
  title text NOT NULL,
  content jsonb,                      -- markdown blocks; quiz sections hold PRD-4 JSON
  generation_status text DEFAULT 'pending',  -- pending|complete|failed
  user_progress jsonb                 -- {completed_pages:[], done:boolean}
);
```
### Pipeline
1. Outline job (after notes complete): one GLM call →
   `[{type:'intro'|'teaching'|'quiz', title, source_ref}]` (8-12 sections).
   Insert all rows `pending`.
2. Per-section jobs (parallel, 3 concurrent): teaching sections generate
   markdown from `source_ref` chunk (the outline call returns exact
   source-page ranges); quiz sections generate 3-5 PRD-4 questions.
   Retry once on invalid JSON, then `failed`.
3. `lessons.status='ready'` when all sections resolve; section completion
   updates `percent_completed` (trigger or app-level).
### UI
- Lesson page: left TOC (numbered, typed icons, checkmarks), main reader pane,
  Continue button, progress ring in header. Quiz sections render the quiz
  component inline; passing isn't required to proceed but Final Quiz gates the
  completion badge.
- Live: subscribe to section rows; pending sections show shimmer, fill in place.

## Acceptance criteria
- User can start reading section 1 while section 9 is still generating.
- Progress ring matches completed sections; completing Final Quiz flips lesson
  to complete.
- A section failing generation shows retry, doesn't poison the lesson.

**Effort:** 1.5-2 weeks (pipeline 3-4 d, reader UI 3-4 d, progress/quiz glue 2-3 d).
**Skipped:** cover image generation (static gradient + title), XP/streak
integration hooks exist via our learning suite — wire later.

# PRD 4 — Quiz engine

Assessment from notes: topic-grouped MCQs with hints and explanations. Powers
both the standalone Quiz tab and Learn-mode checkpoints — one generator, two
surfaces.

## Observed UX (Turbo)
- Quiz tab: "0 / 25" counter, "Question 3", topic label over the question
  ("Flexible Modeling and Advanced Methods"), 4 options A-D, **Show Hint**,
  Previous/Next nav, "Quiz Settings" (count/regenerate).
- Questions test source specifics (Benjamini-Hochberg FDR control), not
  generic trivia — they're generated from the notes.

## Implementation evidence
- Quiz content lives in `lesson_sections.content` for `section_type='quiz'` —
  the standalone tab renders the same artifact.
- "Quiz Settings" implies regeneration with parameters (count/topics).

## Inkwell build
### Generator
- GLM call, JSON-mode validated:
  ```json
  [{"topic":"string","question":"string","options":["a","b","c","d"],
    "answer_index":0,"hint":"string","explanation":"string"}]
  ```
- Inputs: notes markdown (chunked by section so topics align) + requested count.
- Prompt: "Write N multiple-choice questions at undergraduate level. Distribute
  across the material's major topics; label each with its topic. Distractors
  must be plausible (common misconceptions). hint = nudge without revealing;
  explanation = why the answer is right and distractors wrong. 1-2 questions
  per topic."
- Retry-once-on-schema-fail; store as JSONB.
### Storage + endpoints
- Standalone: `quizzes` table or `documents.quiz jsonb` (start with column).
- `GET /api/documents/:id/quiz`, `POST /api/documents/:id/quiz/regenerate {count}`.
### UI
- One-question-at-a-time card: topic chip, question, 4 options, Show Hint,
  instant check (correct=green + explanation; wrong=red + explanation), Next.
  Progress "3 / 25" in header. Score summary at end with per-topic breakdown.

## Acceptance criteria
- 25-question quiz where every question has topic+hint+explanation, all valid JSON.
- Same generator embedded in lesson quiz sections (PRD 3) with count 3-5.
- Score summary groups mistakes by topic.

**Effort:** 3-4 days incl. UI. **Skipped:** timed mode, spaced repetition of
missed questions — add when users ask.

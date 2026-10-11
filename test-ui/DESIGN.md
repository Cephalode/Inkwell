# Inkwell — Enterprise UI Analysis & Design

## What the application is

Inkwell is a study platform (React/Vite frontend + Node/SQL backend) with courses,
documents, textbooks, flashcards, practice tests, and study guides — a
student-facing learning workspace.

## What kind of web UI makes sense

The learner UI already exists in `src/pages`. What a study platform lacks to be
"enterprise" is the other side of the desk: an **instructor/program admin console**
for whoever runs the courses:

1. **Overview** — enrolled learners, weekly active study time, average practice-test
   scores, flashcard retention rate, at-risk learner count.
2. **Courses** — each course with enrollment, content inventory (documents,
   flashcard decks, tests, guides), completion %, and a health signal (stale
   content, low scores).
3. **Learners** — roster with per-learner progress, streaks, last activity, and
   mastery; drawer shows their per-course breakdown and intervention actions
   (nudge, assign review deck).
4. **Content** — cross-course inventory of generated artifacts (flashcards decks,
   practice tests, study guides) with usage stats and regenerate/retire controls —
   this maps directly onto inkwell's existing entities.
5. **Item analysis** — practice-test questions ranked by miss rate — the classic
   assessment-quality view instructors need.

## Design decisions

- Built from the corrected ui-template; scholarly blue accent.
- Mastery/retention visualized as compact progress bars in tables (scan-friendly),
  score distributions as SVG bar charts.
- Entities reuse inkwell's own nouns (course, document, deck, practice test, study
  guide) so the console could sit on the existing server/schema with new queries
  only.

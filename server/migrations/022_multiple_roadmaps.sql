-- Multiple roadmaps per course: one active, the rest archived (kept with
-- their steps + activities). `is_active` flips on switch; the partial unique
-- index guarantees exactly one active roadmap per course.
ALTER TABLE roadmaps DROP CONSTRAINT IF EXISTS roadmaps_course_id_key;
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS roadmaps_one_active_per_course ON roadmaps(course_id) WHERE is_active;

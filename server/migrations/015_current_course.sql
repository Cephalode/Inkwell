-- 015_current_course.sql
-- The course the learning roadmap currently guides the learner through.
-- At most one per user; switching unsets the previous one.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false;

-- Enforce "one current course per user" in the DB, not app code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_one_current ON courses(user_id) WHERE is_current;

-- 011_learning_roadmaps.sql
-- Learning suite: course roadmaps built from every material in a course, a
-- cross-course skill registry that carries mastery between courses, per-step
-- learning activities (lesson / quiz / flashcards / tutor discussion /
-- teach-back), the evidence trail that drives mastery, and a single-row
-- learner profile for XP + streaks.

-- Skills: one row per distinct topic across ALL courses. `slug` is the
-- normalised label so the same concept taught in two courses shares one row
-- (and therefore one mastery state).
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mastery TEXT NOT NULL DEFAULT 'not_started',   -- not_started | learning | learned
  mastery_score REAL NOT NULL DEFAULT 0,          -- 0..1 rolling confidence
  learned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_mastery ON skills(mastery);

-- Roadmaps: one per course, regenerable.
CREATE TABLE IF NOT EXISTS roadmaps (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  course_id TEXT NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | generating | done | error
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roadmaps_status ON roadmaps(status);

-- Roadmap steps: the ordered topics of a course. Each points at a shared skill.
CREATE TABLE IF NOT EXISTS roadmap_steps (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  objectives JSONB NOT NULL DEFAULT '[]'::jsonb,      -- string[]
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,      -- string[]
  depends_on JSONB NOT NULL DEFAULT '[]'::jsonb,      -- step ids in the same roadmap
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{documentId, chapterId?, title}]
  estimated_minutes INT NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (roadmap_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_roadmap_steps_roadmap ON roadmap_steps(roadmap_id, position);
CREATE INDEX IF NOT EXISTS idx_roadmap_steps_skill ON roadmap_steps(skill_id);

-- Learning activities: one instance of a learning strategy on a step.
CREATE TABLE IF NOT EXISTS learning_activities (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  step_id TEXT NOT NULL REFERENCES roadmap_steps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                              -- lesson | quiz | flashcards | discussion | recall
  status TEXT NOT NULL DEFAULT 'ready',            -- ready | in_progress | completed | error
  content JSONB,                                   -- kind-specific payload
  result JSONB,                                    -- {score, passed, summary, ...}
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_activities_step ON learning_activities(step_id, created_at DESC);

-- Skill evidence: every mastery signal, in order. Mastery is recomputed from
-- this trail so it can be audited and re-derived.
CREATE TABLE IF NOT EXISTS skill_evidence (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  activity_id TEXT REFERENCES learning_activities(id) ON DELETE SET NULL,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                               -- lesson | quiz | flashcards | discussion | recall | manual
  score REAL NOT NULL,                              -- 0..1
  weight REAL NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skill_evidence_skill ON skill_evidence(skill_id, created_at);

-- Learner profile: single row (Inkwell is single-user). XP + streak.
CREATE TABLE IF NOT EXISTS learner_profile (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  xp INT NOT NULL DEFAULT 0,
  streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_active_on DATE,
  daily_goal_xp INT NOT NULL DEFAULT 50,
  xp_today INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO learner_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

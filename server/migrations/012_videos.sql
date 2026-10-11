-- 012_videos.sql
-- Topic videos: YouTube videos found for roadmap skills, the transcript-backed
-- judgement of which skills (milestones) each video teaches, and per-skill
-- search bookkeeping. Rankings are computed on read from `video_coverage`
-- (see server/src/videoSearch.ts) so the "shortest path" ordering always
-- reflects the learner's current mastery.

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,                             -- YouTube video id
  title TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  duration_seconds INT NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending', -- pending | ok | missing | error
  summary TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',                  -- intro | intermediate | advanced
  focus REAL NOT NULL DEFAULT 0,                   -- 0..1 share of the video that is on-topic
  quality REAL NOT NULL DEFAULT 0,                 -- 0..1 judged teaching quality
  judged_at TIMESTAMPTZ,
  watched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (video, skill) the judge looked at — including low coverage, so
-- a pair is never re-judged. Rankings ignore rows under the coverage floor.
CREATE TABLE IF NOT EXISTS video_coverage (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  coverage REAL NOT NULL,                          -- 0..1 fraction of the skill's objectives taught
  confidence REAL NOT NULL DEFAULT 0.5,            -- 0..1 judge confidence
  objectives_covered JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_seconds INT,
  end_seconds INT,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_video_coverage_skill ON video_coverage(skill_id);

ALTER TABLE skills ADD COLUMN IF NOT EXISTS video_search_status TEXT NOT NULL DEFAULT 'none'; -- none | searching | done | error
ALTER TABLE skills ADD COLUMN IF NOT EXISTS video_searched_at TIMESTAMPTZ;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS video_search_error TEXT;

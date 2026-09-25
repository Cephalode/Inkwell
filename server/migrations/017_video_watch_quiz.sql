-- Post-watch comprehension check: two questions per video, generated from the
-- transcript/summary + judged milestones, cached on the video. The watch is
-- only recorded after the learner answers both correctly.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS watch_quiz JSONB;

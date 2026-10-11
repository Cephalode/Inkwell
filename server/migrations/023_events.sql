-- Agent observation pipeline: raw interaction event log. JSONB detail keeps it
-- schema-less so new signals (crashes, habits, timings, anything) need no
-- migration — new event types just appear.
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT NOT NULL,
  session_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts DESC);
CREATE INDEX IF NOT EXISTS events_user_ts_idx ON events (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (type);

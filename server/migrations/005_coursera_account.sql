-- Single-row table holding the linked Coursera account's CAUTH session cookie.
-- ponytail: no user column — Inkwell is single-user; add one if multi-user ever lands.
CREATE TABLE IF NOT EXISTS coursera_account (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cauth TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

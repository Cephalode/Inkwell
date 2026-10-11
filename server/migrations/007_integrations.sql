CREATE TABLE IF NOT EXISTS integrations (
  provider TEXT PRIMARY KEY,
  credentials JSONB NOT NULL,
  account_info JSONB,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

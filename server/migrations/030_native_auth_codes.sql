-- One-time authorization codes for the native (iOS) sign-in code+PKCE flow
-- (PRD-15 SEC-1). The inkwell:// callback hands the app a short-lived code;
-- the app exchanges it (+ PKCE verifier) for a session token. Codes are
-- single-use, 5-minute TTL, stored hashed like session tokens.
CREATE TABLE IF NOT EXISTS native_auth_codes (
  code_hash      TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS native_auth_codes_expiry ON native_auth_codes (expires_at);

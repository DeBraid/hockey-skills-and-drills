-- Per-email and per-IP counters for sign-in mail, plus plan-write limits.
-- Safe to run more than once. Keys are hashes, not email addresses.

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_reset_at ON rate_limits (reset_at);

-- Private league stats snapshots (admin-only, never exposed publicly).
-- Schema only; data is loaded out-of-band and served only behind ADMIN_EMAILS.

CREATE TABLE IF NOT EXISTS league_stats (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_-]{1,64}$'),
  payload JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  pulled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

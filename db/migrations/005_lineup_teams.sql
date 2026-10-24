-- Teams for private lineups. Each player and lineup belongs to one team.
-- Safe to run more than once, and backward compatible: existing rows (and any
-- rows written by older code) default to the "stars" team.
-- Team names and schedule links only; rosters stay in the database, never in this repo.

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,32}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  schedule_url TEXT CHECK (schedule_url IS NULL OR schedule_url ~ '^https://'),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO teams (id, name, schedule_url, sort) VALUES
  ('stars', 'U11 Stars', 'https://westniagaraminorhockey.ca/webcal.ashx?IDs=2945', 1),
  ('select', 'U11 Select', NULL, 2)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE players ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT 'stars' REFERENCES teams (id);
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT 'stars' REFERENCES teams (id);

CREATE INDEX IF NOT EXISTS players_team_active ON players (team_id, active, number);
CREATE INDEX IF NOT EXISTS lineups_team_updated ON lineups (team_id, updated_at DESC);

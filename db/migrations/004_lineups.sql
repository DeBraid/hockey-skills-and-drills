-- Private team lineups for the site admin (ADMIN_EMAILS only).
-- Safe to run more than once. The roster lives only in the database, never in this repo.
-- Players are stored as number + first name + last initial. Full last names are never stored.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL CHECK (number BETWEEN 0 AND 99),
  first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 24),
  last_initial TEXT NOT NULL DEFAULT '' CHECK (last_initial ~ '^[A-Za-z]{0,3}$'),
  goalie BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_active_number ON players (active, number);

-- slots: {"LW": [player ids], "C": [...], "RW": [...], "LD": [...], "RD": [...], "OUT": [...]}
-- share_token: optional read-only link token (NULL = no link). Regenerating replaces it.
CREATE TABLE IF NOT EXISTS lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 80),
  slots JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(slots) <= 8192),
  share_token TEXT UNIQUE CHECK (share_token IS NULL OR share_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lineups_updated ON lineups (updated_at DESC);

CREATE OR REPLACE FUNCTION lineups_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lineups_updated_at ON lineups;
CREATE TRIGGER lineups_updated_at
  BEFORE UPDATE ON lineups
  FOR EACH ROW
  EXECUTE FUNCTION lineups_set_updated_at();

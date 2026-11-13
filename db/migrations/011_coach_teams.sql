-- Coach-owned teams, assistant invites, and team practice plans.
-- Safe to run more than once. Apply after 001 through 010, then deploy.
-- Matches existing rows by id only. No names, emails, or rosters are written here.
--
-- Existing teams with no coaches yet are given to the account that already
-- signed in as the site admin (an events row flagged admin). If that sign-in
-- is not on record yet, and exactly one account has saved plans, that account
-- is used instead. Otherwise the teams stay unowned until an admin opens
-- lineups, which claims any team that still has no coaches.

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_user ON team_members (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_owner
  ON team_members (team_id) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  single_use BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users (id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_invites_has_limit CHECK (single_use OR expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS team_invites_team ON team_invites (team_id, created_at DESC);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS age_group TEXT NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS season TEXT NOT NULL DEFAULT '';

ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_age_group_len;
ALTER TABLE teams ADD CONSTRAINT teams_age_group_len CHECK (length(age_group) <= 40);
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_season_len;
ALTER TABLE teams ADD CONSTRAINT teams_season_len CHECK (length(season) <= 20);

-- Last initial is one or two letters. Trim anything already stored that is longer.
UPDATE players
SET last_initial = left(regexp_replace(last_initial, '[^A-Za-z]', '', 'g'), 2)
WHERE last_initial !~ '^[A-Za-z]{0,2}$';

DO $drop_initial$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'players'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%last_initial%'
  LOOP
    EXECUTE format('ALTER TABLE players DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$drop_initial$;

ALTER TABLE players ADD CONSTRAINT players_last_initial_check
  CHECK (last_initial ~ '^[A-Za-z]{0,2}$');

ALTER TABLE players ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_position_check;
ALTER TABLE players ADD CONSTRAINT players_position_check
  CHECK (position IS NULL OR position ~ '^(F|D|G)$');

UPDATE players SET position = 'G' WHERE goalie AND position IS NULL;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams (id) ON DELETE SET NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS practice_date DATE;

-- Deleting a team removes its roster and lineups. Plans stay, with the team cleared.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_team_id_fkey;
ALTER TABLE players
  ADD CONSTRAINT players_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;

ALTER TABLE lineups DROP CONSTRAINT IF EXISTS lineups_team_id_fkey;
ALTER TABLE lineups
  ADD CONSTRAINT lineups_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS plans_team_date
  ON plans (team_id, practice_date DESC NULLS LAST, updated_at DESC)
  WHERE team_id IS NOT NULL;

-- Existing teams (no coach rows yet) belong to the admin account, matched by id.
WITH ranked AS (
  SELECT e.user_id, min(e.created_at) AS first_seen
  FROM events e
  JOIN users u ON u.id = e.user_id
  WHERE e.name = 'sign_in'
    AND e.props @> '{"admin": true}'::jsonb
  GROUP BY e.user_id
),
picked AS (
  SELECT user_id FROM ranked ORDER BY first_seen, user_id LIMIT 1
)
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, picked.user_id, 'owner'
FROM teams t
CROSS JOIN picked
WHERE NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id)
ON CONFLICT DO NOTHING;

-- If no admin sign-in is stored yet, and only one account has plans, use that id.
WITH owners AS (
  SELECT user_id FROM plans GROUP BY user_id
),
only_one AS (
  SELECT user_id FROM owners WHERE (SELECT count(*) FROM owners) = 1
)
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, only_one.user_id, 'owner'
FROM teams t
CROSS JOIN only_one
WHERE NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id)
ON CONFLICT DO NOTHING;

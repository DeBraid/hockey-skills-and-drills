-- 007: post-game coach's notes and three stars per lineup. Admin-only; never on share links.
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS stars jsonb NOT NULL DEFAULT '[]'::jsonb;

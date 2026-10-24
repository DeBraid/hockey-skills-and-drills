-- 006: optional preferred positions per player (e.g. "C/W"), admin-only like the rest of the roster.
ALTER TABLE players ADD COLUMN IF NOT EXISTS preferred_positions text;

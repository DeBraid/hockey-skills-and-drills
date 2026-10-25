-- 009: optional practice-jersey number per player (the main `number` is the game jersey).
-- Admin-only like the rest of the roster; lineups and share links keep using `number`.
ALTER TABLE players ADD COLUMN IF NOT EXISTS practice_number integer;

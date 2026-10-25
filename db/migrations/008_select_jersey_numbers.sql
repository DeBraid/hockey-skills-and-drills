-- 008: 2026-27 jersey numbers for the U11 Select roster.
-- Safe to run more than once. Updates active players on team "select" only.
-- Matches the first name and last initial already stored on the roster.
-- Does not add players, and does not change any other team.

DO $migration$
DECLARE
  chg record;
BEGIN
  CREATE TEMP TABLE _official (
    norm_first text NOT NULL,
    initial text NOT NULL,
    number integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _official (norm_first, initial, number) VALUES
    ('philip', 'F', 1),
    ('phil', 'F', 1),
    ('marek', 'T', 2),
    ('william', 'S', 3),
    ('will', 'S', 3),
    ('jacob', 'P', 4),
    ('jake', 'P', 4),
    ('eli', 'D', 5),
    ('kingston', 'H', 10),
    ('aj', '', 12),
    ('andrew', 'D', 12),
    ('andy', 'D', 12),
    ('markus', 'M', 13),
    ('xavier', 'G', 14),
    ('george', 'G', 16),
    ('callum', 'V', 17),
    ('emmett', 'H', 29),
    ('emmet', 'H', 29),
    ('callan', 'B', 66),
    ('callen', 'B', 66),
    ('jaxon', 'L', 81),
    ('jaxson', 'L', 81),
    ('jax', 'L', 81),
    ('william', 'B', 93),
    ('will', 'B', 93),
    ('mason', 'C', 97),
    ('bennett', 'J', 98),
    ('ben', 'J', 98);

  CREATE TEMP TABLE _roster ON COMMIT DROP AS
  SELECT
    id,
    number AS old_number,
    first_name,
    upper(coalesce(left(regexp_replace(last_initial, '[^[:alpha:]]', '', 'g'), 1), '')) AS initial,
    lower(regexp_replace(first_name, '[^[:alpha:]]', '', 'g')) AS norm_first
  FROM players
  WHERE team_id = 'select' AND active;

  CREATE TEMP TABLE _hits ON COMMIT DROP AS
  SELECT r.id, r.old_number, r.first_name, r.initial, o.number AS new_number
  FROM _roster r
  JOIN _official o
    ON r.norm_first = o.norm_first
   AND (o.initial = '' OR r.initial = o.initial);

  CREATE TEMP TABLE _unique ON COMMIT DROP AS
  SELECT h.id, h.old_number, h.first_name, h.initial, h.new_number
  FROM _hits h
  WHERE (SELECT count(DISTINCT h2.new_number) FROM _hits h2 WHERE h2.id = h.id) = 1
    AND (SELECT count(DISTINCT h3.id) FROM _hits h3 WHERE h3.new_number = h.new_number) = 1;

  FOR chg IN
    SELECT id, old_number, first_name, initial, new_number
    FROM _unique
    WHERE old_number IS DISTINCT FROM new_number
    ORDER BY new_number, id
  LOOP
    UPDATE players
    SET number = chg.new_number
    WHERE id = chg.id AND team_id = 'select' AND active;
    RAISE NOTICE 'select roster % %: % -> %', chg.first_name, chg.initial, chg.old_number, chg.new_number;
  END LOOP;

  FOR chg IN
    SELECT first_name, initial, old_number
    FROM _roster
    WHERE id NOT IN (SELECT id FROM _unique)
    ORDER BY old_number, first_name
  LOOP
    RAISE NOTICE 'left unchanged % % number %', chg.first_name, chg.initial, chg.old_number;
  END LOOP;

  FOR chg IN
    SELECT DISTINCT number
    FROM _official o
    WHERE NOT EXISTS (SELECT 1 FROM _unique u WHERE u.new_number = o.number)
    ORDER BY number
  LOOP
    RAISE NOTICE 'no roster match for number %', chg.number;
  END LOOP;
END
$migration$;

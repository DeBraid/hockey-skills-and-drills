-- U11 Select public calendar for lineup name prefill.
-- Current season (2026-27) team page: https://westniagaraminorhockey.ca/Teams/2897/
-- Same feed shape as U11 Stars (webcal.ashx?IDs=<team id>). The 2025-26 team
-- (IDs=2567) is not the current season.
-- Fills only a missing link. A non-null schedule_url is left as-is.

UPDATE teams
SET schedule_url = 'https://westniagaraminorhockey.ca/webcal.ashx?IDs=2897'
WHERE id = 'select'
  AND schedule_url IS NULL;

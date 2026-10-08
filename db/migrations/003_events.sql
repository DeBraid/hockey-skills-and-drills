-- Product usage log for the private admin dashboard.
-- Safe to run more than once. No emails, IP addresses, or user agents are stored.
-- anon_id is a random ID kept in the visitor's browser (localStorage).
-- user_id is set only when the visitor is signed in, and is cleared if the account is deleted.

CREATE TABLE IF NOT EXISTS events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  anon_id TEXT CHECK (anon_id IS NULL OR anon_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  name TEXT NOT NULL CHECK (name ~ '^[a-z_]{1,40}$'),
  drill_slug TEXT CHECK (drill_slug IS NULL OR (length(drill_slug) <= 80 AND drill_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  plan_id UUID,
  props JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(props) <= 1024)
);

CREATE INDEX IF NOT EXISTS events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS events_name_created_at ON events (name, created_at);
CREATE INDEX IF NOT EXISTS events_user_created_at ON events (user_id, created_at) WHERE user_id IS NOT NULL;

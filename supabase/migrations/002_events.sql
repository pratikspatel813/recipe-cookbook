-- =============================================================================
-- 002 — Event logging
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- The other tables store the CURRENT STATE of the app ("this recipe exists").
-- This table stores WHAT HAPPENED, and when ("this user tried to import a
-- recipe from allrecipes.com at 6:02pm and it failed"). Funnels, retention,
-- and failure analysis can only come from here.
--
-- Rules for this table:
--   • Append-only. We never UPDATE or DELETE events — history is history.
--   • One row per thing that happened. Details go in `properties`.
-- =============================================================================

create table public.events (
  -- bigint identity: a simple counter (1, 2, 3…). Cheaper than a uuid for a
  -- table that will have far more rows than any other.
  id          bigint generated always as identity primary key,

  -- Who did it. With Supabase anonymous users, everyone has a user id from
  -- their very first visit, and it stays the same when they sign up later.
  -- That solves "identity stitching" for us: pre-signup and post-signup
  -- events already share one id.
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- One visit. A new session starts after 30 minutes of inactivity (the same
  -- rule Google Analytics uses). Lets us ask "what happened in one sitting?"
  session_id  uuid not null,

  -- What happened, in object_verb form: recipe_saved, import_failed...
  -- The check stops typos like "Recipe Saved" from splitting one event into two.
  event_name  text not null check (event_name ~ '^[a-z]+(_[a-z]+)*$'),

  -- Event-specific details, e.g. {"domain": "nytimes.com", "ms_elapsed": 340}
  -- jsonb lets each event carry different fields without a column for each.
  properties  jsonb not null default '{}'::jsonb,

  page_path   text,

  -- Timestamped by the database, not the browser. Phones and laptops can have
  -- the wrong clock; the server's clock is the one source of truth.
  created_at  timestamptz not null default now()
);

-- Most analysis filters by event name and time range, or follows one user over time.
create index events_name_time_idx on public.events (event_name, created_at);
create index events_user_time_idx on public.events (user_id, created_at);

alter table public.events enable row level security;

-- The app can add events for the current user only…
create policy "insert own events" on public.events
  for insert with check (user_id = auth.uid());

-- …and read back its own (handy for debugging). There's no update or delete
-- policy, so with RLS on, nobody can edit history from the app.
-- Analysis across ALL users happens in the SQL Editor, which bypasses RLS.
create policy "read own events" on public.events
  for select using (user_id = auth.uid());

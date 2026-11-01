-- =============================================================================
-- 004 — Accounts
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Everyone starts as an anonymous user. When you first tap Share, you turn
-- that SAME user into a real account by adding your name and email. Same user
-- id, so every recipe, chapter and past event stays yours.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- profiles: public-facing info about a user. Just a display name for now, so a
-- share link can say "Pratik shared a recipe with you".
--
-- Why not store the name in auth.users? That table belongs to Supabase's
-- login system and holds private data (emails). Things other people may see
-- go in a separate table we control.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 40),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using (id = auth.uid());
create policy "create own profile" on public.profiles
  for insert with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());


-- -----------------------------------------------------------------------------
-- Sharing now requires an account — enforced by the DATABASE, not just the UI.
--
-- Hiding the Share button from anonymous users isn't enough: anyone could call
-- the API directly. Supabase puts `is_anonymous` inside every login token
-- (auth.jwt()), so the policy can check it. Rules that matter belong in the
-- database, where they can't be skipped.
--
-- Links that already exist keep working; this only affects creating new ones.
-- -----------------------------------------------------------------------------
drop policy "share own recipes" on public.shares;

create policy "share own recipes (accounts only)" on public.shares
  for insert with check (
    sharer_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
  );


-- -----------------------------------------------------------------------------
-- get_shared_recipe(): same as before, plus the sharer's display name.
-- -----------------------------------------------------------------------------
create or replace function public.get_shared_recipe(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shareId',    s.id,
    'sharerId',   s.sharer_id,
    'sharerName', p.display_name,
    'recipe', jsonb_build_object(
      'id',               r.id,
      'title',            r.title,
      'description',      r.description,
      'imageUrl',         r.image_url,
      'sourceUrl',        r.source_url,
      'author',           r.author,
      'servings',         r.servings,
      'totalTimeMinutes', r.total_time_minutes,
      'ingredients', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'position', i.position, 'quantity', i.quantity, 'unit', i.unit,
                 'name', i.name, 'rawText', i.raw_text) order by i.position)
        from ingredients i where i.recipe_id = r.id), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('position', st.position, 'text', st.text) order by st.position)
        from steps st where st.recipe_id = r.id), '[]'::jsonb)
    )
  )
  from shares s
  join recipes r on r.id = s.recipe_id
  left join profiles p on p.id = s.sharer_id   -- left join: older links may have no profile
  where s.token = share_token;
$$;

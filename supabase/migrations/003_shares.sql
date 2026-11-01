-- =============================================================================
-- 003 — Share links
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- How sharing works:
--   1. You tap Share → we create a `shares` row with a random token.
--   2. Your friend opens  /s/<token>  — no account needed.
--   3. If they tap "Save to my cookbook", they get their OWN copy of the
--      recipe, remembering which share it came from (saved_from_share_id).
--
-- Step 3 is what lets us measure virality: every saved copy points back to
-- the share that produced it.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- shares: one link per recipe per sharer. Tapping Share again reuses it.
-- -----------------------------------------------------------------------------
create table public.shares (
  id          uuid primary key default gen_random_uuid(),
  -- The secret part of the URL. 16 random hex characters (~60 bits of
  -- randomness): impossible to guess, so only people you send it to can open it.
  token       text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  sharer_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (recipe_id, sharer_id)
);

alter table public.shares enable row level security;

-- You can create links only for your own recipes, and see only your own links.
create policy "share own recipes" on public.shares
  for insert with check (
    sharer_id = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
  );

create policy "see own shares" on public.shares
  for select using (sharer_id = auth.uid());


-- -----------------------------------------------------------------------------
-- Recipes saved from a share remember where they came from.
-- `on delete set null`: if the share disappears, the friend keeps the recipe.
-- -----------------------------------------------------------------------------
alter table public.recipes
  add column saved_from_share_id uuid references public.shares (id) on delete set null;

-- Allow the new import method 'shared'.
alter table public.recipes drop constraint recipes_import_method_check;
alter table public.recipes add constraint recipes_import_method_check
  check (import_method in ('url', 'paste', 'manual', 'shared'));

create index recipes_saved_from_share_idx on public.recipes (saved_from_share_id)
  where saved_from_share_id is not null;


-- -----------------------------------------------------------------------------
-- get_shared_recipe(token): the ONLY way to read someone else's recipe.
--
-- Row Level Security still hides every recipe from non-owners. This function
-- is `security definer` — it runs with the database owner's permissions — so
-- it can look past RLS, but it only ever returns the one recipe that matches
-- a valid token. The token works like a key to exactly one door.
--
-- Returns null if the token doesn't exist (or the recipe was deleted).
-- -----------------------------------------------------------------------------
create or replace function public.get_shared_recipe(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shareId',   s.id,
    'sharerId',  s.sharer_id,
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
  where s.token = share_token;
$$;

-- `anon` = visitors with no session at all (e.g. the server rendering the
-- page, or iMessage fetching a link preview). `authenticated` = everyone else,
-- including anonymous users.
grant execute on function public.get_shared_recipe(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- save_recipe(): same as before, plus it records saved_from_share_id.
-- -----------------------------------------------------------------------------
create or replace function public.save_recipe(recipe jsonb, collection_ids uuid[] default '{}')
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into recipes (title, description, image_url, source_url, author, servings, total_time_minutes,
                       import_method, saved_from_share_id)
  values (
    recipe->>'title',
    recipe->>'description',
    recipe->>'imageUrl',
    recipe->>'sourceUrl',
    recipe->>'author',
    recipe->>'servings',
    (recipe->>'totalTimeMinutes')::integer,
    coalesce(recipe->>'importMethod', 'url'),
    (recipe->>'savedFromShareId')::uuid
  )
  returning id into new_id;

  insert into ingredients (recipe_id, position, quantity, unit, name, raw_text)
  select new_id, (i->>'position')::integer, (i->>'quantity')::numeric, i->>'unit', i->>'name', i->>'rawText'
  from jsonb_array_elements(recipe->'ingredients') as i;

  insert into steps (recipe_id, position, text)
  select new_id, (s->>'position')::integer, s->>'text'
  from jsonb_array_elements(recipe->'steps') as s;

  insert into collection_recipes (collection_id, recipe_id)
  select unnest(collection_ids), new_id;

  return new_id;
end;
$$;

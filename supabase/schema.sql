-- =============================================================================
-- My Cookbook — database schema
--
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Users live in Supabase's built-in `auth.users` table. It already has an
-- `is_anonymous` column, so we don't need our own users table yet.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- recipes: one row per recipe in someone's cookbook
-- -----------------------------------------------------------------------------
create table public.recipes (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title               text not null,
  description         text,
  image_url           text,
  source_url          text,
  author              text,
  servings            text,
  total_time_minutes  integer,
  -- How the recipe got here. A fixed list so we can GROUP BY it later.
  import_method       text not null check (import_method in ('url', 'paste', 'manual')),
  created_at          timestamptz not null default now()
);

-- Speeds up "show me my recipes, newest first" — the query the cookbook page runs.
create index recipes_owner_created_idx on public.recipes (owner_id, created_at desc);


-- -----------------------------------------------------------------------------
-- ingredients and steps: one row per line, linked to a recipe.
--
-- Why separate tables instead of one big text column on recipes?
--   • We can query across recipes: "which recipes use garlic?"
--   • The AI dietary-swap feature can change one ingredient row at a time.
--   • It's "normalized" — a core database design idea worth knowing for interviews.
--
-- `on delete cascade` = delete a recipe and its ingredients/steps go with it.
-- -----------------------------------------------------------------------------
create table public.ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  position   integer not null,
  quantity   numeric,
  unit       text,
  name       text not null,
  raw_text   text not null,
  unique (recipe_id, position)
);

create table public.steps (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  position   integer not null,
  text       text not null,
  unique (recipe_id, position)
);


-- -----------------------------------------------------------------------------
-- collections: the cookbook's "chapters" (Weeknight, Baking, ...)
--
-- A recipe can be in many collections, and a collection holds many recipes.
-- That's a many-to-many relationship, which always needs a "join table"
-- in the middle: collection_recipes.
-- -----------------------------------------------------------------------------
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.collection_recipes (
  collection_id  uuid not null references public.collections (id) on delete cascade,
  recipe_id      uuid not null references public.recipes (id) on delete cascade,
  added_at       timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);


-- -----------------------------------------------------------------------------
-- Row Level Security (RLS)
--
-- Our app talks to the database straight from the browser. Without RLS,
-- anyone could read everyone's recipes. With RLS, Postgres itself checks
-- every row: you only see rows where owner_id = your user id.
-- (When we build sharing in step 4, we'll add a policy for shared recipes.)
-- -----------------------------------------------------------------------------
alter table public.recipes            enable row level security;
alter table public.ingredients        enable row level security;
alter table public.steps              enable row level security;
alter table public.collections        enable row level security;
alter table public.collection_recipes enable row level security;

create policy "own recipes" on public.recipes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own collections" on public.collections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables don't have owner_id, so they check the parent recipe/collection.
create policy "ingredients of own recipes" on public.ingredients
  for all using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check   (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

create policy "steps of own recipes" on public.steps
  for all using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check   (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

create policy "own collection links" on public.collection_recipes
  for all using (
    exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
  );


-- -----------------------------------------------------------------------------
-- save_recipe(): save a recipe + its ingredients + steps + collections at once.
--
-- Doing this as 4 separate requests from the browser risks a half-saved recipe
-- (say, the wifi drops after the recipe row but before the ingredients).
-- A function runs as one TRANSACTION: either everything saves, or nothing does.
--
-- `security invoker` = the function runs as the logged-in user, so the RLS
-- policies above still apply.
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
  insert into recipes (title, description, image_url, source_url, author, servings, total_time_minutes, import_method)
  values (
    recipe->>'title',
    recipe->>'description',
    recipe->>'imageUrl',
    recipe->>'sourceUrl',
    recipe->>'author',
    recipe->>'servings',
    (recipe->>'totalTimeMinutes')::integer,
    coalesce(recipe->>'importMethod', 'url')
  )
  returning id into new_id;

  -- jsonb_array_elements turns a JSON list into rows we can insert in one go.
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

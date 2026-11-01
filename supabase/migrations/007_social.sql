-- =============================================================================
-- 007 — Going social: public recipes, profiles, follows, feed and search
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Until now every recipe was private to its owner (plus share links). Now:
--   • Recipes you WRITE YOURSELF (or create with AI) can be made public.
--     Imported recipes can never be public: republishing other sites'
--     recipes and photos would be a copyright problem. The database enforces it.
--   • Public recipes show on your profile, in followers' feeds, and in search.
--   • You can follow people. Follower lists and counts are public, like Instagram.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Public recipes
-- -----------------------------------------------------------------------------
alter table public.recipes add column is_public boolean not null default false;

-- 'ai' = created on the AI page.
alter table public.recipes drop constraint recipes_import_method_check;
alter table public.recipes add constraint recipes_import_method_check
  check (import_method in ('url', 'paste', 'manual', 'shared', 'ai'));

-- Only your own recipes can be public. A CHECK constraint can't be bypassed
-- by any app code or API call — it's a rule about the data itself.
alter table public.recipes add constraint recipes_public_only_own
  check (not is_public or import_method in ('manual', 'ai'));

-- Feed and search read "newest public recipes" constantly. A partial index
-- (`where is_public`) only contains public rows, so it stays small and fast.
create index recipes_public_created_idx on public.recipes (created_at desc) where is_public;

-- Anyone can read public recipes, and their ingredients and steps.
-- These policies are ADDED to the owner-only ones: Postgres allows a row if
-- ANY permissive policy allows it.
create policy "read public recipes" on public.recipes
  for select using (is_public);
create policy "read ingredients of public recipes" on public.ingredients
  for select using (exists (select 1 from public.recipes r where r.id = recipe_id and r.is_public));
create policy "read steps of public recipes" on public.steps
  for select using (exists (select 1 from public.recipes r where r.id = recipe_id and r.is_public));

-- A RESTRICTIVE policy must pass IN ADDITION to the others: you need an
-- account to publish. (Anonymous users have no name to show on a post.)
create policy "only accounts can publish" on public.recipes
  as restrictive for all
  using (true)
  with check (not is_public or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);


-- -----------------------------------------------------------------------------
-- Profiles become public (they only hold a display name).
-- -----------------------------------------------------------------------------
create policy "profiles are public" on public.profiles
  for select using (true);


-- -----------------------------------------------------------------------------
-- follows: who follows whom. One row per follow; unfollowing deletes it.
-- following_id points at profiles, so you can only follow real accounts.
-- -----------------------------------------------------------------------------
create table public.follows (
  follower_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  following_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)  -- no following yourself
);

-- The primary key already makes "who do I follow?" fast. This index makes the
-- opposite question fast: "who follows this person?"
create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

create policy "follows are public" on public.follows
  for select using (true);
create policy "follow as yourself, with an account" on public.follows
  for insert with check (
    follower_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
create policy "unfollow as yourself" on public.follows
  for delete using (follower_id = auth.uid());


-- -----------------------------------------------------------------------------
-- list_public_recipes(): ONE function behind the feed, search, discovery, and
-- profile grids. Each just sets different filters:
--   feed:     only_following => true
--   profile:  owner => '<user id>'
--   search:   search => 'dal'
--   discover: (no filters) newest public recipes from anyone
--
-- Search matches the title/description with Postgres full-text search
-- (understands word forms: "bake" finds "baked"), plus a plain substring match
-- on the title and ingredient names for partial words ("chick" finds "chickpeas").
--
-- `security invoker`: it runs as the caller, so RLS still applies.
-- -----------------------------------------------------------------------------
create or replace function public.list_public_recipes(
  only_following boolean default false,
  owner uuid default null,
  search text default null,
  lim integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc), '[]'::jsonb)
  from (
    select
      r.id,
      r.title,
      r.description,
      r.image_url          as "imageUrl",
      r.total_time_minutes as "totalTimeMinutes",
      r.created_at         as "createdAt",
      r.owner_id           as "ownerId",
      p.display_name       as "ownerName"
    from recipes r
    join profiles p on p.id = r.owner_id
    where r.is_public
      and (owner is null or r.owner_id = owner)
      and (not only_following or exists (
            select 1 from follows f where f.follower_id = auth.uid() and f.following_id = r.owner_id))
      and (coalesce(trim(search), '') = ''
           or to_tsvector('english', r.title || ' ' || coalesce(r.description, ''))
              @@ websearch_to_tsquery('english', search)
           or r.title ilike '%' || trim(search) || '%'
           or exists (select 1 from ingredients i
                      where i.recipe_id = r.id and i.name ilike '%' || trim(search) || '%'))
    order by r.created_at desc
    limit least(lim, 100)
  ) x;
$$;


-- -----------------------------------------------------------------------------
-- get_profile(): everything the top of a profile page needs, in one call.
-- -----------------------------------------------------------------------------
create or replace function public.get_profile(profile_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id',             p.id,
    'displayName',    p.display_name,
    'joinedAt',       p.created_at,
    'postCount',      (select count(*) from recipes r where r.owner_id = p.id and r.is_public),
    'followerCount',  (select count(*) from follows f where f.following_id = p.id),
    'followingCount', (select count(*) from follows f where f.follower_id = p.id),
    'isFollowing',    exists (select 1 from follows f where f.follower_id = auth.uid() and f.following_id = p.id)
  )
  from profiles p
  where p.id = profile_id;
$$;

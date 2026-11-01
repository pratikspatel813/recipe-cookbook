-- =============================================================================
-- Merge one user's data into another.
--
-- When you need it: someone's browser lost its anonymous login (cleared
-- storage, new device, private window), so their recipes are stuck on an old
-- user id they can no longer sign in as.
--
-- This is an "identity merge" — a real task on analytics and growth teams.
-- It moves recipes, chapters, share links, the profile and the event history,
-- so past metrics are attributed to the person, not to a lost browser.
--
-- Run in Supabase: SQL Editor → paste → set the two ids below → Run.
-- It runs as one transaction: if anything fails, nothing changes.
-- =============================================================================

do $$
declare
  old_id uuid := '00000000-0000-0000-0000-000000000000';  -- the user whose data is stuck
  new_id uuid := '00000000-0000-0000-0000-000000000000';  -- the user who should get it
begin
  if not exists (select 1 from auth.users where id = old_id) then raise exception 'old user not found'; end if;
  if not exists (select 1 from auth.users where id = new_id) then raise exception 'new user not found'; end if;

  -- If both users have a chapter with the same name, merge them: move the old
  -- chapter's recipes into the new one first, then drop the old chapter.
  insert into collection_recipes (collection_id, recipe_id, added_at)
  select n.id, cr.recipe_id, cr.added_at
  from collections o
  join collections n on n.owner_id = new_id and n.name = o.name
  join collection_recipes cr on cr.collection_id = o.id
  where o.owner_id = old_id
  on conflict do nothing;

  delete from collections o
  using collections n
  where o.owner_id = old_id and n.owner_id = new_id and n.name = o.name;

  update collections set owner_id = new_id where owner_id = old_id;
  update recipes     set owner_id = new_id where owner_id = old_id;
  update shares      set sharer_id = new_id where sharer_id = old_id;
  update events      set user_id   = new_id where user_id   = old_id;

  -- Keep the new user's profile if it has one; otherwise take the old one.
  if not exists (select 1 from profiles where id = new_id) then
    update profiles set id = new_id where id = old_id;
  end if;

  raise notice 'Merged % into %', old_id, new_id;
end $$;

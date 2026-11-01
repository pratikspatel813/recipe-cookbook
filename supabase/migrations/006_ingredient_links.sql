-- =============================================================================
-- 006 — Shopping links on ingredients
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Each ingredient can carry a link to where you buy it ("2 tbsp ghee" → the
-- ghee you actually use). This is where affiliate revenue would come from
-- later, so clicks on these links get tracked as events.
--
-- The three recipe functions are redefined to carry the new field. Everything
-- else in them is unchanged.
-- =============================================================================

alter table public.ingredients
  add column link_url text check (link_url ~* '^https?://');  -- only real web links, never javascript: etc.


-- save_recipe(): + link_url --------------------------------------------------
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

  insert into ingredients (recipe_id, position, quantity, unit, name, raw_text, link_url)
  select new_id, (i->>'position')::integer, (i->>'quantity')::numeric, i->>'unit', i->>'name', i->>'rawText',
         nullif(i->>'linkUrl', '')
  from jsonb_array_elements(recipe->'ingredients') as i;

  insert into steps (recipe_id, position, text)
  select new_id, (s->>'position')::integer, s->>'text'
  from jsonb_array_elements(recipe->'steps') as s;

  insert into collection_recipes (collection_id, recipe_id)
  select unnest(collection_ids), new_id;

  return new_id;
end;
$$;


-- update_recipe(): + link_url ------------------------------------------------
create or replace function public.update_recipe(recipe_id uuid, recipe jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update recipes set
    title              = recipe->>'title',
    description        = recipe->>'description',
    image_url          = recipe->>'imageUrl',
    source_url         = recipe->>'sourceUrl',
    servings           = recipe->>'servings',
    total_time_minutes = (recipe->>'totalTimeMinutes')::integer,
    updated_at         = now()
  where id = recipe_id;

  if not found then
    raise exception 'Recipe not found or not yours';
  end if;

  delete from ingredients where ingredients.recipe_id = update_recipe.recipe_id;
  insert into ingredients (recipe_id, position, quantity, unit, name, raw_text, link_url)
  select update_recipe.recipe_id, (i->>'position')::integer, (i->>'quantity')::numeric, i->>'unit', i->>'name',
         i->>'rawText', nullif(i->>'linkUrl', '')
  from jsonb_array_elements(recipe->'ingredients') as i;

  delete from steps where steps.recipe_id = update_recipe.recipe_id;
  insert into steps (recipe_id, position, text)
  select update_recipe.recipe_id, (s->>'position')::integer, s->>'text'
  from jsonb_array_elements(recipe->'steps') as s;
end;
$$;


-- get_shared_recipe(): + linkUrl, so friends see (and can click) your links --
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
                 'name', i.name, 'rawText', i.raw_text, 'linkUrl', i.link_url) order by i.position)
        from ingredients i where i.recipe_id = r.id), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('position', st.position, 'text', st.text) order by st.position)
        from steps st where st.recipe_id = r.id), '[]'::jsonb)
    )
  )
  from shares s
  join recipes r on r.id = s.recipe_id
  left join profiles p on p.id = s.sharer_id
  where s.token = share_token;
$$;

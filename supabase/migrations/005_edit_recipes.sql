-- =============================================================================
-- 005 — Editing recipes
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Recipes you write yourself need fixing (typos, "actually it's 2 eggs"), and
-- imported ones sometimes do too. update_recipe() rewrites a recipe in one
-- transaction, the same way save_recipe() creates one.
-- =============================================================================

-- When was the recipe last changed? Lets us measure editing later
-- ("do people tweak recipes after cooking them?").
alter table public.recipes add column updated_at timestamptz;


-- -----------------------------------------------------------------------------
-- update_recipe(): replace a recipe's details, ingredients and steps.
--
-- Ingredients and steps are deleted and re-inserted rather than updated one
-- by one. Matching "which old line became which new line" is fiddly and
-- error-prone; replacing the whole list is simple and always correct. The
-- transaction means nobody ever sees the recipe half-way through.
--
-- `security invoker` + RLS: you can only update your own recipes. If the id
-- isn't yours, the first UPDATE matches zero rows and we stop.
-- -----------------------------------------------------------------------------
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
  insert into ingredients (recipe_id, position, quantity, unit, name, raw_text)
  select update_recipe.recipe_id, (i->>'position')::integer, (i->>'quantity')::numeric, i->>'unit', i->>'name', i->>'rawText'
  from jsonb_array_elements(recipe->'ingredients') as i;

  delete from steps where steps.recipe_id = update_recipe.recipe_id;
  insert into steps (recipe_id, position, text)
  select update_recipe.recipe_id, (s->>'position')::integer, s->>'text'
  from jsonb_array_elements(recipe->'steps') as s;
end;
$$;

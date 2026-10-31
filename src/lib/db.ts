// Every database read/write the app makes lives in this file. Pages call
// these functions instead of talking to Supabase directly, so if the
// database changes, this is the only file that has to change with it.
//
// The database uses snake_case column names (image_url), while our
// TypeScript uses camelCase (imageUrl). The `toRecipe` function below
// translates between the two.

import { supabase, ensureUser } from "./supabase";
import type { Recipe } from "./recipe";

export type SavedRecipe = Recipe & { id: string; createdAt: string };
export type Collection = { id: string; name: string; recipeCount: number };
export type ImportMethod = "url" | "paste" | "manual";

// ---- Recipes ---------------------------------------------------------------

export async function saveRecipe(
  recipe: Recipe,
  importMethod: ImportMethod,
  collectionIds: string[],
): Promise<string> {
  await ensureUser();
  // "rpc" = call the save_recipe() function we wrote in schema.sql.
  const { data, error } = await supabase.rpc("save_recipe", {
    recipe: { ...recipe, importMethod },
    collection_ids: collectionIds,
  });
  if (error) throw error;
  return data as string;
}

// The cookbook's table of contents. Optionally filtered to one collection.
// We only need a few columns here, not every ingredient and step.
export async function listRecipes(collectionId?: string): Promise<SavedRecipe[]> {
  await ensureUser();
  // With a collection: INNER JOIN to collection_recipes, which keeps only
  // recipes that have a matching link row. Same idea as in SQL.
  const query = collectionId
    ? supabase
        .from("recipes")
        .select("*, collection_recipes!inner(collection_id)")
        .eq("collection_recipes.collection_id", collectionId)
    : supabase.from("recipes").select("*");

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => toRecipe(row));
}

// One full recipe, with ingredients and steps.
// Supabase follows the foreign keys for us: "ingredients(*)" means
// "also fetch every ingredient row whose recipe_id points at this recipe".
export async function getRecipe(id: string): Promise<SavedRecipe | null> {
  await ensureUser();
  const { data, error } = await supabase
    .from("recipes")
    .select("*, ingredients(*), steps(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toRecipe(data) : null;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
}

// ---- Collections -----------------------------------------------------------

export async function listCollections(): Promise<Collection[]> {
  await ensureUser();
  // "collection_recipes(count)" asks Postgres to count the links for us.
  const { data, error } = await supabase
    .from("collections")
    .select("id, name, collection_recipes(count)")
    .order("name");
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    recipeCount: (c.collection_recipes as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export async function createCollection(name: string): Promise<Collection> {
  await ensureUser();
  const { data, error } = await supabase
    .from("collections")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (error) throw error;
  return { ...data, recipeCount: 0 };
}

// Which collections is this recipe in?
export async function getRecipeCollectionIds(recipeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_recipes")
    .select("collection_id")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  return data.map((r) => r.collection_id);
}

export async function addToCollection(recipeId: string, collectionId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_recipes")
    .insert({ recipe_id: recipeId, collection_id: collectionId });
  if (error) throw error;
}

export async function removeFromCollection(recipeId: string, collectionId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_recipes")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("collection_id", collectionId);
  if (error) throw error;
}

// ---- Translating database rows into our Recipe type ------------------------

type Row = Record<string, unknown>;

function toRecipe(row: Row): SavedRecipe {
  const ingredients = ((row.ingredients as Row[] | undefined) ?? [])
    .map((i) => ({
      position: i.position as number,
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit as string | null,
      name: i.name as string,
      rawText: i.raw_text as string,
    }))
    .sort((a, b) => a.position - b.position);

  const steps = ((row.steps as Row[] | undefined) ?? [])
    .map((s) => ({ position: s.position as number, text: s.text as string }))
    .sort((a, b) => a.position - b.position);

  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    title: row.title as string,
    description: row.description as string | null,
    imageUrl: row.image_url as string | null,
    sourceUrl: row.source_url as string | null,
    author: row.author as string | null,
    servings: row.servings as string | null,
    totalTimeMinutes: row.total_time_minutes as number | null,
    ingredients,
    steps,
  };
}

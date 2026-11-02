// Every database read/write the app makes lives in this file. Pages call
// these functions instead of talking to Supabase directly, so if the
// database changes, this is the only file that has to change with it.
//
// The database uses snake_case column names (image_url), while our
// TypeScript uses camelCase (imageUrl). The `toRecipe` function below
// translates between the two.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, ensureUser } from "./supabase";
import type { Recipe } from "./recipe";

export type SavedRecipe = Recipe & {
  id: string;
  createdAt: string;
  importMethod: ImportMethod | null;
  ownerId: string;
  isPublic: boolean;
};
export type Collection = { id: string; name: string; recipeCount: number };
export type ImportMethod = "url" | "paste" | "manual" | "shared" | "ai";

// Only recipes you made yourself can be public (the database enforces this too).
export function canBePublic(method: ImportMethod | null): boolean {
  return method === "manual" || method === "ai";
}

// ---- Recipes ---------------------------------------------------------------

export async function saveRecipe(
  recipe: Recipe,
  importMethod: ImportMethod,
  collectionIds: string[],
  savedFromShareId: string | null = null,
): Promise<string> {
  await ensureUser();
  // "rpc" = call the save_recipe() function we wrote in the migrations.
  const { data, error } = await supabase.rpc("save_recipe", {
    recipe: { ...recipe, importMethod, savedFromShareId },
    collection_ids: collectionIds,
  });
  if (error) throw error;
  return data as string;
}

// The cookbook's table of contents. Optionally filtered to one collection.
// We only need a few columns here, not every ingredient and step.
export async function listRecipes(collectionId?: string): Promise<SavedRecipe[]> {
  const userId = await ensureUser();
  // With a collection: INNER JOIN to collection_recipes, which keeps only
  // recipes that have a matching link row. Same idea as in SQL.
  const query = collectionId
    ? supabase
        .from("recipes")
        .select("*, collection_recipes!inner(collection_id)")
        .eq("collection_recipes.collection_id", collectionId)
    : supabase.from("recipes").select("*");

  // RLS now also lets us SEE other people's public recipes, so "my cookbook"
  // must ask for my recipes explicitly. Permission ≠ intent: what you're
  // allowed to read isn't the same as what this screen should show.
  const { data, error } = await query.eq("owner_id", userId).order("created_at", { ascending: false });
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

// Replace a recipe's details, ingredients and steps (the update_recipe() SQL function).
export async function updateRecipe(id: string, recipe: Recipe): Promise<void> {
  await ensureUser();
  const { error } = await supabase.rpc("update_recipe", { recipe_id: id, recipe });
  if (error) throw error;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
}

// ---- Sharing ---------------------------------------------------------------

export type SharedRecipe = {
  shareId: string;
  sharerId: string;
  sharerName: string | null; // null for links made before accounts existed
  recipe: Recipe & { id: string };
};

// Get the share link token for one of your recipes, creating it the first time.
export async function getOrCreateShareToken(recipeId: string): Promise<{ shareId: string; token: string }> {
  await ensureUser();
  const existing = await supabase.from("shares").select("id, token").eq("recipe_id", recipeId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { shareId: existing.data.id, token: existing.data.token };

  const created = await supabase.from("shares").insert({ recipe_id: recipeId }).select("id, token").single();
  if (created.error) throw created.error;
  return { shareId: created.data.id, token: created.data.token };
}

// Look up a shared recipe by its token. Works without any user at all, so the
// server can call it too (with its own client — see app/s/[token]/page.tsx).
export async function getSharedRecipe(client: SupabaseClient, token: string): Promise<SharedRecipe | null> {
  const { data, error } = await client.rpc("get_shared_recipe", { share_token: token });
  if (error) throw error;
  if (!data) return null;
  const shared = data as SharedRecipe;
  shared.recipe.ingredients = shared.recipe.ingredients.map((i) => ({
    ...i,
    quantity: i.quantity === null ? null : Number(i.quantity),
  }));
  return shared;
}

// Did I already save a copy of this share? Prevents saving duplicates.
export async function findMySavedCopy(shareId: string): Promise<string | null> {
  await ensureUser();
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("saved_from_share_id", shareId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
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

export async function renameCollection(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("collections").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

// Deleting a chapter only deletes the chapter: its links to recipes go with it
// (on delete cascade), but the recipes themselves stay in your cookbook.
export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

// A friendly message for a failed create or rename. 23505 is Postgres's code
// for breaking a unique rule, here unique (owner_id, name).
export function chapterErrorMessage(err: unknown, name: string): string {
  if ((err as { code?: string })?.code === "23505") return `You already have a chapter called “${name.trim()}”.`;
  return "Couldn't save that chapter. Try again.";
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
      linkUrl: (i.link_url as string | null | undefined) ?? null,
    }))
    .sort((a, b) => a.position - b.position);

  const steps = ((row.steps as Row[] | undefined) ?? [])
    .map((s) => ({ position: s.position as number, text: s.text as string }))
    .sort((a, b) => a.position - b.position);

  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    importMethod: (row.import_method as ImportMethod | undefined) ?? null,
    ownerId: row.owner_id as string,
    isPublic: (row.is_public as boolean | undefined) ?? false,
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

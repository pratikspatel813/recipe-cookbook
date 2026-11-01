"use client";

// /recipe/<id>/edit — change any recipe in your cookbook, imported or your own.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getRecipe, updateRecipe, type SavedRecipe } from "@/lib/db";
import type { Recipe } from "@/lib/recipe";
import { track } from "@/lib/analytics";
import { RecipeForm } from "@/components/RecipeForm";

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined); // undefined = loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecipe(id).then(setRecipe).catch(() => setRecipe(null));
  }, [id]);

  async function handleSave(updated: Recipe) {
    if (!recipe) return;
    setSaving(true);
    setError(null);
    try {
      await updateRecipe(id, updated);
      track("recipe_edited", {
        recipe_id: id,
        import_method: recipe.importMethod,
        fields_changed: changedFields(recipe, updated),
        ingredient_count_change: updated.ingredients.length - recipe.ingredients.length,
      });
      router.push(`/recipe/${id}`);
    } catch (err) {
      console.error(err);
      setError("Couldn't save your changes. Please try again.");
      setSaving(false);
    }
  }

  if (recipe === undefined) return <p className="py-20 text-center italic text-ink-soft">Turning to the page…</p>;
  if (recipe === null) {
    return (
      <main className="py-20 text-center">
        <p className="font-display text-2xl">Recipe not found</p>
        <Link href="/" className="mt-4 inline-block italic text-accent underline">
          Back to cookbook
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Link href={`/recipe/${id}`} className="text-sm italic text-ink-soft hover:text-accent">
        ← Cancel
      </Link>
      <h1 className="mt-6 mb-8 text-center font-display text-4xl">Edit recipe</h1>
      <RecipeForm initial={recipe} submitLabel="Save changes" busy={saving} onSubmit={handleSave} />
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </main>
  );
}

// Which parts of the recipe changed? Compares the text people see, so
// re-saving without changes logs an empty list.
function changedFields(before: Recipe, after: Recipe): string[] {
  const lines = (r: Recipe) => ({
    title: r.title,
    description: r.description ?? "",
    servings: r.servings ?? "",
    time: String(r.totalTimeMinutes ?? ""),
    source: r.sourceUrl ?? "",
    ingredients: r.ingredients.map((i) => i.rawText).join("\n"),
    steps: r.steps.map((s) => s.text).join("\n"),
    shopping_links: r.ingredients.map((i) => i.linkUrl ?? "").join("\n"),
  });
  const a = lines(before);
  const b = lines(after);
  return (Object.keys(a) as (keyof typeof a)[]).filter((key) => a[key] !== b[key]);
}

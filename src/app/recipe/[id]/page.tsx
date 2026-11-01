"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addToCollection,
  deleteRecipe,
  getRecipe,
  getRecipeCollectionIds,
  removeFromCollection,
  type SavedRecipe,
} from "@/lib/db";
import { track } from "@/lib/analytics";
import { RecipeCard } from "@/components/RecipeCard";
import { ChapterPicker } from "@/components/ChapterPicker";

// One saved recipe. The [id] in the folder name means the URL /recipe/abc-123
// shows the recipe whose id is "abc-123".
export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined); // undefined = loading
  const [chapterIds, setChapterIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getRecipe(id)
      .then((r) => {
        setRecipe(r);
        if (r) track("recipe_viewed", { recipe_id: r.id });
      })
      .catch(() => setRecipe(null));
    getRecipeCollectionIds(id).then((ids) => setChapterIds(new Set(ids))).catch(console.error);
  }, [id]);

  // Update the screen right away, then save. If the save fails, undo.
  // This pattern is called an "optimistic update" — it makes the app feel instant.
  async function toggleChapter(collectionId: string, selected: boolean) {
    const update = (add: boolean) =>
      setChapterIds((prev) => {
        const next = new Set(prev);
        if (add) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });

    update(selected);
    try {
      if (selected) await addToCollection(id, collectionId);
      else await removeFromCollection(id, collectionId);
      track("recipe_chapter_changed", { recipe_id: id, chapter_id: collectionId, action: selected ? "added" : "removed" });
    } catch (err) {
      console.error(err);
      update(!selected);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this recipe from your cookbook?")) return;
    await deleteRecipe(id);
    track("recipe_deleted", { recipe_id: id });
    router.push("/");
  }

  if (recipe === undefined) {
    return <p className="py-20 text-center italic text-ink-soft">Turning to the page…</p>;
  }

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
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm italic text-ink-soft hover:text-accent">
          ← Back to cookbook
        </Link>
        <button onClick={handleDelete} className="text-sm italic text-ink-soft hover:text-accent">
          Remove
        </button>
      </div>

      <div className="mt-6 mb-6">
        <p className="mb-2 text-xs uppercase tracking-widest text-ink-soft">Chapters</p>
        <ChapterPicker selectedIds={chapterIds} onToggle={toggleChapter} source="recipe_page" />
      </div>

      <RecipeCard
        recipe={recipe}
        onCookingStarted={() =>
          track("cooking_started", { recipe_id: recipe.id, ingredient_count: recipe.ingredients.length })
        }
      />
    </main>
  );
}

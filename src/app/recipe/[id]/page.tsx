"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addToCollection,
  canBePublic,
  deleteRecipe,
  getRecipe,
  getRecipeCollectionIds,
  removeFromCollection,
  saveRecipe,
  type SavedRecipe,
} from "@/lib/db";
import { getDisplayName, setRecipePublic } from "@/lib/social";
import { useAccount } from "@/lib/account";
import { domainOf, track } from "@/lib/analytics";
import { RecipeCard } from "@/components/RecipeCard";
import { ChapterPicker } from "@/components/ChapterPicker";
import { ShareButton } from "@/components/ShareButton";
import { SignUpDialog } from "@/components/SignUpDialog";
import { Avatar } from "@/components/PostViews";

// One recipe. The [id] in the folder name means the URL /recipe/abc-123
// shows the recipe whose id is "abc-123".
//
// Two kinds of viewer:
//   • the OWNER sees Edit / Remove / Share, chapters, and the Post toggle
//   • anyone else (only possible for a public post) sees who posted it and
//     a "Save to my cookbook" button
export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const account = useAccount();
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined); // undefined = loading
  const [chapterIds, setChapterIds] = useState<Set<string>>(new Set());
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [savedCopyId, setSavedCopyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  const isOwner = account.status !== "loading" && recipe?.ownerId === account.userId;

  useEffect(() => {
    getRecipe(id).then(setRecipe).catch(() => setRecipe(null));
  }, [id]);

  // Once we know who's looking, load the extras for that kind of viewer.
  useEffect(() => {
    if (!recipe || account.status === "loading") return;
    const owner = recipe.ownerId === account.userId;
    track("recipe_viewed", { recipe_id: recipe.id, is_owner: owner });
    if (owner) getRecipeCollectionIds(recipe.id).then((ids) => setChapterIds(new Set(ids))).catch(console.error);
    else getDisplayName(recipe.ownerId).then(setOwnerName).catch(console.error);
  }, [recipe, account]);

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

  async function togglePublic() {
    if (!recipe) return;
    if (account.status === "anonymous") return setShowSignUp(true);
    const next = !recipe.isPublic;
    setBusy(true);
    try {
      await setRecipePublic(recipe.id, next);
      setRecipe({ ...recipe, isPublic: next });
      track("recipe_visibility_changed", { recipe_id: recipe.id, is_public: next, source: "recipe_page" });
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  // Someone else's public post → your own private copy.
  async function saveCopy() {
    if (!recipe) return;
    setBusy(true);
    try {
      const newId = await saveRecipe(recipe, "shared", []);
      track("post_saved", { source_recipe_id: recipe.id, new_recipe_id: newId, owner_id: recipe.ownerId });
      track("recipe_saved", {
        recipe_id: newId,
        import_method: "shared",
        domain: domainOf(recipe.sourceUrl),
        chapter_count: 0,
        seconds_since_import: 0,
        share_id: null,
      });
      setSavedCopyId(newId);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this recipe from your cookbook?")) return;
    await deleteRecipe(id);
    track("recipe_deleted", { recipe_id: id });
    router.push("/profile");
  }

  if (recipe === undefined || account.status === "loading") {
    return <p className="py-20 text-center italic text-ink-soft">Turning to the page…</p>;
  }

  if (recipe === null) {
    return (
      <main className="py-20 text-center">
        <p className="font-display text-2xl">Recipe not found</p>
        <Link href="/profile" className="mt-4 inline-block italic text-accent underline">
          Back to my cookbook
        </Link>
      </main>
    );
  }

  const surface = isOwner ? "own_recipe" : "public_post";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm italic text-ink-soft hover:text-accent">
          ← Back
        </button>
        {isOwner && (
          <div className="flex items-center gap-4">
            <button onClick={handleDelete} className="text-sm italic text-ink-soft hover:text-accent">
              Remove
            </button>
            <Link href={`/recipe/${recipe.id}/edit`} className="text-sm italic text-ink-soft hover:text-accent">
              Edit
            </Link>
            <ShareButton recipeId={recipe.id} title={recipe.title} />
          </div>
        )}
      </div>

      {isOwner ? (
        <div className="mt-6 mb-6 space-y-4">
          {canBePublic(recipe.importMethod) ? (
            <div className="flex items-center justify-between rounded-sm border border-rule bg-page px-4 py-3">
              <p className="text-sm">
                {recipe.isPublic ? (
                  <>Posted on your profile. <span className="italic text-ink-soft">Anyone can find it.</span></>
                ) : (
                  <>Private. <span className="italic text-ink-soft">Only you (and people you share with) can see it.</span></>
                )}
              </p>
              <button
                onClick={togglePublic}
                disabled={busy}
                className={`ml-3 shrink-0 rounded-sm px-3 py-1.5 font-display text-sm transition disabled:opacity-60 ${
                  recipe.isPublic ? "border border-rule hover:border-accent" : "bg-accent text-on-accent hover:brightness-110"
                }`}
              >
                {recipe.isPublic ? "Unpost" : "Post to profile"}
              </button>
            </div>
          ) : (
            <p className="text-xs italic text-ink-soft">
              Imported recipes stay private, because they belong to their original creator. You can still share them by link.
            </p>
          )}
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-ink-soft">Chapters</p>
            <ChapterPicker selectedIds={chapterIds} onToggle={toggleChapter} source="recipe_page" />
          </div>
        </div>
      ) : (
        <div className="mt-6 mb-6 flex items-center justify-between gap-3">
          <Link href={`/u/${recipe.ownerId}`} className="flex items-center gap-3 hover:text-accent">
            <Avatar name={ownerName ?? "?"} size="sm" />
            <span className="font-display">{ownerName ?? "…"}</span>
          </Link>
          {savedCopyId ? (
            <Link href={`/recipe/${savedCopyId}`} className="text-sm italic text-accent underline">
              Saved ✓ Open my copy
            </Link>
          ) : (
            <button
              onClick={saveCopy}
              disabled={busy}
              className="rounded-sm bg-accent px-4 py-2 font-display text-sm text-on-accent transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save to my cookbook"}
            </button>
          )}
        </div>
      )}

      <RecipeCard
        recipe={recipe}
        onCookingStarted={() =>
          track("cooking_started", { recipe_id: recipe.id, ingredient_count: recipe.ingredients.length })
        }
        onServingsChanged={(c) =>
          track("servings_scaled", {
            recipe_id: recipe.id,
            from: c.from,
            to: c.to,
            factor: Math.round(c.factor * 100) / 100,
            has_base: c.hasBase,
            surface,
          })
        }
        onIngredientLinkClick={(ing) =>
          track("ingredient_link_clicked", {
            recipe_id: recipe.id,
            ingredient_position: ing.position,
            ingredient_name: ing.name,
            link_domain: domainOf(ing.linkUrl),
            surface,
            share_id: null,
          })
        }
      />

      {showSignUp && (
        <SignUpDialog
          trigger="publish"
          onClose={() => setShowSignUp(false)}
          doneLabel="Post to profile"
          onDone={() => {
            setShowSignUp(false);
            togglePublic();
          }}
        />
      )}
    </main>
  );
}

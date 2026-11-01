"use client";

// The interactive part of the shared-recipe page: tracking the visit and the
// "Save to my cookbook" button. The server already put the recipe in the HTML;
// this runs afterwards in the friend's browser.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { findMySavedCopy, saveRecipe, type SharedRecipe } from "@/lib/db";
import { ensureUser, isNewVisitor } from "@/lib/supabase";
import { domainOf, track } from "@/lib/analytics";
import { RecipeCard } from "@/components/RecipeCard";

type Viewer =
  | { status: "loading" }
  | { status: "owner" } // the sharer looking at their own link
  | { status: "guest"; savedCopyId: string | null };

export function SharedRecipeView({ shared }: { shared: SharedRecipe }) {
  const { shareId, sharerId, sharerName, recipe } = shared;
  const [viewer, setViewer] = useState<Viewer>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    (async () => {
      const userId = await ensureUser();
      const isOwner = userId === sharerId;
      track("share_link_opened", {
        share_id: shareId,
        recipe_id: recipe.id,
        is_owner: isOwner,
        is_new_visitor: isNewVisitor(),
      });
      if (isOwner) setViewer({ status: "owner" });
      else setViewer({ status: "guest", savedCopyId: await findMySavedCopy(shareId) });
    })().catch((err) => {
      console.error(err);
      setViewer({ status: "guest", savedCopyId: null });
    });
  }, [shareId, sharerId, recipe.id]);

  async function handleSave() {
    setSaving(true);
    try {
      const newId = await saveRecipe(recipe, "shared", [], shareId);
      track("recipe_saved", {
        recipe_id: newId,
        import_method: "shared",
        domain: domainOf(recipe.sourceUrl),
        chapter_count: 0,
        seconds_since_import: Math.round((Date.now() - openedAt.current) / 1000),
        share_id: shareId,
      });
      setViewer({ status: "guest", savedCopyId: newId });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">
          {sharerName ? "From the cookbook of" : "Shared from a friend's"}
        </p>
        <p className="font-display text-3xl">{sharerName ?? "Cookbook"}</p>
      </header>

      <section className="my-6 rounded-sm border border-rule bg-page px-5 py-4 text-center">
        {viewer.status === "loading" && <p className="italic text-ink-soft">…</p>}

        {viewer.status === "owner" && (
          <p className="italic text-ink-soft">
            This is your recipe. This is what friends see when you share it.{" "}
            <Link href={`/recipe/${recipe.id}`} className="text-accent underline">
              Back to it
            </Link>
          </p>
        )}

        {viewer.status === "guest" && viewer.savedCopyId && (
          <p>
            Saved to your cookbook ✓{" "}
            <Link href={`/recipe/${viewer.savedCopyId}`} className="italic text-accent underline">
              Open it
            </Link>
          </p>
        )}

        {viewer.status === "guest" && !viewer.savedCopyId && (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Saving…" : "Save to my cookbook"}
            </button>
            <p className="mt-2 text-sm italic text-ink-soft">Free, no account needed.</p>
          </>
        )}
      </section>

      <RecipeCard
        recipe={recipe}
        onServingsChanged={(c) =>
          track("servings_scaled", {
            recipe_id: recipe.id,
            from: c.from,
            to: c.to,
            factor: Math.round(c.factor * 100) / 100,
            has_base: c.hasBase,
            surface: "shared_page",
          })
        }
        onIngredientLinkClick={(ing) =>
          track("ingredient_link_clicked", {
            recipe_id: recipe.id,
            ingredient_position: ing.position,
            ingredient_name: ing.name,
            link_domain: domainOf(ing.linkUrl),
            surface: "shared_page",
            share_id: shareId,
          })
        }
      />

      <p className="mt-10 text-center text-sm italic text-ink-soft">
        Tired of recipe sites full of ads?{" "}
        <Link href="/" className="text-accent underline">
          Start your own cookbook
        </Link>
      </p>
    </main>
  );
}

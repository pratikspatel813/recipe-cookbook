"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCollections, listRecipes, type Collection, type SavedRecipe } from "@/lib/db";

// The cookbook itself: chapters across the top, recipes below.
export default function CookbookPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeChapter, setActiveChapter] = useState<string | null>(null); // null = all recipes
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null); // null = still loading
  const [error, setError] = useState(false);

  useEffect(() => {
    listCollections().then(setCollections).catch(() => setError(true));
  }, []);

  // Re-run whenever the chosen chapter changes.
  useEffect(() => {
    setRecipes(null);
    listRecipes(activeChapter ?? undefined)
      .then(setRecipes)
      .catch(() => setError(true));
  }, [activeChapter]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">My</p>
        <h1 className="font-display text-5xl sm:text-6xl">Cookbook</h1>
      </header>

      <div className="mt-8 flex justify-center">
        <Link
          href="/add"
          className="rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110"
        >
          + Add a recipe
        </Link>
      </div>

      {/* Chapter tabs. Only shown once there's at least one chapter. */}
      {collections.length > 0 && (
        <nav className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 border-b border-rule pb-3 font-display">
          <ChapterTab label="All recipes" active={activeChapter === null} onClick={() => setActiveChapter(null)} />
          {collections.map((c) => (
            <ChapterTab
              key={c.id}
              label={`${c.name} (${c.recipeCount})`}
              active={activeChapter === c.id}
              onClick={() => setActiveChapter(c.id)}
            />
          ))}
        </nav>
      )}

      <section className="mt-8">
        {error && (
          <p className="text-center text-accent">Couldn&apos;t load your cookbook. Try refreshing the page.</p>
        )}

        {!error && recipes === null && <p className="text-center italic text-ink-soft">Opening your cookbook…</p>}

        {recipes?.length === 0 && (
          <div className="mx-auto max-w-sm rounded-sm border border-dashed border-rule px-6 py-12 text-center">
            <p className="font-display text-2xl">
              {activeChapter ? "This chapter is empty" : "Your cookbook is empty"}
            </p>
            <p className="mt-2 italic text-ink-soft">
              {activeChapter ? "Open a recipe to add it here." : "Paste a link from your favorite recipe site to start."}
            </p>
          </div>
        )}

        {recipes && recipes.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
            {recipes.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recipe/${r.id}`}
                  className="group block overflow-hidden rounded-sm border border-rule bg-page shadow-[0_8px_20px_-14px_rgba(60,40,20,0.4)] transition hover:-translate-y-0.5"
                >
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- images come from any recipe site
                    <img src={r.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-paper font-display text-4xl text-accent/40">
                      {r.title[0]}
                    </div>
                  )}
                  <div className="px-3 py-3">
                    <h2 className="font-display leading-snug group-hover:text-accent">{r.title}</h2>
                    {r.totalTimeMinutes && <p className="mt-1 text-xs italic text-ink-soft">{r.totalTimeMinutes} min</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ChapterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 pb-1 transition ${active ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );
}

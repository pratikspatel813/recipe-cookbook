"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/recipe";

// One recipe, laid out like a cookbook page: title and details on top,
// ingredients you can tick off, then numbered steps.
export function RecipeCard({ recipe }: { recipe: Recipe }) {
  // Which ingredients the cook has ticked off. A Set of positions.
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(position: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  const sourceHost = recipe.sourceUrl ? new URL(recipe.sourceUrl).hostname.replace(/^www\./, "") : null;

  return (
    <article className="overflow-hidden rounded-sm border border-rule bg-page shadow-[0_1px_0_#e4d9c3,0_12px_30px_-12px_rgba(60,40,20,0.25)]">
      {recipe.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- images come from any recipe site
        <img src={recipe.imageUrl} alt="" className="h-56 w-full object-cover sm:h-72" />
      )}

      <div className="px-6 py-8 sm:px-10">
        <h2 className="font-display text-3xl leading-tight sm:text-4xl">{recipe.title}</h2>

        {(recipe.author || sourceHost) && (
          <p className="mt-2 text-sm italic text-ink-soft">
            {recipe.author && <>by {recipe.author}</>}
            {recipe.author && sourceHost && " · "}
            {sourceHost && (
              <a href={recipe.sourceUrl!} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-2 hover:text-accent">
                {sourceHost}
              </a>
            )}
          </p>
        )}

        {recipe.description && <p className="mt-4 text-ink-soft">{recipe.description}</p>}

        {(recipe.servings || recipe.totalTimeMinutes) && (
          <div className="mt-6 flex gap-6 border-y border-rule py-3 text-sm">
            {recipe.servings && (
              <div>
                <span className="block text-xs uppercase tracking-widest text-ink-soft">Serves</span>
                {recipe.servings}
              </div>
            )}
            {recipe.totalTimeMinutes && (
              <div>
                <span className="block text-xs uppercase tracking-widest text-ink-soft">Time</span>
                {formatMinutes(recipe.totalTimeMinutes)}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 grid gap-10 md:grid-cols-[2fr_3fr]">
          <section>
            <h3 className="font-display text-xl text-accent">Ingredients</h3>
            <ul className="mt-4 space-y-2">
              {recipe.ingredients.map((ing) => (
                <li key={ing.position}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked.has(ing.position)}
                      onChange={() => toggle(ing.position)}
                      className="mt-1.5 size-4 shrink-0 accent-accent"
                    />
                    <span className={checked.has(ing.position) ? "text-ink-soft line-through" : ""}>
                      {ing.rawText}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="font-display text-xl text-accent">Method</h3>
            <ol className="mt-4 space-y-5">
              {recipe.steps.map((step) => (
                <li key={step.position} className="flex gap-4">
                  <span className="font-display text-2xl leading-none text-accent/70">{step.position}</span>
                  <p className="leading-relaxed">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </article>
  );
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

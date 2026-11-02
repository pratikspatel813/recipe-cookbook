"use client";

import { useState } from "react";
import type { Ingredient, Recipe } from "@/lib/recipe";
import { domainOf } from "@/lib/analytics";
import { baseServings, scaledIngredientText } from "@/lib/scaling";

// One recipe, laid out like a cookbook page: title and details on top,
// ingredients you can tick off, then numbered steps.
//
// onCookingStarted fires once, the first time an ingredient is ticked.
// onIngredientLinkClick fires when someone taps an ingredient's "Buy" link.
// onServingsChanged fires when someone scales the recipe up or down.
export function RecipeCard({
  recipe,
  onCookingStarted,
  onIngredientLinkClick,
  onServingsChanged,
}: {
  recipe: Recipe;
  onCookingStarted?: () => void;
  onIngredientLinkClick?: (ingredient: Ingredient) => void;
  onServingsChanged?: (change: { from: number; to: number; factor: number; hasBase: boolean }) => void;
}) {
  // Which ingredients the cook has ticked off. A Set of positions.
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [cookingStarted, setCookingStarted] = useState(false);

  // Scaling. If the recipe says how many it serves, the stepper counts
  // people (4 → 6). If it doesn't, it counts batches instead (×1 → ×2).
  const base = baseServings(recipe.servings);
  const [count, setCount] = useState(base ?? 1);
  const factor = count / (base ?? 1);

  function changeCount(next: number) {
    const clamped = Math.min(Math.max(next, 1), base ? base * 10 : 10);
    if (clamped === count) return;
    setCount(clamped);
    onServingsChanged?.({ from: base ?? 1, to: clamped, factor: clamped / (base ?? 1), hasBase: base !== null });
  }

  function toggle(position: number) {
    if (!cookingStarted) {
      setCookingStarted(true);
      onCookingStarted?.();
    }
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  const sourceHost = recipe.sourceUrl ? new URL(recipe.sourceUrl).hostname.replace(/^www\./, "") : null;

  return (
    <article className="overflow-hidden rounded-sm border border-rule bg-page shadow-[var(--card-shadow)]">
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

        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3 border-y border-rule py-3 text-sm">
          <div>
            <span className="block text-xs uppercase tracking-widest text-ink-soft">{base ? "Serves" : "Batch"}</span>
            <div className="mt-1 flex items-center gap-3">
              <StepButton label="Fewer" onClick={() => changeCount(count - 1)} disabled={count <= 1}>
                −
              </StepButton>
              <span className="min-w-8 text-center font-display text-xl" aria-live="polite">
                {base ? count : `×${count}`}
              </span>
              <StepButton label="More" onClick={() => changeCount(count + 1)}>
                +
              </StepButton>
            </div>
          </div>
          {recipe.totalTimeMinutes && (
            <div>
              <span className="block text-xs uppercase tracking-widest text-ink-soft">Time</span>
              <span className="mt-1 block py-1">{formatMinutes(recipe.totalTimeMinutes)}</span>
            </div>
          )}
          {factor !== 1 && (
            <p className="w-full text-xs italic text-ink-soft">
              Scaled from the original{recipe.servings ? ` (${recipe.servings})` : ""}.{" "}
              <button onClick={() => changeCount(base ?? 1)} className="underline hover:text-accent">
                Reset
              </button>
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[2fr_3fr]">
          <section>
            <h3 className="font-display text-xl text-accent">Ingredients</h3>
            <ul className="mt-4 space-y-2">
              {recipe.ingredients.map((ing) => (
                <li key={ing.position} className="flex items-start justify-between gap-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked.has(ing.position)}
                      onChange={() => toggle(ing.position)}
                      className="mt-1.5 size-4 shrink-0 accent-accent"
                    />
                    <span className={checked.has(ing.position) ? "text-ink-soft line-through" : ""}>
                      {scaledIngredientText(ing, factor)}
                    </span>
                  </label>
                  {/* Outside the <label>, so tapping the link doesn't also tick the box.
                      rel="sponsored" tells search engines it may be an affiliate link. */}
                  {ing.linkUrl && (
                    <a
                      href={ing.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      onClick={() => onIngredientLinkClick?.(ing)}
                      title={domainOf(ing.linkUrl) ?? undefined}
                      className="mt-0.5 shrink-0 rounded-full border border-rule px-2 text-xs italic text-ink-soft transition hover:border-accent hover:text-accent"
                    >
                      Buy ↗
                    </a>
                  )}
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

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-full border border-rule text-lg leading-none transition hover:border-accent hover:text-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

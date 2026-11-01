"use client";

import { useState } from "react";
import { parseIngredient, type Recipe } from "@/lib/recipe";

// Write a recipe yourself, or edit an existing one.
//
// Ingredients and steps are big text boxes, one per line, instead of a form
// row per ingredient. It's much faster to type on a phone, and you can paste a
// whole recipe straight from your notes app. We split the lines and run each
// ingredient through the same parser the URL importer uses, so hand-written
// recipes get structured quantity/unit/name data too.

export function RecipeForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  children,
}: {
  initial?: Recipe;
  submitLabel: string;
  busy: boolean;
  onSubmit: (recipe: Recipe) => void;
  children?: React.ReactNode; // extra controls shown above the submit button
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [servings, setServings] = useState(initial?.servings ?? "");
  const [minutes, setMinutes] = useState(initial?.totalTimeMinutes?.toString() ?? "");
  const [ingredientsText, setIngredientsText] = useState(initial?.ingredients.map((i) => i.rawText).join("\n") ?? "");
  const [stepsText, setStepsText] = useState(initial?.steps.map((s) => s.text).join("\n") ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  // Shopping links, keyed by the ingredient's text. Keying by text (not by
  // line number) means a link stays with "2 tbsp ghee" even if you reorder lines.
  const [links, setLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.ingredients ?? []).filter((i) => i.linkUrl).map((i) => [i.rawText, i.linkUrl!])),
  );
  const [showLinks, setShowLinks] = useState(Object.keys(links).length > 0);

  const ingredientLines = toLines(ingredientsText);
  const stepLines = toLines(stepsText);
  const badLinks = ingredientLines.filter((line) => links[line]?.trim() && !isWebLink(links[line]));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedMinutes = parseInt(minutes, 10);
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      imageUrl: initial?.imageUrl ?? null,
      sourceUrl: sourceUrl.trim() || null,
      author: initial?.author ?? null,
      servings: servings.trim() || null,
      totalTimeMinutes: parsedMinutes > 0 ? parsedMinutes : null,
      ingredients: ingredientLines.map((line, i) => ({
        ...parseIngredient(line, i + 1),
        linkUrl: links[line]?.trim() || null,
      })),
      steps: stepLines.map((text, i) => ({ position: i + 1, text })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-sm border border-rule bg-page px-5 py-6 sm:px-8">
      <Field label="Recipe name">
        <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Grandma's dal" className={`${inputClass} font-display text-xl`} />
      </Field>

      <Field label="A line about it (optional)">
        <input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="The one I make every Sunday" className={inputClass} />
      </Field>

      <div className="mt-4 grid grid-cols-2 gap-4 [&>label]:mt-0">
        <Field label="Serves (optional)">
          <input maxLength={40} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" className={inputClass} />
        </Field>
        <Field label="Total minutes (optional)">
          <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
            placeholder="45" className={inputClass} />
        </Field>
      </div>

      <Field label={`Ingredients — one per line${ingredientLines.length ? ` (${ingredientLines.length})` : ""}`}>
        <textarea required rows={8} value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)}
          placeholder={"1 cup red lentils\n2 tbsp ghee\n1 tsp cumin seeds\nSalt to taste"} className={inputClass} />
      </Field>

      {ingredientLines.length > 0 && (
        <div className="mt-3">
          {!showLinks ? (
            <button type="button" onClick={() => setShowLinks(true)}
              className="text-sm italic text-ink-soft underline decoration-rule underline-offset-2 hover:text-accent">
              + Add shopping links to ingredients
            </button>
          ) : (
            <fieldset className="rounded-sm border border-rule px-4 py-3">
              <legend className="px-1 text-xs uppercase tracking-widest text-ink-soft">Shopping links (optional)</legend>
              <p className="mb-3 text-xs italic text-ink-soft">
                Where do you buy it? Friends you share with will see a &ldquo;Buy&rdquo; link.
              </p>
              <ul className="space-y-2">
                {ingredientLines.map((line, i) => (
                  <li key={`${i}-${line}`} className="grid gap-1 sm:grid-cols-[1fr_1.4fr] sm:items-center sm:gap-3">
                    <span className="truncate text-sm">{line}</span>
                    <input
                      type="url"
                      value={links[line] ?? ""}
                      onChange={(e) => setLinks((prev) => ({ ...prev, [line]: e.target.value }))}
                      placeholder="https://…"
                      aria-label={`Shopping link for ${line}`}
                      className="rounded-sm border border-rule bg-paper px-2 py-1 text-sm outline-none placeholder:text-ink-soft/50 focus:border-accent"
                    />
                  </li>
                ))}
              </ul>
              {badLinks.length > 0 && (
                <p className="mt-2 text-xs text-accent">Links need to start with https:// or http://</p>
              )}
            </fieldset>
          )}
        </div>
      )}

      <Field label={`Steps — one per line${stepLines.length ? ` (${stepLines.length})` : ""}`}>
        <textarea required rows={8} value={stepsText} onChange={(e) => setStepsText(e.target.value)}
          placeholder={"Rinse the lentils until the water runs clear.\nSimmer with 3 cups water for 20 minutes.\nHeat ghee, add cumin, pour over the dal."}
          className={inputClass} />
      </Field>

      <Field label="Link to the original (optional)">
        <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@creator/video/…" className={inputClass} />
      </Field>

      {children}

      <button
        type="submit"
        disabled={busy || !title.trim() || ingredientLines.length === 0 || stepLines.length === 0 || badLinks.length > 0}
        className="mt-6 w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

const inputClass =
  "mt-1 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-base normal-case tracking-normal text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block text-xs uppercase tracking-widest text-ink-soft first:mt-0">
      {label}
      {children}
    </label>
  );
}

function isWebLink(value: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(value.trim());
}

// Split a text box into clean lines: drop blank lines, and strip bullets or
// numbering people paste in ("- 2 eggs", "• 2 eggs", "3. Bake for 20 min").
function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-•*▢□]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

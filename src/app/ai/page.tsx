"use client";

// The AI Kitchen: adapt one of your recipes to your dietary needs ("no onion,
// no garlic"), or describe a dish and get a new recipe.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRecipe, listRecipes, saveRecipe, type SavedRecipe } from "@/lib/db";
import { supabase, ensureUser } from "@/lib/supabase";
import { RESTRICTIONS, type RestrictionId } from "@/lib/ai";
import type { Recipe } from "@/lib/recipe";
import { track } from "@/lib/analytics";
import { RecipeCard } from "@/components/RecipeCard";

type Mode = "adapt" | "create";
type Result = { recipe: Recipe; changes: string[] };

export default function AiKitchenPage() {
  const router = useRouter();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("adapt");
  const [myRecipes, setMyRecipes] = useState<SavedRecipe[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [restrictions, setRestrictions] = useState<Set<RestrictionId>>(new Set());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ai").then((r) => r.json()).then((d) => setConfigured(d.configured)).catch(() => setConfigured(false));
    listRecipes().then(setMyRecipes).catch(console.error);
  }, []);

  function toggleRestriction(id: RestrictionId) {
    setRestrictions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit =
    configured === true &&
    !busy &&
    (mode === "adapt" ? Boolean(recipeId) && (restrictions.size > 0 || notes.trim().length > 0) : prompt.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const restrictionList = [...restrictions];
    track("ai_requested", { mode, restrictions: restrictionList, has_notes: notes.trim().length > 0 });
    const startedAt = Date.now();

    try {
      await ensureUser();
      const { data } = await supabase.auth.getSession();
      const base = { mode, restrictions: restrictionList, notes };
      let body: object;
      if (mode === "adapt") {
        const full = await getRecipe(recipeId);
        if (!full) throw new Error("Recipe not found");
        body = { ...base, recipe: full };
      } else {
        body = { ...base, prompt };
      }

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message);
        track("ai_failed", { mode, reason: json.reason ?? "unknown" });
        return;
      }
      setResult({ recipe: json.recipe, changes: json.changes });
      track("ai_succeeded", { mode, ms_elapsed: Date.now() - startedAt, ingredient_count: json.recipe.ingredients.length });
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Check your connection and try again.");
      track("ai_failed", { mode, reason: "network_error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      const id = await saveRecipe(result.recipe, "ai", []);
      track("recipe_saved", {
        recipe_id: id,
        import_method: "ai",
        domain: null,
        chapter_count: 0,
        seconds_since_import: 0,
        share_id: null,
      });
      router.push(`/recipe/${id}`);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">The</p>
        <h1 className="font-display text-4xl sm:text-5xl">AI Kitchen</h1>
        <p className="mt-2 italic text-ink-soft">Make any recipe fit how you eat, or dream up a new one.</p>
      </header>

      {configured === false && (
        <div className="mt-6 rounded-sm border border-accent/30 bg-page px-4 py-3 text-center">
          <p className="font-display text-lg text-accent">Coming soon</p>
          <p className="text-sm italic text-ink-soft">The AI Kitchen is built and waiting for its API key to be switched on.</p>
        </div>
      )}

      <nav className="mt-8 flex justify-center gap-6 border-b border-rule font-display">
        {(
          [
            ["adapt", "Adapt a recipe"],
            ["create", "Create a recipe"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`-mb-px border-b-2 pb-2 transition ${mode === m ? "border-accent text-accent" : "border-transparent text-ink-soft"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <form onSubmit={handleSubmit} className="mt-6 rounded-sm border border-rule bg-page px-5 py-6">
        {mode === "adapt" ? (
          <label className="block text-xs uppercase tracking-widest text-ink-soft">
            Recipe from your cookbook
            <select
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              className="mt-1 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-base normal-case tracking-normal text-ink outline-none focus:border-accent"
            >
              <option value="">Choose a recipe…</option>
              {myRecipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-xs uppercase tracking-widest text-ink-soft">
            What do you want to cook?
            <textarea
              rows={3}
              maxLength={1000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A quick weeknight curry with chickpeas and spinach"
              className="mt-1 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-base normal-case tracking-normal text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent"
            />
          </label>
        )}

        <p className="mt-5 text-xs uppercase tracking-widest text-ink-soft">Dietary needs</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(RESTRICTIONS) as RestrictionId[]).map((id) => {
            const on = restrictions.has(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRestriction(id)}
                className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-accent bg-accent text-page" : "border-rule hover:border-accent"}`}
              >
                {RESTRICTIONS[id].label}
              </button>
            );
          })}
        </div>

        <label className="mt-5 block text-xs uppercase tracking-widest text-ink-soft">
          Anything else? (optional)
          <input
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Less spicy, uses what's in my pantry, ready in 30 minutes…"
            className="mt-1 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-base normal-case tracking-normal text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-6 w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Cooking it up… (this can take a minute)" : mode === "adapt" ? "Adapt recipe" : "Create recipe"}
        </button>
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      </form>

      {result && (
        <section className="mt-8">
          {result.changes.length > 0 && (
            <div className="mb-4 rounded-sm border border-rule bg-page px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-ink-soft">{mode === "adapt" ? "What changed" : "Tips"}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {result.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <RecipeCard recipe={result.recipe} />
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save to my cookbook"}
          </button>
          <p className="mt-2 text-center text-xs italic text-ink-soft">AI can make mistakes. Check allergens yourself before cooking.</p>
        </section>
      )}
    </main>
  );
}

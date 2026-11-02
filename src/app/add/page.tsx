"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/lib/recipe";
import { saveRecipe } from "@/lib/db";
import { domainOf, track } from "@/lib/analytics";
import { RecipeCard } from "@/components/RecipeCard";
import { ChapterPicker } from "@/components/ChapterPicker";
import { RecipeForm } from "@/components/RecipeForm";
import { useAccount } from "@/lib/account";
import { setRecipePublic } from "@/lib/social";

type Mode = "url" | "manual";

// The page has four possible states. Writing them out like this means the
// screen can never be "loading" and "showing an error" at the same time.
type ImportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; recipe: Recipe; msElapsed: number; importedAt: number };

export default function AddRecipePage() {
  const router = useRouter();
  const account = useAccount();
  // Hand-written recipes go on your profile by default, like an Instagram post.
  // (Anonymous users have no profile yet, so theirs stay private.)
  const [postToProfile, setPostToProfile] = useState(true);
  const [mode, setMode] = useState<Mode>("url");
  const [manualStartedAt, setManualStartedAt] = useState(0);
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const [chapterIds, setChapterIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault(); // stop the browser from reloading the page
    setState({ status: "loading" });
    const domain = domainOf(url);
    track("import_started", { domain });

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (data.ok) {
        setState({ status: "done", recipe: data.recipe, msElapsed: data.msElapsed, importedAt: Date.now() });
        track("import_succeeded", {
          domain: domain ?? "unknown",
          ms_elapsed: data.msElapsed,
          ingredient_count: data.recipe.ingredients.length,
          step_count: data.recipe.steps.length,
        });
      } else {
        setState({ status: "error", message: data.message });
        track("import_failed", { domain, failure_reason: data.reason, ms_elapsed: data.msElapsed });
      }
    } catch {
      setState({ status: "error", message: "Something went wrong. Check your connection and try again." });
      // The request never reached our server, so it's a different failure from the server-side ones.
      track("import_failed", { domain, failure_reason: "network_error", ms_elapsed: null });
    }
  }

  async function handleSave() {
    if (state.status !== "done") return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveRecipe(state.recipe, "url", [...chapterIds]);
      track("recipe_saved", {
        recipe_id: id,
        import_method: "url",
        domain: domainOf(state.recipe.sourceUrl),
        chapter_count: chapterIds.size,
        seconds_since_import: Math.round((Date.now() - state.importedAt) / 1000),
        share_id: null,
      });
      router.push(`/recipe/${id}`);
    } catch (err) {
      console.error(err);
      setSaveError("Couldn't save the recipe. Please try again.");
      setSaving(false);
    }
  }

  function chooseMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setSaveError(null);
    if (next === "manual") setManualStartedAt(Date.now());
    track("add_mode_selected", { mode: next });
  }

  async function handleManualSave(recipe: Recipe) {
    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveRecipe(recipe, "manual", [...chapterIds]);
      if (account.status === "registered" && postToProfile) {
        await setRecipePublic(id, true);
        track("recipe_visibility_changed", { recipe_id: id, is_public: true, source: "add_page" });
      }
      track("recipe_saved", {
        recipe_id: id,
        import_method: "manual",
        domain: domainOf(recipe.sourceUrl),
        chapter_count: chapterIds.size,
        seconds_since_import: Math.round((Date.now() - manualStartedAt) / 1000), // time spent writing
        share_id: null,
      });
      router.push(`/recipe/${id}`);
    } catch (err) {
      console.error(err);
      setSaveError("Couldn't save the recipe. Please try again.");
      setSaving(false);
    }
  }

  function toggleChapter(id: string, selected: boolean) {
    setChapterIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/profile" className="text-sm italic text-ink-soft hover:text-accent">
        ← Back to my cookbook
      </Link>

      <header className="mt-6 text-center">
        <h1 className="font-display text-4xl sm:text-5xl">Add a recipe</h1>
        <p className="mt-3 italic text-ink-soft">
          {mode === "url"
            ? "Paste a recipe link. Skip the ads and the life story."
            : "Your own recipe, or one from your notes app."}
        </p>
      </header>

      <nav className="mt-8 flex justify-center gap-6 border-b border-rule font-display">
        <ModeTab label="From a link" active={mode === "url"} onClick={() => chooseMode("url")} />
        <ModeTab label="Write my own" active={mode === "manual"} onClick={() => chooseMode("manual")} />
      </nav>

      {mode === "manual" && (
        <div className="mt-8">
          <RecipeForm submitLabel="Save to my cookbook" busy={saving} onSubmit={handleManualSave}>
            {account.status === "registered" && (
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={postToProfile}
                  onChange={(e) => setPostToProfile(e.target.checked)}
                  className="size-4 accent-accent"
                />
                Post to my profile <span className="italic text-ink-soft">(anyone can find it)</span>
              </label>
            )}
            <p className="mt-6 text-xs uppercase tracking-widest text-ink-soft">File under (optional)</p>
            <div className="mt-2">
              <ChapterPicker selectedIds={chapterIds} onToggle={toggleChapter} source="add_page" />
            </div>
          </RecipeForm>
          {saveError && <p className="mt-2 text-sm text-accent">{saveError}</p>}
        </div>
      )}

      {mode === "url" && (
        <>
          <form onSubmit={handleImport} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com/best-banana-bread"
              className="min-w-0 flex-1 rounded-sm border border-rule bg-page px-4 py-3 outline-none placeholder:text-ink-soft/60 focus:border-accent"
            />
            <button
              type="submit"
              disabled={state.status === "loading"}
              className="rounded-sm bg-accent px-6 py-3 font-display text-on-accent transition hover:brightness-110 disabled:opacity-60"
            >
              {state.status === "loading" ? "Fetching…" : "Get recipe"}
            </button>
          </form>

          <div className="mt-10">
            {state.status === "error" && (
              <div className="rounded-sm border border-accent/30 bg-page px-4 py-3">
                <p className="text-accent">{state.message}</p>
                <button
                  onClick={() => chooseMode("manual")}
                  className="mt-1 text-sm italic text-ink-soft underline hover:text-accent"
                >
                  Copy it in yourself instead →
                </button>
              </div>
            )}
            {state.status === "done" && (
              <>
                <section className="mb-6 rounded-sm border border-rule bg-page px-5 py-4">
                  <p className="text-xs uppercase tracking-widest text-ink-soft">
                    Fetched in {(state.msElapsed / 1000).toFixed(1)}s · File under
                  </p>
                  <div className="mt-3">
                    <ChapterPicker selectedIds={chapterIds} onToggle={toggleChapter} source="add_page" />
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-4 w-full rounded-sm bg-accent px-6 py-3 font-display text-on-accent transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
                  >
                    {saving ? "Saving…" : "Save to my cookbook"}
                  </button>
                  {saveError && <p className="mt-2 text-sm text-accent">{saveError}</p>}
                </section>
                <RecipeCard recipe={state.recipe} />
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2 transition ${active ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );
}

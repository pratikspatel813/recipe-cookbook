"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/recipe";
import { RecipeCard } from "@/components/RecipeCard";

// The page has four possible states. Writing them out like this means the
// screen can never be "loading" and "showing an error" at the same time.
type ImportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; recipe: Recipe; msElapsed: number };

export default function Home() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ImportState>({ status: "idle" });

  async function handleImport(e: React.FormEvent) {
    e.preventDefault(); // stop the browser from reloading the page
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (data.ok) setState({ status: "done", recipe: data.recipe, msElapsed: data.msElapsed });
      else setState({ status: "error", message: data.message });
    } catch {
      setState({ status: "error", message: "Something went wrong. Check your connection and try again." });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">My</p>
        <h1 className="font-display text-5xl sm:text-6xl">Cookbook</h1>
        <p className="mt-3 italic text-ink-soft">Paste a recipe link. Skip the ads and the life story.</p>
      </header>

      <form onSubmit={handleImport} className="mt-10 flex flex-col gap-3 sm:flex-row">
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
          className="rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-60"
        >
          {state.status === "loading" ? "Fetching…" : "Get recipe"}
        </button>
      </form>

      <div className="mt-10">
        {state.status === "error" && (
          <p className="rounded-sm border border-accent/30 bg-page px-4 py-3 text-accent">{state.message}</p>
        )}
        {state.status === "done" && (
          <>
            <p className="mb-4 text-center text-sm italic text-ink-soft">
              Fetched in {(state.msElapsed / 1000).toFixed(1)} seconds
            </p>
            <RecipeCard recipe={state.recipe} />
          </>
        )}
      </div>
    </main>
  );
}

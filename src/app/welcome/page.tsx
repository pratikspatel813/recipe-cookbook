"use client";

// The landing page: what this is, in one screen, for someone who just arrived.
// First-time visitors to / are sent here once (see lib/welcome.ts).
//
// Each way into the app is tracked (landing_cta_clicked), so we can see which
// pitch works: jumping straight into saving a recipe, or browsing first.

import { useEffect, useState } from "react";
import Link from "next/link";
import { track, type EventMap } from "@/lib/analytics";
import { getMetrics, type Metrics } from "@/lib/metrics";
import { markWelcomed } from "@/lib/welcome";
import { ThemeToggle } from "@/components/ThemeToggle";

const GITHUB_URL = "https://github.com/pratikspatel813/recipe-cookbook";

export default function WelcomePage() {
  const [overview, setOverview] = useState<Metrics["overview"] | null>(null);

  useEffect(() => {
    markWelcomed();
    getMetrics().then((m) => setOverview(m.overview)).catch(() => {});
  }, []);

  const cta = (name: EventMap["landing_cta_clicked"]["cta"]) => () => track("landing_cta_clicked", { cta: name });

  return (
    <main className="mx-auto max-w-4xl px-5">
      <div className="flex items-center justify-between pt-5 text-sm">
        <span className="font-display text-lg">Cookbook</span>
        <ThemeToggle />
      </div>

      {/* ---- Hero ------------------------------------------------------- */}
      <section className="pt-14 pb-12 text-center sm:pt-20">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">A cookbook for recipes you actually make</p>
        <h1 className="mt-3 font-display text-5xl leading-tight sm:text-6xl">Just the recipe.</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Paste a link from any recipe site and get the ingredients and steps, without the ads and life stories.
          Keep everything in one cookbook. Share it with a friend in one tap.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/add" onClick={cta("start")}
                className="rounded-sm bg-accent px-6 py-2.5 font-display text-lg text-on-accent">
            Start your cookbook
          </Link>
          <Link href="/search" onClick={cta("browse")}
                className="rounded-sm border border-rule bg-page px-6 py-2.5 font-display text-lg hover:border-accent">
            Look around
          </Link>
        </div>
        <p className="mt-3 text-sm italic text-ink-soft">No account needed to start.</p>
      </section>

      <BeforeAfter />

      {/* ---- How it works ----------------------------------------------- */}
      <section className="mt-20">
        <h2 className="text-center font-display text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Paste a link", "From a site, or a recipe you found on TikTok or Instagram. Or write your own."],
            ["Keep it", "Sort recipes into chapters. Scale servings for however many you're feeding."],
            ["Share it", "Send a friend a link. They can open and save it without making an account."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-lg border border-rule bg-page p-5">
              <span className="font-display text-3xl text-accent">{i + 1}</span>
              <h3 className="mt-1 font-display text-xl">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Features --------------------------------------------------- */}
      <section className="mt-20">
        <h2 className="text-center font-display text-3xl">Also in the kitchen</h2>
        <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {[
            ["AI Kitchen", "Adapt any recipe to how you eat: no onion or garlic, vegan, gluten-free. Or describe a dish and get a new recipe."],
            ["Follow friends", "Post your own recipes to your profile and see what friends are cooking in your feed."],
            ["Search", "Find recipes by name or by what's in your fridge, and find people to follow."],
            ["Shopping links", "Link an ingredient to the exact one you buy, so friends can get it too."],
          ].map(([title, body]) => (
            <li key={title} className="border-l-2 border-accent pl-4">
              <h3 className="font-display text-lg">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- The data side ---------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-rule bg-page p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Built to be measured</p>
        <h2 className="mt-2 font-display text-3xl">A product data science project</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Every feature logs its own events against a typed tracking plan. The metrics are SQL over those events:
          import success, time to recipe, funnels, activation, K-factor, sign-up conversion and shopping-link
          click-through. They&rsquo;re live on a public dashboard.
        </p>
        {/* Live numbers only once there are some: "0 recipes saved" undersells it. */}
        {overview && overview.recipesSaved >= 10 && (
          <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              ["People", overview.users],
              ["Recipes saved", overview.recipesSaved],
              ["Visits", overview.sessions],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-rule px-2 py-3">
                <dd className="font-sans text-2xl font-semibold">{Number(value).toLocaleString()}</dd>
                <dt className="text-xs text-ink-soft">{label}</dt>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/metrics" onClick={cta("metrics")}
                className="rounded-sm bg-accent px-4 py-2 text-on-accent">
            See the live metrics
          </Link>
          <a href={GITHUB_URL} onClick={cta("github")}
             className="rounded-sm border border-rule px-4 py-2 hover:border-accent">
            Read the code on GitHub ↗
          </a>
        </div>
      </section>

      {/* ---- Last call -------------------------------------------------- */}
      <section className="py-20 text-center">
        <h2 className="font-display text-3xl">Save the next recipe you find</h2>
        <Link href="/add" onClick={cta("start")}
              className="mt-6 inline-block rounded-sm bg-accent px-6 py-2.5 font-display text-lg text-on-accent">
          Start your cookbook
        </Link>
      </section>
    </main>
  );
}

// The pitch as a picture: a typical recipe page next to the same recipe here.
// Drawn with plain boxes, so it needs no screenshots and follows the theme.
function BeforeAfter() {
  return (
    <section className="grid gap-4 sm:grid-cols-2" aria-label="A recipe website compared with the same recipe in Cookbook">
      <figure className="rounded-lg border border-rule bg-page p-4">
        <figcaption className="mb-3 text-xs uppercase tracking-[0.2em] text-ink-soft">A recipe website</figcaption>
        <div className="space-y-2 text-xs text-ink-soft" aria-hidden>
          <Block tall>Ad</Block>
          <p className="italic">Every holiday, there was one dish everyone fought over: Tini&rsquo;s mac and cheese…</p>
          <div className="h-2 w-11/12 rounded bg-rule" />
          <div className="h-2 w-4/5 rounded bg-rule" />
          <Block>Ad</Block>
          <div className="h-2 w-10/12 rounded bg-rule" />
          <div className="h-2 w-2/3 rounded bg-rule" />
          <Block>Subscribe to our newsletter!</Block>
          <p className="text-center">Jump to recipe ↓</p>
        </div>
      </figure>

      <figure className="rounded-lg border border-accent bg-page p-4 shadow-[var(--card-shadow)]">
        <figcaption className="mb-3 text-xs uppercase tracking-[0.2em] text-accent">The same recipe here</figcaption>
        <p className="font-display text-xl">Tini&rsquo;s mac and cheese</p>
        <p className="text-xs italic text-ink-soft">Serves 8 · 45 min</p>
        <ul className="mt-3 space-y-1 text-sm">
          {[
            "1 lb cavatappi pasta",
            "1 lb mozzarella, shredded",
            "1 lb Colby Jack, shredded",
            "½ lb sharp cheddar, shredded",
            "3 tbsp unsalted butter",
            "3 tbsp all-purpose flour",
            "1 can (12 oz) evaporated milk",
            "2 cups heavy cream",
            "1 tbsp Dijon mustard",
            "1 tbsp smoked paprika",
            "½ tbsp salt",
            "½ tbsp black pepper",
          ].map(
            (i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full border border-accent" />
                {i}
              </li>
            ),
          )}
        </ul>
        <p className="mt-3 text-sm text-ink-soft">
          <span className="font-display text-accent">1.</span> Boil the cavatappi for about 7 minutes, so it&rsquo;s
          still very firm…
        </p>
      </figure>
    </section>
  );
}

function Block({ children, tall }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded border border-dashed border-ink-soft/40 bg-paper ${tall ? "h-16" : "h-10"}`}>
      {children}
    </div>
  );
}

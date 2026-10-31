// POST /api/import  { "url": "https://..." }
//
// This runs on the server, not in the browser. Browsers block pages from
// reading other websites (a security rule called CORS), so the server fetches
// the recipe page for us and sends back clean JSON.

import { NextResponse } from "next/server";
import { extractRecipeFromHtml } from "@/lib/recipe";

// Why an import failed. These become the `failure_reason` property on our
// import_failed event later, so we keep them as a short fixed list we can
// GROUP BY in SQL.
type FailureReason = "invalid_url" | "fetch_failed" | "blocked" | "no_recipe_found";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const url = parseUrl(body.url);

  if (!url) return fail("invalid_url", "That doesn't look like a web address.", 400, startedAt);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        // We say honestly who we are. Pretending to be Chrome actually got us
        // blocked more often, and some sites (e.g. Allrecipes) block every
        // automated request — those will need the paste-text fallback.
        "User-Agent": "MyCookbook/0.1 (personal recipe saver)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000), // give up after 10 seconds
    });
    if (res.status === 403 || res.status === 429) {
      return fail("blocked", "That site blocked us from reading the page.", 502, startedAt);
    }
    if (!res.ok) return fail("fetch_failed", `The site responded with an error (${res.status}).`, 502, startedAt);
    html = await res.text();
  } catch {
    return fail("fetch_failed", "We couldn't reach that site.", 502, startedAt);
  }

  const recipe = extractRecipeFromHtml(html, url.toString());
  if (!recipe || recipe.ingredients.length === 0) {
    return fail("no_recipe_found", "We couldn't find a recipe on that page.", 422, startedAt);
  }

  return NextResponse.json({
    ok: true,
    recipe,
    msElapsed: Date.now() - startedAt, // feeds our "time to recipe" metric
  });
}

function fail(reason: FailureReason, message: string, status: number, startedAt: number) {
  return NextResponse.json({ ok: false, reason, message, msElapsed: Date.now() - startedAt }, { status });
}

// Only allow normal public web addresses. Without this, someone could ask our
// server to fetch internal addresses like http://localhost — a classic
// security hole called SSRF.
function parseUrl(input: unknown): URL | null {
  if (typeof input !== "string") return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname;
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.startsWith("[") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  return isPrivate ? null : url;
}

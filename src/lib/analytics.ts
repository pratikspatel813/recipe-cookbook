// Event logging. Every user action we want to measure goes through track().
//
//   track("recipe_saved", { recipe_id: "...", import_method: "url", ... })
//
// The EventMap below is our TRACKING PLAN: the complete list of events and the
// exact properties each one carries. TypeScript enforces it — misspell an
// event name or forget a property and the code won't compile. That prevents
// the most common analytics problem: messy, inconsistent event data.

import { supabase, ensureUser } from "./supabase";

export type EventMap = {
  // ---- Navigation ----
  page_viewed: { path: string; referrer_domain: string | null };

  // ---- Import funnel: started → succeeded/failed → saved ----
  import_started: { domain: string | null };
  import_succeeded: { domain: string; ms_elapsed: number; ingredient_count: number; step_count: number };
  import_failed: { domain: string | null; failure_reason: string; ms_elapsed: number | null };
  recipe_saved: {
    recipe_id: string;
    import_method: "url" | "paste" | "manual";
    domain: string | null;
    chapter_count: number;
    seconds_since_import: number; // how long they looked before deciding to save
  };

  // ---- Using the cookbook ----
  recipe_viewed: { recipe_id: string };
  // Fired the first time someone ticks an ingredient in a visit to a recipe.
  // Our best signal that they're actually COOKING, not just browsing.
  cooking_started: { recipe_id: string; ingredient_count: number };
  recipe_deleted: { recipe_id: string };
  chapter_created: { chapter_id: string; source: "add_page" | "recipe_page" };
  chapter_filtered: { chapter_id: string | null }; // null = "All recipes"
  recipe_chapter_changed: { recipe_id: string; chapter_id: string; action: "added" | "removed" };
};

export type EventName = keyof EventMap;

export function track<E extends EventName>(eventName: E, properties: EventMap[E]): void {
  // Fire and forget: tracking must NEVER break or slow down the app.
  // We don't await this, and any error is caught and only logged.
  send(eventName, properties).catch((err) => console.warn("[analytics]", eventName, err));
}

async function send(eventName: string, properties: object) {
  if (isDuplicate(eventName, properties)) return;
  await ensureUser();
  const { error } = await supabase.from("events").insert({
    event_name: eventName,
    properties,
    session_id: getSessionId(),
    page_path: window.location.pathname,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sessions: a new session starts after 30 minutes with no events.
// We keep { id, lastSeen } in the browser's localStorage.
// ---------------------------------------------------------------------------
const SESSION_KEY = "cookbook_session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function getSessionId(): string {
  const now = Date.now();
  let session: { id: string; lastSeen: number } | null = null;
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    // storage blocked (e.g. some private windows) — fall through to a new id
  }
  if (!session || now - session.lastSeen > SESSION_TIMEOUT_MS) {
    session = { id: crypto.randomUUID(), lastSeen: now };
  }
  session.lastSeen = now;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
  return session.id;
}

// ---------------------------------------------------------------------------
// Duplicate guard. React sometimes runs page code twice (always in
// development), which would log every page view twice and inflate our
// numbers. We drop an identical event sent within 2 seconds of the last one.
// Duplicate events are one of the most common data quality bugs in industry.
// ---------------------------------------------------------------------------
const recent = new Map<string, number>();

function isDuplicate(eventName: string, properties: object): boolean {
  const key = eventName + JSON.stringify(properties);
  const now = Date.now();
  const last = recent.get(key);
  recent.set(key, now);
  return last !== undefined && now - last < 2000;
}

// "https://www.nytimes.com/recipes/..." -> "nytimes.com"
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

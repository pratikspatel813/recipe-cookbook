// The connection to our database. Used from the browser.
//
// The "publishable" key is safe to put in the browser: it only lets you do
// what the Row Level Security policies in supabase/schema.sql allow.

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

// Make sure this browser has a user, creating an anonymous one on first visit.
//
// An anonymous user is a real row in auth.users (with is_anonymous = true),
// just without an email. Supabase remembers it in the browser, so you get the
// same cookbook next time. In step 5 we'll upgrade it to a real account
// when you first share — and every recipe carries over, because the user id
// never changes.
//
// The promise is cached so several components asking at once only create one user.
let userPromise: Promise<string> | null = null;
let createdThisVisit = false;

export function ensureUser(): Promise<string> {
  userPromise ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;

    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error || !signIn.user) {
      userPromise = null; // let the next call try again
      throw error ?? new Error("Could not start a session");
    }
    createdThisVisit = true;
    return signIn.user.id;
  })();
  return userPromise;
}

// True if this page load created the user — i.e. a brand-new visitor.
// Only meaningful after ensureUser() has finished.
export function isNewVisitor(): boolean {
  return createdThisVisit;
}

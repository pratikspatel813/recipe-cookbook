// Accounts: turning an anonymous user into a real one, signing in on another
// device, and signing out.
//
// We use email codes instead of passwords: Supabase emails a short code, you
// type it in. Nothing to remember, nothing to leak.

"use client";

import { useEffect, useState } from "react";
import { supabase, ensureUser, resetUser } from "./supabase";

export type Account =
  | { status: "loading" }
  | { status: "anonymous"; userId: string }
  | { status: "registered"; userId: string; email: string; displayName: string | null };

// ---- Upgrading an anonymous user (sign-up) ----------------------------------
//
// updateUser({ email }) attaches an email to the CURRENT anonymous user and
// emails a code. Once the code is confirmed, the same user id becomes a full
// account — all recipes and events stay attached.

export async function startSignUp(displayName: string, email: string) {
  const userId = await ensureUser();
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName.trim(), updated_at: new Date().toISOString() });
  if (profileError) throw profileError;

  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function finishSignUp(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email_change", // adding an email to an existing (anonymous) user
  });
  if (error) throw error;
  // Get a fresh login token, so the database sees is_anonymous = false right away.
  await supabase.auth.refreshSession();
}

// ---- Signing in on another device ---------------------------------------------

export async function startSignIn(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false }, // sign-in only; new accounts come from the share flow
  });
  if (error) throw error;
}

export async function finishSignIn(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) throw error;
  resetUser(); // this browser now belongs to a different user id
}

export async function signOut() {
  await supabase.auth.signOut();
  resetUser(); // the next visit starts a fresh anonymous user
}

// ---- Who's here? ----------------------------------------------------------------

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      await ensureUser();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || cancelled) return;
      if (user.is_anonymous || !user.email) {
        setAccount({ status: "anonymous", userId: user.id });
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      if (!cancelled) {
        setAccount({ status: "registered", userId: user.id, email: user.email, displayName: profile?.display_name ?? null });
      }
    }

    load().catch(console.error);
    // Re-check whenever someone signs in, signs out, or upgrades.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => load().catch(console.error), 0); // don't call Supabase inside its own callback
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return account;
}

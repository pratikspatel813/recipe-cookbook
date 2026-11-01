"use client";

// Sign in on another device (or after signing out): email → code → your cookbook.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { finishSignIn, startSignIn } from "@/lib/account";
import { track } from "@/lib/analytics";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await startSignIn(email);
      setStep("code");
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === "otp_disabled" || code === "user_not_found"
          ? "We couldn't find a cookbook for that email. You create one by sharing a recipe."
          : code === "over_email_send_rate_limit"
            ? "Too many emails sent. Please wait a few minutes and try again."
            : "Couldn't send the code. Check the email address and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await finishSignIn(email, code);
      track("signin_completed", {});
      router.push("/");
    } catch {
      setError("That code didn't work. Check it, or go back and send a new one.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <Link href="/" className="text-sm italic text-ink-soft hover:text-accent">
        ← Back
      </Link>
      <h1 className="mt-6 font-display text-4xl">Sign in</h1>
      <p className="mt-2 italic text-ink-soft">Open your cookbook on this device.</p>

      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-8">
          <input
            required
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="block w-full rounded-sm border border-rule bg-page px-4 py-3 outline-none focus:border-accent"
          />
          <button
            disabled={busy}
            className="mt-4 w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8">
          <p className="mb-3 text-sm italic text-ink-soft">We sent a code to {email}.</p>
          <input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="Code"
            className="block w-full rounded-sm border border-rule bg-page px-4 py-3 text-center font-display text-2xl tracking-[0.4em] outline-none focus:border-accent"
          />
          <button
            disabled={busy}
            className="mt-4 w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" onClick={() => setStep("email")} className="mt-3 text-sm italic text-ink-soft hover:text-accent">
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-accent">{error}</p>}

      <p className="mt-10 text-xs italic text-ink-soft">
        Note: recipes saved on this device before signing in stay with the old, signed-out cookbook.
      </p>
    </main>
  );
}

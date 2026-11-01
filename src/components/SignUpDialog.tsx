"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { finishSignUp, startSignUp } from "@/lib/account";
import { track } from "@/lib/analytics";

// A three-step dialog: name + email → code from your inbox → done.
// Shown when an anonymous user taps Share.
//
// The last step has its own button rather than sharing automatically: phones
// only open the share sheet straight after a tap, and by the time the code is
// checked, the original tap is long gone.

type Step = { name: "details" } | { name: "code" } | { name: "done" };

export function SignUpDialog({
  onClose,
  onDone,
  doneLabel,
}: {
  onClose: () => void;
  onDone: () => void;
  doneLabel: string;
}) {
  const [step, setStep] = useState<Step>({ name: "details" });
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    track("signup_prompted", { trigger: "share" });
  }, []);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await startSignUp(displayName, email);
      track("signup_code_sent", { trigger: "share" });
      setStep({ name: "code" });
    } catch (err) {
      const code = errorCode(err);
      track("signup_failed", { trigger: "share", step: "send_code", error_code: code });
      setError(
        code === "email_exists" ? (
          <>
            That email already has a cookbook.{" "}
            <Link href="/signin" className="underline">
              Sign in instead
            </Link>
          </>
        ) : code === "over_email_send_rate_limit" ? (
          "Too many emails sent. Please wait a few minutes and try again."
        ) : (
          "Couldn't send the code. Check the email address and try again."
        ),
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
      await finishSignUp(email, code);
      track("signup_completed", {
        trigger: "share",
        seconds_to_complete: Math.round((Date.now() - openedAt.current) / 1000),
      });
      setStep({ name: "done" });
    } catch (err) {
      track("signup_failed", { trigger: "share", step: "verify_code", error_code: errorCode(err) });
      setError("That code didn't work. Check it, or go back and send a new one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-sm border border-rule bg-page p-6 shadow-xl"
      >
        {step.name === "details" && (
          <form onSubmit={sendCode}>
            <h2 className="font-display text-2xl">Save your cookbook to share</h2>
            <p className="mt-2 text-sm italic text-ink-soft">
              Your recipes stay exactly where they are. Your friends will see your name on what you share.
            </p>
            <label className="mt-5 block text-xs uppercase tracking-widest text-ink-soft">
              Your first name
              <input
                required
                autoFocus
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-base normal-case tracking-normal text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="mt-4 block text-xs uppercase tracking-widest text-ink-soft">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-base normal-case tracking-normal text-ink outline-none focus:border-accent"
              />
            </label>
            <DialogButtons busy={busy} label="Email me a code" onCancel={onClose} />
          </form>
        )}

        {step.name === "code" && (
          <form onSubmit={verify}>
            <h2 className="font-display text-2xl">Check your email</h2>
            <p className="mt-2 text-sm italic text-ink-soft">We sent a code to {email}.</p>
            <input
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="Code"
              className="mt-5 block w-full rounded-sm border border-rule bg-paper px-3 py-2 text-center font-display text-2xl tracking-[0.4em] outline-none focus:border-accent"
            />
            <DialogButtons busy={busy} label="Confirm" onCancel={() => setStep({ name: "details" })} cancelLabel="Back" />
          </form>
        )}

        {step.name === "done" && (
          <div className="text-center">
            <h2 className="font-display text-2xl">You&apos;re all set, {displayName.trim()}!</h2>
            <p className="mt-2 text-sm italic text-ink-soft">Your cookbook is saved to {email}.</p>
            <button
              onClick={onDone}
              className="mt-5 w-full rounded-sm bg-accent px-6 py-3 font-display text-page transition hover:brightness-110"
            >
              {doneLabel}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      </div>
    </div>
  );
}

function DialogButtons({
  busy,
  label,
  onCancel,
  cancelLabel = "Not now",
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button type="button" onClick={onCancel} className="text-sm italic text-ink-soft hover:text-accent">
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={busy}
        className="rounded-sm bg-accent px-5 py-2 font-display text-page transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "…" : label}
      </button>
    </div>
  );
}

// Supabase errors carry a short machine-readable `code`. We log the code, not
// the message: codes are a fixed list we can GROUP BY; messages are free text.
// Timeouts have no code, so fall back to the HTTP status (e.g. "http_504"),
// which still groups cleanly and tells us it was the email server, not the user.
function errorCode(err: unknown): string {
  const e = err as { code?: string; status?: number; name?: string } | null;
  return e?.code ?? (e?.status ? `http_${e.status}` : e?.name) ?? "unknown";
}

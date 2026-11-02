"use client";

import { useState } from "react";
import { getOrCreateShareToken } from "@/lib/db";
import { track } from "@/lib/analytics";
import { useAccount } from "@/lib/account";
import { SignUpDialog } from "./SignUpDialog";

// On phones this opens the native share sheet (Messages, WhatsApp, ...).
// Where that isn't available, it copies the link instead. And where copying is
// blocked too (some in-app browsers), it shows the link for copying by hand.
//
// Sharing needs an account, so anonymous users see the sign-up dialog first.
export function ShareButton({ recipeId, title }: { recipeId: string; title: string }) {
  const account = useAccount();
  const [status, setStatus] = useState<"idle" | "working" | "copied" | "error">("idle");
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);

  function handleClick() {
    if (account.status === "anonymous") setShowSignUp(true);
    else share();
  }

  async function share() {
    setStatus("working");
    try {
      const { shareId, token } = await getOrCreateShareToken(recipeId);
      const url = `${window.location.origin}/s/${token}`;

      if (navigator.share) {
        try {
          await navigator.share({ title, text: `Try this recipe: ${title}`, url });
          track("recipe_shared", { recipe_id: recipeId, share_id: shareId, method: "native" });
          setStatus("idle");
        } catch (err) {
          // Closing the share sheet without picking anyone isn't a share — don't count it.
          if ((err as Error).name !== "AbortError") throw err;
          setStatus("idle");
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
      } catch {
        setManualUrl(url);
        setStatus("idle");
        track("recipe_shared", { recipe_id: recipeId, share_id: shareId, method: "link_shown" });
        return;
      }
      track("recipe_shared", { recipe_id: recipeId, share_id: shareId, method: "clipboard" });
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  const label = { idle: "Share", working: "…", copied: "Link copied ✓", error: "Try again" }[status];

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={status === "working" || account.status === "loading"}
        className="rounded-sm bg-accent px-4 py-1.5 font-display text-sm text-on-accent transition hover:brightness-110 disabled:opacity-60"
      >
        {label}
      </button>
      {manualUrl && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-sm border border-rule bg-page p-3 shadow-lg">
          <p className="mb-2 text-xs italic text-ink-soft">Copy this link and send it to a friend:</p>
          <input
            readOnly
            value={manualUrl}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-sm border border-rule bg-paper px-2 py-1 text-sm outline-none"
          />
          <button onClick={() => setManualUrl(null)} className="mt-2 text-xs italic text-ink-soft hover:text-accent">
            Close
          </button>
        </div>
      )}
      {showSignUp && (
        <SignUpDialog
          trigger="share"
          onClose={() => setShowSignUp(false)}
          doneLabel="Share this recipe"
          onDone={() => {
            setShowSignUp(false);
            share();
          }}
        />
      )}
    </div>
  );
}

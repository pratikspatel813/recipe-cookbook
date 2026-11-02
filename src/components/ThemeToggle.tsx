"use client";

// Light / dark / match the device. The choice lives in localStorage and on
// <html data-theme>, which globals.css reads. "System" removes the attribute,
// so the device setting decides.
//
// THEME_SCRIPT runs in <head> before the page paints (see layout.tsx). Without
// it, a dark-mode fan would see a flash of light page on every load while
// React starts up.

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

export type Theme = "system" | "light" | "dark";
const KEY = "theme";

export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function apply(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // Storage blocked (private window): the device setting still works.
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
    track("theme_changed", { theme: next });
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full border border-rule p-0.5 text-xs not-italic">
      {(["light", "system", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className={`rounded-full px-2.5 py-1 capitalize transition ${
            theme === t ? "bg-accent text-on-accent" : "text-ink-soft hover:text-ink"
          }`}
        >
          {t === "system" ? "Auto" : t}
        </button>
      ))}
    </div>
  );
}

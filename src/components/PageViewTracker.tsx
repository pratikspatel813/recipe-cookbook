"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { domainOf, track } from "@/lib/analytics";

// Logs page_viewed every time the URL path changes. It lives in the root
// layout, so every page gets tracked without each page remembering to do it.
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    track("page_viewed", { path: pathname, referrer_domain: domainOf(document.referrer) });
  }, [pathname]);

  return null; // renders nothing — it only tracks
}

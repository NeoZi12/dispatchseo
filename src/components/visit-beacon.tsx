"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// One POST to /api/t per page view (lib/visits.ts). Cookieless and tiny: the
// path, the query (for utm_*), and the referrer on the first page only -
// after a client-side navigation document.referrer still names the site that
// sent the visitor, which would count one referral per page. Not gated on the
// analytics consent: it stores nothing on the device and reads nothing from
// it (see lib/analytics-consent.ts for the line it sits on the right side of).
export function VisitBeacon() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!pathname) return;
    const body = JSON.stringify({
      p: pathname,
      q: window.location.search || undefined,
      r: first.current ? document.referrer || undefined : undefined,
    });
    first.current = false;
    try {
      if (!navigator.sendBeacon?.("/api/t", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/t", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
      }
    } catch {
      // A blocked beacon is a visit we don't count; nothing to do about it.
    }
  }, [pathname]);
  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// One POST to /api/t per page view (lib/visits.ts). Cookieless and tiny: the
// path, the query (for utm_*), and the referrer on the first page only -
// after a client-side navigation document.referrer still names the site that
// sent the visitor, which would count one referral per page. Not gated on the
// analytics consent: it stores nothing on the device and reads nothing from
// it (see lib/analytics-consent.ts for the line it sits on the right side of).
function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (!navigator.sendBeacon?.("/api/t", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/t", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    }
  } catch {
    // A blocked beacon is a visit we don't count; nothing to do about it.
  }
}

// What tells a person from a scraper running a real browser: automation
// frameworks set navigator.webdriver, and a person moves a mouse, turns a
// wheel, taps or types. One extra ping per page load on the first such
// event - a flag, never what was typed or where the pointer went.
const HUMAN_EVENTS = ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"] as const;

export function VisitBeacon() {
  const pathname = usePathname();
  const first = useRef(true);
  const path = useRef(pathname);
  path.current = pathname;
  useEffect(() => {
    if (!pathname) return;
    send({
      p: pathname,
      q: window.location.search || undefined,
      r: first.current ? document.referrer || undefined : undefined,
      w: navigator.webdriver ? 1 : undefined,
    });
    first.current = false;
  }, [pathname]);
  useEffect(() => {
    const onHuman = (e: Event) => {
      if (!e.isTrusted) return;
      off();
      if (path.current) send({ p: path.current, e: 1, w: navigator.webdriver ? 1 : undefined });
    };
    const off = () => HUMAN_EVENTS.forEach((t) => window.removeEventListener(t, onHuman, true));
    HUMAN_EVENTS.forEach((t) => window.addEventListener(t, onHuman, { capture: true, passive: true }));
    return off;
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

// Fades each landing section in once, the first time it scrolls into view
// (landing.css, "scroll reveal"). Renders nothing; it only adds classes:
//
//   .ld.rv            - set on mount, arms the hidden-until-seen styles. The
//                       server HTML has no .rv, so without JavaScript (or
//                       before hydration) every section is simply visible.
//   section.rv-in     - set when a section is seen; never removed, so nothing
//                       fades back out when the reader scrolls up.
//
// Sections already inside the viewport at mount are marked in the same
// synchronous pass that arms .rv, so the first screen never flashes hidden.
// The hero is a <header>, not a <section>, on purpose: it has its own entry
// animation and must never wait on an observer.
export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ld");
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("section, footer"));
    const vh = window.innerHeight;
    const pending: HTMLElement[] = [];
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add("rv-in");
      else pending.push(el);
    }
    root.classList.add("rv");
    if (pending.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("rv-in");
          io.unobserve(e.target);
        }
      },
      // Fire once ~12% of the viewport height has been crossed, so the
      // fade is under way by the time the section's heading is readable.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    for (const el of pending) io.observe(el);
    return () => io.disconnect();
  }, []);

  return null;
}

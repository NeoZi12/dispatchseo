"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

// Floating "Why DispatchSEO?" mascot explainer for the public landing page.
//
// Deliberately NOT a round chat launcher: bottom-right + a circle bubble reads
// as Intercom/live-chat and baits the visitor. Instead the resting state is a
// tilted speech-note with the pixel agent peeking over its edge and a visible
// "Why DispatchSEO?" label, so it's unmistakably a mascot aside. Opening it
// pops a card whose star is the full PixelDispatcher scene, animated.

// The clay agent's front face - the exact BODY_OPEN grid from the pixel
// dispatcher, minus the headset. Same character as the animation, drawn as
// crisp SVG rects. Sits fully inside the resting tab as a contained avatar.
const FACE = [
  "...cccccc...",
  "..cccccccc..",
  ".cccccccccc.",
  ".cccccccccc.",
  ".ccccecccec.",
  ".ccccecccec.",
  ".cccccccccc.",
  ".cCCCCCCCCc.",
  "..CCCCCCCC..",
];
const FACE_COLORS: Record<string, string> = {
  c: "#d97757",
  C: "#b0563a",
  e: "#1a1a1e",
};

function MascotFace({ className }: { className?: string }) {
  const cols = FACE[0].length;
  const rows = FACE.length;
  const rects: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = FACE[r][c];
      if (ch === ".") continue;
      rects.push(
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={FACE_COLORS[ch]} />,
      );
    }
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 ${cols} ${rows}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}

const POINTS: Array<{ icon: ReactNode; lead: string; body: string }> = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    lead: "No scraping.",
    body: "It reads your actual repo, so what it writes fits your product - not a homepage-crawl guess.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
      </svg>
    ),
    lead: "It does the busywork.",
    body: "Claude Code runs the whole SEO grind for you, so you can focus on the important things.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
    lead: "You stay in control.",
    body: "It's your agent: approve each PR, or just tell it in plain English what to change.",
  },
];

export function WhyCard() {
  const [open, setOpen] = useState(false);
  const [nearFooter, setNearFooter] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(false);

  // Escape + click-outside to dismiss.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Move focus into the card on open, restore to the trigger on close.
  useEffect(() => {
    if (open) closeRef.current?.focus();
    else if (prevOpen.current) triggerRef.current?.focus();
    prevOpen.current = open;
  }, [open]);

  // Get out of the way of the footer so the floating note never overlaps it.
  useEffect(() => {
    const footer = document.querySelector(".ld footer");
    if (!footer) return;
    const io = new IntersectionObserver(
      ([entry]) => setNearFooter(entry.isIntersecting),
      { rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (nearFooter) setOpen(false);
  }, [nearFooter]);

  return (
    <div ref={rootRef} className={`why-fab${nearFooter ? " is-hidden" : ""}`}>
      {open && (
        <div className="why-pop" role="dialog" aria-modal="false" aria-label="Why DispatchSEO?">
          <button ref={closeRef} type="button" className="why-x" onClick={() => setOpen(false)} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="why-diorama">
            <PixelDispatcher className="why-stage" working />
          </div>

          <div className="why-body">
            <h3 className="why-title">Why DispatchSEO?</h3>
            <p className="why-lead">
              It&apos;s your agent doing the SEO - the one that already knows your product.
            </p>
            <ul className="why-points">
              {POINTS.map((p) => (
                <li key={p.lead}>
                  <span className="why-ic">{p.icon}</span>
                  <span className="why-pt">
                    <b>{p.lead}</b>
                    <span className="why-pt-body">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <a className="why-cta" href="/signup">
              Start for free
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        className="why-tab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Why DispatchSEO? Open the explainer"
      >
        <MascotFace className="why-tab-face" />
        <span className="why-tab-text">
          <span className="why-tab-eyebrow">psst -</span>
          <span className="why-tab-title">Why DispatchSEO?</span>
        </span>
        <svg className="why-tab-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

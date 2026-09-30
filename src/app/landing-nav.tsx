"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Mobile-only nav for the public landing page. Below 981px the desktop link
// row and CTA cluster are hidden (they wrapped into three lines on a phone),
// so this owns every destination: sections, blog, docs, GitHub, log in, sign up.
//
// The sheet is portalled into the .ld root instead of rendering inside <nav>:
// nav sets backdrop-filter, which makes it a containing block for position:
// fixed descendants, so a panel nested inside it could only ever cover the
// 58px bar. .ld has no transform/filter, so fixed resolves to the viewport
// there, and the scoped .ld selectors + font variables still apply.

type NavLink = { href: string; label: string };

// The home page's own section anchors - the default so every existing call
// site (just page.tsx today) renders byte-identical to before this prop
// existed. Agent-specific pages (claude-code/, codex/) pass their own set.
const DEFAULT_LINKS: NavLink[] = [
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
];

type Props = { githubUrl: string; docsUrl: string; links?: NavLink[] };

export function LandingNav({ githubUrl, docsUrl, links = DEFAULT_LINKS }: Props) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".ld"));
  }, []);

  // Escape closes; the page behind the sheet stops scrolling while it's up.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Focus lands in the panel on open and returns to the burger on close.
  useEffect(() => {
    if (open) panelRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // Rotating to a desktop-width viewport hides the burger - drop the sheet
  // (and its scroll lock) instead of stranding it off-screen.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 981px)");
    function onChange() {
      if (mq.matches) setOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`nav-burger${open ? " is-open" : ""}`}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="burger-box" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>

      {open &&
        host &&
        createPortal(
          <>
            <div className="nav-scrim" onClick={close} aria-hidden="true" />
            <div
              id={panelId}
              ref={panelRef}
              tabIndex={-1}
              className="nav-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
            >
              <div className="nav-panel-links">
                {links.map((l) => (
                  <a key={l.href} href={l.href} onClick={close}>{l.label}</a>
                ))}
                <a href={docsUrl} onClick={close}>Docs</a>
                <a href={githubUrl} onClick={close}>
                  GitHub
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 17 17 7M8 7h9v9" />
                  </svg>
                </a>
              </div>
              <div className="nav-panel-cta">
                <a className="btn btn-ghost" href="/login" onClick={close}>Log in</a>
                <a className="btn btn-solid" href="/signup" onClick={close}>Start for free</a>
              </div>
            </div>
          </>,
          host,
        )}
    </>
  );
}

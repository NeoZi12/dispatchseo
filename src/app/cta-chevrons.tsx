// The double chevron on the nav's "Start for free" pill. A plain component
// (no "use client") so the server-rendered navs (page.tsx, site-nav.tsx,
// agent-landing.tsx) and the client mobile sheet (landing-nav.tsx) share it.
// Styled by .cta-chev in landing.css.
export function CtaChevrons() {
  return (
    <svg className="cta-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 17l5-5-5-5M13 17l5-5-5-5" />
    </svg>
  );
}

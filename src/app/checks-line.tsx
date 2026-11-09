/**
 * The five checks every article passes, drawn as one line the reader can
 * scan in a few seconds: five flat two-tone icons on a rail, small balls
 * streaming along the rail, one outcome at the end. Plain server markup -
 * every animation is CSS (landing.css, "checks line"), so nothing here runs
 * on the client.
 *
 * Design rules this follows (Neo, 2026-11-09): no glow, no gradients, no
 * hand-drawn wobble, no eyebrow title. Flat solid shapes, each icon its own
 * colour, tilted a few degrees alternating left/right. The icons are
 * stickers, not line art; redraw them in that spirit, not as outlines.
 * The sixth circle is the outcome - the same shape as the five checks, so
 * the line reads as one journey that ends on the reader's site.
 */

const CHECKS: { title: string; sub: string; icon: React.ReactNode }[] = [
  {
    title: "Search volume",
    sub: "Real demand, winnable difficulty",
    // chunky magnifier with a bar chart inside the lens
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="27" cy="27" r="19" fill="#fbcfe8" />
        <circle cx="27" cy="27" r="19" fill="none" stroke="#f472b6" strokeWidth="5" />
        <path d="M41 41 L55 55" stroke="#f472b6" strokeWidth="7" strokeLinecap="round" />
        <rect x="17" y="28" width="5" height="9" rx="1.5" fill="#be185d" />
        <rect x="24.5" y="22" width="5" height="15" rx="1.5" fill="#be185d" />
        <rect x="32" y="16" width="5" height="21" rx="1.5" fill="#be185d" />
      </svg>
    ),
  },
  {
    title: "Fact-checked",
    sub: "Every claim traced to a source",
    // page with a check badge sitting on its corner
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M14 6 H38 L48 16 V56 H14 Z" fill="#d1fae5" />
        <path d="M38 6 V16 H48 Z" fill="#6ee7b7" />
        <rect x="20" y="24" width="20" height="3.5" rx="1.75" fill="#059669" />
        <rect x="20" y="32" width="22" height="3.5" rx="1.75" fill="#059669" />
        <rect x="20" y="40" width="14" height="3.5" rx="1.75" fill="#059669" />
        <circle cx="47" cy="47" r="12" fill="#22c55e" />
        <path d="M41 47.5 L45.5 52 L53.5 42.5" fill="none" stroke="#052e16" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "No AI slop",
    sub: "No templates, no filler, no stuffing",
    // a little robot head inside a "no" sign
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="30.5" y="12" width="3" height="8" rx="1.5" fill="#a1a1aa" />
        <circle cx="32" cy="11" r="3" fill="#a1a1aa" />
        <rect x="18" y="20" width="28" height="24" rx="6" fill="#d4d4d8" />
        <rect x="24" y="27" width="6" height="7" rx="2" fill="#3f3f46" />
        <rect x="34" y="27" width="6" height="7" rx="2" fill="#3f3f46" />
        <rect x="26" y="38" width="12" height="2.5" rx="1.25" fill="#71717a" />
        <circle cx="32" cy="32" r="25" fill="none" stroke="#f87171" strokeWidth="5" />
        <path d="M14.5 14.5 L49.5 49.5" stroke="#f87171" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Built to rank",
    sub: "Structured for Google search",
    // podium, star on first place
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="6" y="34" width="17" height="22" rx="3" fill="#93c5fd" />
        <rect x="41" y="40" width="17" height="16" rx="3" fill="#93c5fd" />
        <rect x="23" y="22" width="18" height="34" rx="3" fill="#3b82f6" />
        <path d="M32 4 l3.2 6.6 7.3 1 -5.3 5.1 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.3 -5.1 7.3 -1z" fill="#fbbf24" />
      </svg>
    ),
  },
  {
    title: "Cited by AI",
    sub: "Shaped for ChatGPT, Claude, Perplexity",
    // two speech bubbles, the front one carries a spark
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M6 10 h34 a7 7 0 0 1 7 7 v12 a7 7 0 0 1 -7 7 h-18 l-8 7 v-7 h-8 a7 7 0 0 1 -7 -7 v-12 a7 7 0 0 1 7 -7z" fill="#ddd6fe" />
        <circle cx="16" cy="23" r="2.6" fill="#7c3aed" />
        <circle cx="24.5" cy="23" r="2.6" fill="#7c3aed" />
        <circle cx="33" cy="23" r="2.6" fill="#7c3aed" />
        <path d="M24 28 h27 a7 7 0 0 1 7 7 v12 a7 7 0 0 1 -7 7 h-8 v7 l-8 -7 h-11 a7 7 0 0 1 -7 -7 v-12 a7 7 0 0 1 7 -7z" fill="#8b5cf6" />
        <path d="M38 32.5 c.8 5.6 2.6 7.4 8.2 8.2 c-5.6 .8 -7.4 2.6 -8.2 8.2 c-.8 -5.6 -2.6 -7.4 -8.2 -8.2 c5.6 -.8 7.4 -2.6 8.2 -8.2z" fill="#fff" />
      </svg>
    ),
  },
  {
    title: "Zero effort",
    sub: "Live on your site, nothing to approve",
    // the outcome: a solid green check
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="#4ade80" />
        <path d="M19 33 L28 42 L46 23" fill="none" stroke="#052e16" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

/** One ball with two fading trailing dots. It runs the whole rail left to
 *  right, through every circle in order, then starts over. */
function Balls() {
  return (
    <div className="ck-track" aria-hidden="true">
      <span className="ck-ball t2" />
      <span className="ck-ball t1" />
      <span className="ck-ball">
        <i />
      </span>
    </div>
  );
}

export function ChecksLine() {
  return (
    <>
      <div className="ck-line">
        <Balls />
        {CHECKS.map((c) => (
          <div className="ck-st" key={c.title}>
            <div className="ck-disc">{c.icon}</div>
            <h3>{c.title}</h3>
            <p>{c.sub}</p>
          </div>
        ))}
      </div>
    </>
  );
}

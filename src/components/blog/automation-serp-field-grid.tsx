// The actual organic page-1 results for "seo automation software free",
// pulled live via check_serp during the session that wrote this guide - real
// positions, domains, and titles, not a paraphrase. Positions 1, 3, and 4 are
// omitted because DataForSEO returned them as non-organic (ad/video/PAA)
// blocks, not because they were skipped.

function ListicleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function VendorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M3 9.5v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9" />
      <path d="M9 19.5v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5" />
    </svg>
  );
}

const ICONS = { listicle: <ListicleIcon />, vendor: <VendorIcon /> } as const;

const ROWS = [
  { pos: 2, domain: "marketermilk.com", kind: "listicle" as const, label: '"13 best SEO automation tools I\'m using in 2026"' },
  { pos: 5, domain: "wpseoai.com", kind: "listicle" as const, label: '"19 SEO Automation Tools for Better Rankings in 2026"' },
  { pos: 6, domain: "nytroseo.com", kind: "vendor" as const, label: '"Nytro SEO Automated Software | Best SEO Automation Tool"' },
  { pos: 7, domain: "seocrawl.ai", kind: "vendor" as const, label: '"SEO Automation Software: Monitor, Track & Report"' },
  { pos: 8, domain: "seoreviewtools.com", kind: "vendor" as const, label: '"#1 Free SEO & AI Tools → SEO Review Tools"' },
  { pos: 9, domain: "cmswire.com", kind: "listicle" as const, label: '"The Best Free SEO Tools Every Marketer Needs in 2026"' },
  { pos: 10, domain: "eesel.ai", kind: "listicle" as const, label: '"I tested dozens of free SEO AI tools in 2026. Here are the 6…"' },
] as const;

export function AutomationSerpFieldGrid() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-neutral-900">
      {ROWS.map((r, i) => (
        <div
          key={r.pos}
          className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-neutral-800/70" : ""}`}
        >
          <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">
            {r.pos}
          </span>
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              r.kind === "vendor" ? "bg-cyan-400/10 text-cyan-300" : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {ICONS[r.kind]}
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-neutral-100">{r.domain}</p>
            <p className="truncate text-xs text-neutral-500">{r.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

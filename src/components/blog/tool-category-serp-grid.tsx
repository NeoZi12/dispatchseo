// The actual organic page-1 results for "best seo automation tools", pulled
// live via check_serp during the session that wrote this guide - real
// positions, domains, and titles, grouped by what kind of result each one
// is. Position 1 and 8 are omitted because DataForSEO returned them as a
// non-organic block (ad/PAA), not because they were skipped.

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

function ForumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 5h16v11H8l-4 4V5Z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}

function DirectoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3.5" y="4.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="4.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="14.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="14.5" width="7" height="7" rx="1" />
    </svg>
  );
}

const ICONS = {
  listicle: <ListicleIcon />,
  vendor: <VendorIcon />,
  forum: <ForumIcon />,
  directory: <DirectoryIcon />,
} as const;

const COLORS = {
  listicle: "bg-neutral-800 text-neutral-400",
  vendor: "bg-amber-400/10 text-amber-300",
  forum: "bg-neutral-800 text-neutral-400",
  directory: "bg-neutral-800 text-neutral-400",
} as const;

const ROWS = [
  { pos: 2, domain: "marketermilk.com", kind: "listicle" as const, label: '"13 best SEO automation tools I\'m using in 2026"' },
  { pos: 3, domain: "gumloop.com", kind: "vendor" as const, label: '"SEO automation made simple with AI agents"' },
  { pos: 4, domain: "siteimprove.com", kind: "vendor" as const, label: '"Unlocking the Power of SEO Automation and Optimization..."' },
  { pos: 5, domain: "morningscore.io", kind: "listicle" as const, label: '"The 20 best SEO tools in 2026? I personally tested all tools"' },
  { pos: 6, domain: "reddit.com", kind: "forum" as const, label: '"What SEO tool is best for automating SEO articles?"' },
  { pos: 7, domain: "onelittleweb.com", kind: "listicle" as const, label: '"I Tested 40+ AI SEO Tools. These 15 Actually Work (2026)"' },
  { pos: 9, domain: "rabbitseo.com", kind: "vendor" as const, label: '"How to Choose the Best SEO Automation Tool (2026 Guide)"' },
  { pos: 10, domain: "zapier.com", kind: "listicle" as const, label: '"The 11 Best SEO Tools in 2026"' },
  { pos: 11, domain: "g2.com", kind: "directory" as const, label: '"Best SEO Tools: User Reviews from August 2026"' },
] as const;

export function ToolCategorySerpGrid() {
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
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${COLORS[r.kind]}`}>
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

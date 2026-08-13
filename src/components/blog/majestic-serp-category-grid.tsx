// The actual organic page-1 results for "majestic seo alternative", pulled
// live via check_serp during the session that wrote this guide - real
// positions and domains, not a paraphrase of the research pass. Majestic's
// own homepage (position 4) is excluded: it isn't an alternative to itself.
// Of the eight results that remain, only techradar.com is a recognized
// major publisher; the other seven are small SEO-niche sites and single-tool
// pitch pages, all reviewing the same kind of product Majestic already is.

function ListicleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function PublisherIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h10M7 16h6" />
    </svg>
  );
}

const RESULTS = [
  { pos: 2, domain: "thenovalab.com", kind: "listicle" as const, note: "\"8 Best Free Majestic SEO Alternatives for Backlinks\"" },
  { pos: 3, domain: "madx.digital", kind: "listicle" as const, note: "\"10 Best Majestic SEO Alternatives in 2026 (Free & Paid)\"" },
  { pos: 5, domain: "therankmasters.com", kind: "listicle" as const, note: "\"9 Best Majestic Alternatives (Budget to Pro)\"" },
  { pos: 6, domain: "keywordkick.com", kind: "listicle" as const, note: "single-tool pitch: cheaper backlink data" },
  { pos: 7, domain: "zeo.org", kind: "listicle" as const, note: "a review of Majestic itself, not an alternative" },
  { pos: 8, domain: "adspyder.io", kind: "listicle" as const, note: "\"Top Majestic Alternatives\"" },
  { pos: 9, domain: "techradar.com", kind: "publisher" as const, note: "a review of Majestic itself - the one major outlet present" },
  { pos: 10, domain: "getspike.ai", kind: "listicle" as const, note: "\"5 Backlink Tools Compared\"" },
] as const;

export function MajesticSerpCategoryGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {RESULTS.map((r) => (
        <div key={r.domain} className="flex gap-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              r.kind === "publisher" ? "bg-amber-300/10 text-amber-300" : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {r.kind === "publisher" ? <PublisherIcon /> : <ListicleIcon />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate font-mono text-sm text-neutral-100">{r.domain}</p>
              <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-500">#{r.pos}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">{r.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

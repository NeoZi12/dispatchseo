// The actual page-1 organic field for "long tail pro alternative", pulled
// live via check_serp during the session that wrote this guide - real
// positions, real domains, not paraphrased from another roundup's summary.
// Two forum threads asking the same doubt, two software-directory listings,
// one video review, the vendor's own homepage, and three blog listicles -
// nine results, none of them a workflow that continues past the list.

function ForumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.32-.27-3.32-.75L4 21l1.3-5.05A8.5 8.5 0 1 1 21 12Z" />
    </svg>
  );
}

function DirectoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="m21 8-4 3 4 3V8Z" />
    </svg>
  );
}

function VendorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function ListicleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

const ICONS = {
  forum: <ForumIcon />,
  directory: <DirectoryIcon />,
  video: <VideoIcon />,
  vendor: <VendorIcon />,
  listicle: <ListicleIcon />,
} as const;

const COLORS = {
  forum: "bg-amber-300/10 text-amber-300",
  directory: "bg-sky-400/10 text-sky-300",
  video: "bg-red-400/10 text-red-400",
  vendor: "bg-violet-500/10 text-violet-400",
  listicle: "bg-neutral-800 text-neutral-400",
} as const;

const ROWS = [
  { pos: 2, domain: "reddit.com", kind: "forum" as const, label: "r/SEO: \"Longtailpro - is it in business anymore?\"" },
  { pos: 3, domain: "softwareadvice.ie", kind: "directory" as const, label: "\"Long Tail Pro alternatives and related software\"" },
  { pos: 4, domain: "quora.com", kind: "forum" as const, label: "\"Are there any better alternatives to using Long Tail Pro?\"" },
  { pos: 5, domain: "softwareworld.co", kind: "directory" as const, label: "\"Top Long Tail Pro Alternatives & Competitors 2026\"" },
  { pos: 6, domain: "youtube.com", kind: "video" as const, label: "\"Longtail Pro Review: All In One Keyword Research Tool?\"" },
  { pos: 7, domain: "longtail.pro", kind: "vendor" as const, label: "The vendor's own homepage" },
  { pos: 8, domain: "topicfinder.com", kind: "listicle" as const, label: "\"11 Alternatives to Long Tail Pro: Find Easy to Rank Keywords\"" },
  { pos: 9, domain: "blog.hubspot.com", kind: "listicle" as const, label: "\"Top 15 Tools For Finding Long-Tail Keywords\"" },
  { pos: 10, domain: "shoutmeloud.com", kind: "listicle" as const, label: "\"7 Best Tools For Finding Long Tail Keywords\"" },
] as const;

export function LtpSerpFieldGrid() {
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

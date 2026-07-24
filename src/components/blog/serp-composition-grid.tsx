// The actual page-1 organic results for "ahrefs alternative", pulled live
// via check_serp during the session that wrote this guide - real positions,
// real domains, not a paraphrase of another post's SERP summary. Two forum
// threads and a video sit among seven near-identical vendor listicles; none
// of the ten names a self-hosted or agent-driven option.

function ForumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.32-.27-3.32-.75L4 21l1.3-5.05A8.5 8.5 0 1 1 21 12Z" />
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

function ListicleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

const ICONS = { forum: <ForumIcon />, video: <VideoIcon />, listicle: <ListicleIcon /> } as const;

const ROWS = [
  { pos: 2, domain: "reddit.com", kind: "forum" as const, label: "r/SEO thread: \"Ahref's cheaper alternative?\"" },
  { pos: 3, domain: "seranking.com", kind: "listicle" as const, label: "\"10+ Best Ahrefs Alternatives\"" },
  { pos: 5, domain: "mangools.com", kind: "listicle" as const, label: "\"The Best Free Ahrefs Alternative\"" },
  { pos: 6, domain: "link-assistant.com", kind: "listicle" as const, label: "\"I've Tested 6 Ahrefs Alternatives\"" },
  { pos: 7, domain: "zapier.com", kind: "listicle" as const, label: "\"The 8 best Ahrefs alternatives\"" },
  { pos: 8, domain: "backlinko.com", kind: "listicle" as const, label: "\"7 Best Ahrefs Alternatives\"" },
  { pos: 10, domain: "youtube.com", kind: "video" as const, label: "\"This Free SEO Tool is a Game Changer\"" },
  { pos: 11, domain: "behindrankings.com", kind: "listicle" as const, label: "\"Why I Ditched Ahrefs\"" },
  { pos: 13, domain: "reddit.com", kind: "forum" as const, label: "r/SEO: \"affordable alternatives for exporting backlinks\"" },
  { pos: 14, domain: "saagasolve.com", kind: "listicle" as const, label: "\"11 Tools That Actually Work\"" },
] as const;

export function SerpCompositionGrid() {
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
              r.kind === "forum"
                ? "bg-amber-300/10 text-amber-300"
                : r.kind === "video"
                  ? "bg-sky-400/10 text-sky-300"
                  : "bg-neutral-800 text-neutral-400"
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

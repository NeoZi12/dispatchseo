// This project's own get_ai_visibility numbers, pulled live on 2026-10-06
// while writing the guide: how many answers were checked, how many named
// dispatchseo.com, and the domains cited instead (the part a score alone
// never shows).

import { StatRow, BigStatTile } from "@/components/ui";

const GAP = [
  { domain: "youtube.com", count: 123 },
  { domain: "github.com", count: 45 },
  { domain: "code.claude.com", count: 38 },
  { domain: "reddit.com", count: 36 },
  { domain: "chatseo.app", count: 20 },
  { domain: "mindstudio.ai", count: 20 },
] as const;

export function GeoOwnCitationCheckCard() {
  const max = GAP[0].count;
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">dispatchseo.com, named as a source</h3>
        <div className="mt-3">
          <StatRow cols={2}>
            <BigStatTile title="Claude" value="1 of 93" sub="93 answers checked, 93 had an AI answer" />
            <BigStatTile title="Google AI Overview" value="0 of 91" sub="90 of 91 queries returned an overview" />
          </StatRow>
        </div>
        <p className="mt-3 text-xs text-neutral-500">get_ai_visibility, 2026-10-06. Checks logged since 2026-08-24.</p>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Cited instead, by answer count</h3>
        <ul className="mt-3 space-y-2">
          {GAP.map((g) => (
            <li key={g.domain} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate font-mono text-neutral-100">{g.domain}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <span className="block h-full rounded-full bg-emerald-400/70" style={{ width: `${(g.count / max) * 100}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400">{g.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

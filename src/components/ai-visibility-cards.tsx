// Shared AI visibility (GEO) building blocks used by both Home's compact
// teaser (dashboard/ai-visibility-section.tsx) and the full /ai page. Same
// pattern as seo-cards.tsx: presentational pieces, both surfaces render off
// the same getAiVisibility() data so they never drift apart.

import type { AiVisibility } from "@/lib/ai-visibility";

// Ground-truth engine (real SERP data) first, then the agent-sampled ones in
// the order they're recorded.
export const ENGINE_ORDER = ["google_ai_overview", "claude", "chatgpt", "perplexity", "gemini"];

export function engineRank(engine: string): number {
  const i = ENGINE_ORDER.indexOf(engine);
  return i === -1 ? ENGINE_ORDER.length : i;
}

export function sortEngines(engines: AiVisibility["engines"]): AiVisibility["engines"] {
  return [...engines].sort((a, b) => engineRank(a.engine) - engineRank(b.engine));
}

// Colors for a citation rate that is actually above zero. Zero never gets a
// color from here - EngineValue below renders it as an amber "0 of N"
// opportunity, and red stays reserved for an actual decline (visible in the
// trend line), not for the baseline every new site starts at.
export function pctColor(pct: number): string {
  if (pct >= 40) return "text-emerald-400";
  return "text-amber-300";
}

// An engine's headline number, three states:
//   no AI answers seen  -> dim dash (nothing to win yet on these queries)
//   answers, none cite  -> amber "0 of N" - N answers exist to be won; a
//                          brand-new site starts here by definition, so it
//                          reads as the starting line, not a failure
//   cited > 0           -> the citation percentage, colored by pctColor
export function EngineValue({ e }: { e: AiVisibility["engines"][number] }) {
  if (e.ai_answers === 0) return <span className="text-neutral-600">–</span>;
  if (e.cited === 0) {
    return (
      <span className="text-amber-300">
        0<span className="text-base font-normal text-neutral-500"> of {e.ai_answers}</span>
      </span>
    );
  }
  return <span className={pctColor(e.cited_pct ?? 0)}>{e.cited_pct}%</span>;
}

// The matching one-line explanation under the number.
export function engineSub(e: AiVisibility["engines"][number]): string {
  if (e.ai_answers === 0) return `${plural(e.checked, "query")} checked · no AI answer shown yet`;
  if (e.cited === 0)
    return `${plural(e.ai_answers, "AI answer")} found for your keywords - none cite you yet`;
  return `cited in ${e.cited} of ${plural(e.ai_answers, "AI answer")} · ${plural(e.checked, "query")} checked`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// The cited / not-cited / no-answer badge - same three states everywhere this
// shows up (Home's old inline list, the /ai query log).
export function AnswerStatus({ a }: { a: { has_ai_answer: boolean; cited: boolean } }) {
  return (
    <span
      className={`shrink-0 text-xs font-medium ${
        a.cited ? "text-emerald-400" : a.has_ai_answer ? "text-amber-300" : "text-neutral-500"
      }`}
    >
      {a.cited ? "cited" : a.has_ai_answer ? "not cited" : "no AI answer"}
    </span>
  );
}

// A line+area chart of citation rate over time. "compact" is Home's teaser
// size; "full" is the same chart drawn larger with an axis and every point
// marked, for the /ai page.
export function CitationTrend({
  trend,
  variant = "compact",
}: {
  trend: AiVisibility["trend"];
  variant?: "compact" | "full";
}) {
  const pts = trend.filter((d) => d.checked > 0);
  if (pts.length < 2) {
    return (
      <p className="text-sm text-neutral-500">
        Not enough days with an AI answer yet to chart a trend.
      </p>
    );
  }

  const full = variant === "full";
  const W = full ? 720 : 640;
  const H = full ? 220 : 120;
  const PAD = full ? { t: 16, r: 16, b: 26, l: 34 } : { t: 10, r: 10, b: 22, l: 10 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const rates = pts.map((d) => (d.cited / d.checked) * 100);
  const x = (i: number) => PAD.l + (i * innerW) / (pts.length - 1);
  const y = (v: number) => PAD.t + (1 - v / 100) * innerH;

  const xs = pts.map((_, i) => x(i));
  const linePoints = xs.map((xx, i) => `${xx.toFixed(1)},${y(rates[i]).toFixed(1)}`).join(" L");
  const linePath = `M${linePoints}`;
  const areaPath = `M${xs[0].toFixed(1)},${(H - PAD.b).toFixed(1)} L${linePoints} L${xs[xs.length - 1].toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;

  const last = rates[rates.length - 1];
  const mid = full && pts.length > 2 ? Math.floor((pts.length - 1) / 2) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Citation rate from ${shortDate(pts[0].date)} to ${shortDate(pts[pts.length - 1].date)}, now ${Math.round(last)}%`}
    >
      {[0, 50, 100].map((lvl) => (
        <line
          key={lvl}
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(lvl)}
          y2={y(lvl)}
          stroke="#404040"
          strokeWidth="1"
          strokeDasharray="3 5"
          opacity="0.5"
        />
      ))}
      {full
        ? [0, 50, 100].map((lvl) => (
            <text
              key={lvl}
              x={PAD.l - 8}
              y={y(lvl) + 3.5}
              textAnchor="end"
              fontSize="11"
              fill="#737373"
              fontFamily="var(--font-geist-mono)"
            >
              {lvl}%
            </text>
          ))
        : null}
      <path d={areaPath} fill="#34d399" opacity="0.12" />
      <path
        d={linePath}
        fill="none"
        strokeWidth="2"
        className="stroke-emerald-400"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {full
        ? xs.map((xx, i) => (
            <circle key={i} cx={xx} cy={y(rates[i])} r="2.5" className="fill-emerald-400" opacity="0.6" />
          ))
        : null}
      <circle cx={xs[xs.length - 1]} cy={y(last)} r={full ? 4 : 3} className="fill-emerald-400" />
      <text x={PAD.l} y={H - 6} fontSize="11" fill="#737373" fontFamily="var(--font-geist-mono)">
        {shortDate(pts[0].date)}
      </text>
      {mid != null ? (
        <text
          x={xs[mid]}
          y={H - 6}
          textAnchor="middle"
          fontSize="11"
          fill="#737373"
          fontFamily="var(--font-geist-mono)"
        >
          {shortDate(pts[mid].date)}
        </text>
      ) : null}
      <text
        x={W - PAD.r}
        y={H - 6}
        textAnchor="end"
        fontSize="11"
        fill="#737373"
        fontFamily="var(--font-geist-mono)"
      >
        {shortDate(pts[pts.length - 1].date)}
      </text>
    </svg>
  );
}

// The gap list: domains AI names instead of this site. `limit` trims it for
// Home's teaser; the /ai page passes the full set (getAiVisibility already
// caps it at 8 - the actionable head of the list, not a wall of domains).
export function GapDomains({
  domains,
  limit,
}: {
  domains: AiVisibility["gap_domains"];
  limit?: number;
}) {
  const shown = limit ? domains.slice(0, limit) : domains;
  if (shown.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No gaps caught yet - every AI answer that named a source named you too.
      </p>
    );
  }
  const max = Math.max(...shown.map((d) => d.count));
  return (
    <ol className="space-y-2.5">
      {shown.map((d, i) => (
        <li key={d.domain} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-right text-xs tabular-nums text-neutral-600">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-neutral-200">{d.domain}</span>
              <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                {plural(d.count, "query")}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-amber-400/70"
                style={{ width: `${Math.max(6, (d.count / max) * 100)}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

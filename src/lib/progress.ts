import { db } from "./db";
import type { Project } from "./projects";
import type { AnalyticsOverview } from "./analytics-data";

// The weekly strip (docs/DASHBOARD_PROGRESS.md): leading indicators with real
// week-over-week deltas, composed into plain-English pieces HERE so the Home
// card and get_overview always say the same thing. The honesty rule: a metric
// appears only when it genuinely moved - an empty `lines` means a quiet week,
// and the UI says so instead of padding.
//
// Two deliberate absences:
// - DR movement ("DR 12 -> 13"). domain_ratings stores only the latest
//   snapshot (it's a 24h cache, not a history), so the delta cannot be
//   derived honestly yet.
// - Calendar weeks for GSC numbers. GSC data lags 2-3 days, so "last 7
//   calendar days vs prior" would always undercount the recent week and
//   manufacture a permanent downtrend. We compare the newest 14 DATA days
//   split in half instead - equal windows, honest delta.

export type WeeklyProgress = {
  guides_shipped: number;
  tools_shipped: number;
  newly_indexed: number;
  keywords_added: number;
  impressions: { last7: number; prior7: number };
  clicks: { last7: number; prior7: number };
  has_comparison: boolean; // false until 14 days of GSC data exist
  // Ready-to-render plain-English pieces, movers only. Empty = quiet week.
  lines: string[];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const pctLine = (name: string, last7: number, prior7: number): string | null => {
  if (prior7 > 0) {
    const pct = Math.round(((last7 - prior7) / prior7) * 100);
    // Single-digit swings on small SEO numbers are noise, not movement.
    if (Math.abs(pct) < 5) return null;
    return `${name} ${pct > 0 ? "+" : ""}${pct}%`;
  }
  if (last7 > 0) return `first ${name} arrived - ${last7} this week`;
  return null;
};

export function computeWeeklyProgress(
  overview: AnalyticsOverview,
  keywordsAdded: number,
): WeeklyProgress {
  const weekAgo = Date.now() - 7 * 86400000;
  const inLast7 = (iso: string | null | undefined) =>
    iso != null && new Date(iso).getTime() >= weekAgo;

  const guidesShipped = overview.guides.filter((p) => inLast7(p.published_at)).length;
  const toolsShipped = overview.tools.filter((p) => inLast7(p.published_at)).length;
  const newlyIndexed = [...overview.guides, ...overview.tools].filter((p) =>
    inLast7(p.indexed_at),
  ).length;

  const sum = (rows: typeof overview.gscDaily, k: "clicks" | "impressions") =>
    rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const last14 = overview.gscDaily.slice(-14);
  const hasComparison = last14.length === 14;
  const recent = last14.slice(-7);
  const prior = last14.slice(0, -7);
  const impressions = { last7: sum(recent, "impressions"), prior7: sum(prior, "impressions") };
  const clicks = { last7: sum(recent, "clicks"), prior7: sum(prior, "clicks") };

  const lines: string[] = [];
  if (guidesShipped > 0) lines.push(`${plural(guidesShipped, "guide")} shipped`);
  if (toolsShipped > 0) lines.push(`${plural(toolsShipped, "tool")} shipped`);
  if (hasComparison) {
    const imp = pctLine("impressions", impressions.last7, impressions.prior7);
    if (imp) lines.push(imp);
    const clk = pctLine("clicks", clicks.last7, clicks.prior7);
    if (clk) lines.push(clk);
  }
  if (newlyIndexed > 0) lines.push(`${plural(newlyIndexed, "page")} newly indexed`);
  if (keywordsAdded > 0) lines.push(`${plural(keywordsAdded, "new keyword")} tracked`);

  return {
    guides_shipped: guidesShipped,
    tools_shipped: toolsShipped,
    newly_indexed: newlyIndexed,
    keywords_added: keywordsAdded,
    impressions,
    clicks,
    has_comparison: hasComparison,
    lines,
  };
}

export async function getWeeklyProgress(
  project: Project,
  overview: AnalyticsOverview,
): Promise<WeeklyProgress> {
  // Keywords that started tracking this week - the one input the overview
  // doesn't carry (its keyword rows omit created_at). Error-tolerant: a
  // failed count reads as 0, never a dead page.
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count, error } = await db()
    .from("keywords")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .gte("created_at", since);
  return computeWeeklyProgress(overview, error ? 0 : (count ?? 0));
}

import type { AutopilotArticle, AutopilotArticleStatus } from "@/lib/autopilot/report";
import type { StatusTone } from "@/components/ui/status-pill";

// The writer's statuses in the owner's words, with the tone each one gets.
// Shared by the report and the Articles screen so a status never reads two
// ways in two places. Four colours, one meaning each: green = live, violet
// = being written, amber = waiting on you, red = stopped. The word always
// sits next to the colour. `attention` marks the ones that wait on the owner.
export const ARTICLE_STATUS: Record<AutopilotArticleStatus, { label: string; tone: StatusTone; live?: boolean; attention?: boolean }> = {
  writing: { label: "Writing now", tone: "active", live: true },
  verifying: { label: "Checking facts", tone: "active", live: true },
  scheduled: { label: "Publishing", tone: "active" },
  needs_setup: { label: "Needs setup", tone: "warn", attention: true },
  published: { label: "Live", tone: "ok" },
  failed: { label: "Stopped", tone: "danger" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Oct 21" - UTC, so server and reader agree. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Thursday, Oct 24" - or "today" / "tomorrow" when it is. */
export function dayDate(iso: string, now: number): string {
  const d = new Date(iso);
  const day = Math.floor(d.getTime() / 86_400_000) - Math.floor(now / 86_400_000);
  if (day <= 0) return "today";
  if (day === 1) return "tomorrow";
  return `${DAYS[d.getUTCDay()]}, ${shortDate(iso)}`;
}

/** The date that matters for an article: when it went live, else when it
 *  was started. */
export function articleDate(a: Pick<AutopilotArticle, "publishedAt" | "createdAt">): string {
  return a.publishedAt ?? a.createdAt;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Which PIPELINE step (components/ui/pipeline-steps) an in-progress article
 *  is on, or null when it isn't in progress. A run in flight reports its
 *  writer stage (pick counts as research: choosing the topic is the first
 *  thing the research step does); a finished draft on its way out is
 *  publishing. */
export function articleStep(a: Pick<AutopilotArticle, "status" | "stage">): number | null {
  if (a.status === "scheduled") return 4;
  if (a.status !== "writing" && a.status !== "verifying") return null;
  switch (a.stage) {
    case "pick":
    case "research":
      return 0;
    case "plan":
      return 1;
    case "write":
      return 2;
    case "verify":
      return 3;
    default:
      return a.status === "verifying" ? 3 : 0;
  }
}

/** Articles the writer is working on right now, newest first. */
export function inProgress<T extends Pick<AutopilotArticle, "status" | "stage">>(articles: T[]): T[] {
  return articles.filter((a) => articleStep(a) != null);
}

/** The status word for one article. Anything the writer is working on reads
 *  "In progress" (owner, 2026-10-24: one plain word, everywhere an article
 *  is in flight); which step it's on is said by stepLine() and the stepper,
 *  where there's room for it. */
export function statusLabel(a: Pick<AutopilotArticle, "status" | "stage"> & Partial<Pick<AutopilotArticle, "prUrl" | "prMerged">>): string {
  // A repo article whose pull request is still open is not "in progress" on
  // our side - it waits on a merge, and saying so is the difference between
  // an owner who merges and one who waits forever (audit H1).
  if (waitingOnMerge(a)) return "Waiting for a merge";
  return articleStep(a) == null ? ARTICLE_STATUS[a.status].label : "In progress";
}

/** A scheduled repo article whose pull request is open and unmerged. */
export function waitingOnMerge(a: Pick<AutopilotArticle, "status"> & Partial<Pick<AutopilotArticle, "prUrl" | "prMerged">>): boolean {
  return a.status === "scheduled" && Boolean(a.prUrl) && !a.prMerged;
}

const STEP_LINE = [
  "The writer is researching the topic now, reading what already ranks on Google.",
  "The writer is planning the article now: its angle, and what it adds that Google's top results don't.",
  "The writer is writing it now.",
  "The writer is checking facts now. It publishes once every fact checks out.",
  "It's written and checked, and going out to your site now.",
];

/** One plain sentence for where an in-progress article is. */
export function stepLine(step: number): string {
  return STEP_LINE[Math.max(0, Math.min(STEP_LINE.length - 1, step))];
}

/** "Oct 21, 2026" - UTC, so server and reader agree. */
export function longDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** The article list's sort orders, in plain words (?sort= in the URL). Three
 *  on purpose: the ones an owner actually asks - what's new, what works,
 *  what ranks. */
export const ARTICLE_SORTS = [
  { key: "newest", label: "Newest" },
  { key: "clicks", label: "Most clicks" },
  { key: "best", label: "Best on Google" },
] as const;
export type ArticleSort = (typeof ARTICLE_SORTS)[number]["key"];

export function parseSort(v: string | undefined): ArticleSort {
  return ARTICLE_SORTS.find((s) => s.key === v)?.key ?? "newest";
}

/** Articles that aren't live have no Google numbers, so under "Most clicks"
 *  and "Best on Google" they sort after every live one, newest first. */
export function sortArticles<T extends Pick<AutopilotArticle, "createdAt" | "status" | "clicks28d" | "position">>(list: T[], sort: ArticleSort): T[] {
  const t = (a: T) => Date.parse(a.createdAt);
  const newest = (a: T, b: T) => t(b) - t(a);
  const by = (metric: (a: T) => number | null, dir: 1 | -1) => (a: T, b: T) => {
    const ma = a.status === "published" ? metric(a) : null;
    const mb = b.status === "published" ? metric(b) : null;
    if (ma == null && mb == null) return newest(a, b);
    if (ma == null) return 1;
    if (mb == null) return -1;
    return ma === mb ? newest(a, b) : (ma - mb) * dir;
  };
  const out = [...list];
  if (sort === "clicks") return out.sort(by((a) => a.clicks28d, -1));
  if (sort === "best") return out.sort(by((a) => a.position, 1));
  return out.sort(newest);
}

/** Where an article's own page lives (draft id, or the run's while there's
 *  no draft yet). */
export function articleHref(a: Pick<AutopilotArticle, "draftId" | "runId">): string | null {
  const id = a.draftId || a.runId;
  return id ? `/articles/${id}` : null;
}

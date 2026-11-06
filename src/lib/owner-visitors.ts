import { db } from "./db";
import { aiReferrer } from "./owner-insights";
import { windows, type Range } from "./owner-analytics";

// Every person who opened dispatchseo.com, one row per visit, for /owner.
//
// A visit = one visitor hash on one UTC day (the hash rotates daily on
// purpose, so the same person on two days is two visits). Built from the
// rows a browser confirmed (beacon) plus the imported PostHog history; bots
// never reach here. Grouped in code rather than SQL so this needs no new
// migration: traffic is small, and the read is capped (`capped` says when the
// cap cut the oldest rows off).

export type Channel = { name: string; kind: "ai" | "search" | "social" | "direct" | "site" | "campaign" };

export type Visit = {
  key: string;
  firstAt: string;
  lastAt: string;
  country: string | null;
  device: string | null;
  channel: Channel;
  /** The site that sent them, when it differs from the channel's name. */
  referrer: string | null;
  campaign: string | null;
  landing: string;
  pages: string[];
  views: number;
  /** Set when they were signed in. */
  userId: string | null;
};

export type VisitorsReport = {
  visits: Visit[];
  /** Visits per channel, most first. */
  channels: Array<{ name: string; kind: Channel["kind"]; visits: number }>;
  /** utm_campaign / utm_source pairs that brought someone, most first. */
  campaigns: Array<{ name: string; visits: number }>;
  capped: boolean;
};

const SEARCH: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, "Yahoo"],
  [/(^|\.)yandex\.[a-z.]+$/, "Yandex"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/^search\.brave\.com$/, "Brave Search"],
  [/(^|\.)startpage\.com$/, "Startpage"],
  [/(^|\.)baidu\.com$/, "Baidu"],
];

const SOCIAL: Array<[RegExp, string]> = [
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/(^|\.)facebook\.com$|^fb\.me$|^l\.facebook\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
  [/^news\.ycombinator\.com$/, "Hacker News"],
  [/(^|\.)producthunt\.com$/, "Product Hunt"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)discord\.com$|(^|\.)discord\.gg$/, "Discord"],
  [/(^|\.)threads\.net$/, "Threads"],
  [/(^|\.)bsky\.app$/, "Bluesky"],
  [/(^|\.)indiehackers\.com$/, "Indie Hackers"],
];

function match(list: Array<[RegExp, string]>, host: string): string | null {
  for (const [re, name] of list) if (re.test(host)) return name;
  return null;
}

/** How a visit reached the site: an AI answer, a search engine, a social
 *  site, a tagged link, another site, or nothing at all (typed / bookmarked). */
export function channelOf(referrer: string | null, utmSource: string | null): Channel {
  const host = referrer?.toLowerCase() ?? null;
  if (host) {
    const ai = aiReferrer(host);
    if (ai) return { name: ai, kind: "ai" };
    const se = match(SEARCH, host);
    if (se) return { name: se, kind: "search" };
    const so = match(SOCIAL, host);
    if (so) return { name: so, kind: "social" };
  }
  // A tagged link: an AI app often tags instead of sending a referrer
  // (ChatGPT adds utm_source=chatgpt.com).
  const src = utmSource?.toLowerCase().trim();
  if (src) {
    const asHost = src.replace(/^https?:\/\//, "").replace(/^www\./, "");
    const ai = aiReferrer(asHost) ?? (/^chatgpt|openai/.test(src) ? "ChatGPT" : /^perplexity/.test(src) ? "Perplexity" : null);
    if (ai) return { name: ai, kind: "ai" };
    const se = match(SEARCH, asHost);
    if (se) return { name: se, kind: "search" };
    const so = match(SOCIAL, asHost);
    if (so) return { name: so, kind: "social" };
    return { name: utmSource!.trim(), kind: "campaign" };
  }
  if (host) return { name: host, kind: "site" };
  return { name: "Direct", kind: "direct" };
}

type Row = {
  at: string;
  visitor: string | null;
  path: string;
  referrer: string | null;
  country: string | null;
  device: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  user_id: string | null;
};

const CAP = 8000;
const PAGE = 1000;

export async function visitorsReport(range: Range, now = Date.now()): Promise<VisitorsReport> {
  const w = windows(range, now);
  // PostgREST hands back at most 1000 rows a request: page through, newest first.
  const rows: Row[] = [];
  for (let off = 0; off < CAP; off += PAGE) {
    const { data, error } = await db()
      .from("web_visits")
      .select("at, visitor, path, referrer, country, device, utm_source, utm_campaign, user_id")
      .in("kind", ["beacon", "import"])
      .eq("bot", false)
      .eq("area", "site")
      .gte("at", new Date(w.from).toISOString())
      .lt("at", new Date(w.to).toISOString())
      .order("at", { ascending: false })
      .range(off, off + PAGE - 1);
    if (error) throw new Error(error.message);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }

  // Oldest first, so the first row of a visit is where it started.
  const byVisit = new Map<string, Row[]>();
  rows.forEach((r, i) => {
    const key = r.visitor ? `${r.visitor}:${r.at.slice(0, 10)}` : `row:${i}`;
    const list = byVisit.get(key);
    if (list) list.unshift(r);
    else byVisit.set(key, [r]);
  });

  const visits: Visit[] = [];
  for (const [key, list] of byVisit) {
    const first = list[0];
    const last = list[list.length - 1];
    // The visit's source is its entry: the first external referrer or tag.
    const ref = list.find((r) => r.referrer)?.referrer ?? null;
    const utm = list.find((r) => r.utm_source)?.utm_source ?? null;
    const channel = channelOf(ref, utm);
    const pages: string[] = [];
    for (const r of list) if (pages[pages.length - 1] !== r.path) pages.push(r.path);
    visits.push({
      key,
      firstAt: first.at,
      lastAt: last.at,
      country: list.find((r) => r.country)?.country ?? null,
      device: list.find((r) => r.device)?.device ?? null,
      channel,
      referrer: ref && ref !== channel.name.toLowerCase() ? ref : null,
      campaign: list.find((r) => r.utm_campaign)?.utm_campaign ?? null,
      landing: first.path,
      pages,
      views: list.length,
      userId: list.find((r) => r.user_id)?.user_id ?? null,
    });
  }
  visits.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const ch = new Map<string, { name: string; kind: Channel["kind"]; visits: number }>();
  const camp = new Map<string, number>();
  for (const v of visits) {
    const c = ch.get(v.channel.name) ?? { name: v.channel.name, kind: v.channel.kind, visits: 0 };
    c.visits++;
    ch.set(v.channel.name, c);
    if (v.campaign || v.channel.kind === "campaign") {
      const name = [v.channel.kind === "campaign" ? v.channel.name : null, v.campaign].filter(Boolean).join(" · ");
      camp.set(name, (camp.get(name) ?? 0) + 1);
    }
  }
  return {
    visits,
    channels: [...ch.values()].sort((a, b) => b.visits - a.visits),
    campaigns: [...camp].map(([name, n]) => ({ name, visits: n })).sort((a, b) => b.visits - a.visits),
    capped: rows.length >= CAP,
  };
}

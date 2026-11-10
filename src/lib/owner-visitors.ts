import { db } from "./db";
import { operatorUserIds } from "./autopilot/operator";
import { isCloudMode } from "./cloud";
import { AUTOMATED_BROWSER, BADGE_MEDIUM } from "./visits";
import { aiReferrer } from "./owner-insights";
import { windows, type Range } from "./owner-analytics";
import { memoMinute } from "./owner-memo";

// Every person who opened dispatchseo.com, one row per visit, for /owner.
//
// A visit = one visitor hash on one UTC day (the hash rotates daily on
// purpose, so the same person on two days is two visits). Built from the
// rows a browser confirmed (beacon) plus the imported PostHog history; bots
// never reach here. Grouped in code rather than SQL so this needs no new
// migration: traffic is small, and the read is capped (`capped` says when the
// cap cut the oldest rows off).

export type Channel = { name: string; kind: "ai" | "search" | "social" | "direct" | "site" | "campaign" | "badge" };

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
  /** Came through a customer article's "Made with DispatchSEO" credit. */
  badge: { site: string; articleId: string | null; title: string | null } | null;
  landing: string;
  pages: string[];
  views: number;
  /** Set when they were signed in. */
  userId: string | null;
  /** Our best guess at whether a person was behind it, and why. */
  verdict: Verdict;
  why: string;
};

export type Verdict = "person" | "bot" | "unsure";

// The interaction ping went live with this; a visit before it has no way to
// show it was a person, so it can't be held against it.
const ENGAGE_SINCE = "2026-11-07T00:00:00Z";
// Chrome ships every 4 weeks and updates itself: a year behind the newest
// Chrome seen is a frozen user agent, the usual mark of a scraper.
const STALE_CHROME = 12;

export type VisitorsReport = {
  visits: Visit[];
  /** Visits per channel, most first. */
  channels: Array<{ name: string; kind: Channel["kind"]; visits: number }>;
  /** utm_campaign / utm_source pairs that brought someone, most first. */
  campaigns: Array<{ name: string; visits: number }>;
  /** Visits through the free plan's credit, per customer site, most first.
   *  `signedIn`: visits whose browser was signed in to DispatchSEO the same
   *  day (a sign-up, or an existing user). `articles` is empty for credits
   *  published before the ref named the article (2026-11-10). */
  badges: BadgeSite[];
  /** How many visits look like a person, a bot, or can't be told apart. */
  estimate: Record<Verdict, number>;
  capped: boolean;
};

export type BadgeSite = {
  site: string;
  visits: number;
  signedIn: number;
  articles: Array<{ id: string; title: string | null; visits: number }>;
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
export function channelOf(referrer: string | null, utmSource: string | null, utmMedium: string | null = null): Channel {
  // Our own credit on a customer article: its tag is more exact than the
  // referrer, which would only name the customer's site.
  if (utmMedium === BADGE_MEDIUM && utmSource) return { name: "DispatchSEO badge", kind: "badge" };
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
  kind: string;
  bot: boolean;
  ua: string | null;
  visitor: string | null;
  net?: string | null;
  path: string;
  referrer: string | null;
  country: string | null;
  device: string | null;
  utm_source: string | null;
  utm_medium?: string | null;
  utm_campaign: string | null;
  user_id: string | null;
};

const CAP = 8000;
const PAGE = 1000;

/** Which visits are the operator's own.
 *
 *  The IP is never stored. `visitor` hashes IP + user agent + UTC day (one
 *  browser), `net` hashes IP + day (one network, migration 0077). If any row
 *  under either was signed in as the operator (the beacon and the dashboard
 *  both carry the user id), every row under it is the operator: the
 *  logged-out landing loads before they signed in, a second test browser, the
 *  phone on the same wifi. Self-host has no user ids, but only its one owner
 *  gets past the proxy into the dashboard ("app" rows). Misses a network the
 *  operator never signed in from that day; hides anyone else who shared it. */
async function operatorKeys(visitors: string[], nets: string[]): Promise<{ visitors: Set<string>; nets: Set<string> }> {
  const ops = operatorUserIds();
  const selfHost = !isCloudMode();
  const mine = { visitors: new Set<string>(), nets: new Set<string>() };
  if (!ops.length && !selfHost) return mine;
  for (const [col, values] of [["visitor", visitors], ["net", nets]] as const) {
    for (let i = 0; i < values.length; i += 150) {
      const chunk = values.slice(i, i + 150);
      for (let off = 0; off < CAP; off += PAGE) {
        let q = db().from("web_visits").select(col).in(col, chunk);
        q = selfHost ? q.eq("area", "app") : q.in("user_id", ops);
        const { data, error } = await q.range(off, off + PAGE - 1);
        if (error) throw new Error(error.message);
        const got = (data ?? []) as Array<Record<string, string | null>>;
        for (const r of got) if (r[col]) (col === "visitor" ? mine.visitors : mine.nets).add(r[col]!);
        if (got.length < PAGE) break;
      }
    }
  }
  return mine;
}

/** Every visit in the range. Memoised a minute per range (owner-memo.ts). */
export const visitorsReport: (range: Range, now?: number) => Promise<VisitorsReport> = memoMinute((range) => `visitors:${range}`, visitorsReportFresh);

async function visitorsReportFresh(range: Range, now = Date.now()): Promise<VisitorsReport> {
  const w = windows(range, now);
  // PostgREST hands back at most 1000 rows a request: page through, newest first.
  const rows: Row[] = [];
  // `net` arrives with 0077; read without it until that is applied.
  let cols = "at, kind, bot, ua, visitor, net, path, referrer, country, device, utm_source, utm_medium, utm_campaign, user_id";
  for (let off = 0; off < CAP; off += PAGE) {
    const { data, error } = await db()
      .from("web_visits")
      .select(cols)
      .in("kind", ["beacon", "import", "engaged"])
      // People, plus browsers that admitted to being automated (a declared
      // crawler rendering the page, Googlebot say, is in the bot numbers already).
      .or(`bot.eq.false,bot_name.eq."${AUTOMATED_BROWSER}"`)
      .eq("area", "site")
      .gte("at", new Date(w.from).toISOString())
      .lt("at", new Date(w.to).toISOString())
      .order("at", { ascending: false })
      .range(off, off + PAGE - 1);
    if (error && cols.includes(" net,") && /\bnet\b/.test(error.message)) {
      cols = cols.replace(" net,", "");
      off -= PAGE;
      continue;
    }
    if (error) throw new Error(error.message);
    const got = (data ?? []) as unknown as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }

  // The operator's own browsing is not a visitor.
  const distinct = (k: "visitor" | "net") => [...new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))];
  const mine = await operatorKeys(distinct("visitor"), distinct("net"));
  const isMine = (r: Row) => (!!r.visitor && mine.visitors.has(r.visitor)) || (!!r.net && mine.nets.has(r.net));

  // Oldest first, so the first row of a visit is where it started.
  const byVisit = new Map<string, Row[]>();
  const hidden = new Set(rows.filter(isMine).map((r) => r.visitor).filter(Boolean));
  rows.forEach((r, i) => {
    if (isMine(r) || (r.visitor && hidden.has(r.visitor))) return;
    const key = r.visitor ? `${r.visitor}:${r.at.slice(0, 10)}` : `row:${i}`;
    const list = byVisit.get(key);
    if (list) list.unshift(r);
    else byVisit.set(key, [r]);
  });

  // Real Chrome only: "HeadlessChrome/153" is often a pre-release build and
  // would make every real browser look out of date.
  const chromeOf = (ua: string | null) => Number(/(?<!Headless)Chrome\/(\d+)/.exec(ua ?? "")?.[1] ?? 0) || null;
  const newestChrome = Math.max(0, ...rows.filter((r) => !r.bot).map((r) => chromeOf(r.ua) ?? 0));

  const visits: Visit[] = [];
  for (const [key, all] of byVisit) {
    // The interaction pings say "a person was here", they are not page views.
    const engaged = all.some((r) => r.kind === "engaged");
    const list = all.filter((r) => r.kind !== "engaged");
    if (!list.length) continue;
    const first = list[0];
    const last = list[list.length - 1];
    // The visit's source is its entry: the first external referrer or tag.
    const ref = list.find((r) => r.referrer)?.referrer ?? null;
    const tagged = list.find((r) => r.utm_source);
    const utm = tagged?.utm_source ?? null;
    const channel = channelOf(ref, utm, tagged?.utm_medium ?? null);
    const badge = channel.kind === "badge" ? { site: utm!, articleId: tagged?.utm_campaign ?? null, title: null } : null;
    const pages: string[] = [];
    for (const r of list) if (pages[pages.length - 1] !== r.path) pages.push(r.path);
    visits.push({
      key,
      firstAt: first.at,
      lastAt: last.at,
      country: list.find((r) => r.country)?.country ?? null,
      device: list.find((r) => r.device)?.device ?? null,
      channel,
      referrer: badge ? badge.site : ref && ref !== channel.name.toLowerCase() ? ref : null,
      campaign: badge ? null : (list.find((r) => r.utm_campaign)?.utm_campaign ?? null),
      badge,
      landing: first.path,
      pages,
      views: list.length,
      userId: list.find((r) => r.user_id)?.user_id ?? null,
      ...judge(list, engaged, chromeOf, newestChrome),
    });
  }
  visits.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const badges = await badgeSites(visits);

  const ch = new Map<string, { name: string; kind: Channel["kind"]; visits: number }>();
  const camp = new Map<string, number>();
  for (const v of visits) {
    const c = ch.get(v.channel.name) ?? { name: v.channel.name, kind: v.channel.kind, visits: 0 };
    c.visits++;
    ch.set(v.channel.name, c);
    if (v.channel.kind !== "badge" && (v.campaign || v.channel.kind === "campaign")) {
      const name = [v.channel.kind === "campaign" ? v.channel.name : null, v.campaign].filter(Boolean).join(" · ");
      camp.set(name, (camp.get(name) ?? 0) + 1);
    }
  }
  const estimate: Record<Verdict, number> = { person: 0, bot: 0, unsure: 0 };
  for (const v of visits) estimate[v.verdict]++;
  return {
    visits,
    estimate,
    channels: [...ch.values()].sort((a, b) => b.visits - a.visits),
    campaigns: [...camp].map(([name, n]) => ({ name, visits: n })).sort((a, b) => b.visits - a.visits),
    badges,
    capped: rows.length >= CAP,
  };
}

/** The badge visits grouped by site and article. Fills each visit's article
 *  title (and the visit row's campaign, so the table names it) and counts
 *  the visits whose browser signed in to DispatchSEO that same day - the
 *  dashboard is "app" area, which the visit read above leaves out. */
async function badgeSites(visits: Visit[]): Promise<BadgeSite[]> {
  const mine = visits.filter((v) => v.badge);
  if (!mine.length) return [];

  const ids = [...new Set(mine.map((v) => v.badge!.articleId).filter((x): x is string => !!x))];
  const titles = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db().from("article_drafts").select("id, title").in("id", ids.slice(i, i + 150));
    for (const r of (data ?? []) as Array<{ id: string; title: string | null }>) if (r.title) titles.set(r.id, r.title);
  }

  // The visit key is `<visitor hash>:<day>`; the hash already rotates daily.
  const hashes = [...new Set(mine.map((v) => v.key.split(":")[0]).filter((k) => k && k !== "row"))];
  const signed = new Set<string>();
  for (let i = 0; i < hashes.length; i += 150) {
    const { data } = await db().from("web_visits").select("visitor").in("visitor", hashes.slice(i, i + 150)).not("user_id", "is", null).limit(PAGE);
    for (const r of (data ?? []) as Array<{ visitor: string | null }>) if (r.visitor) signed.add(r.visitor);
  }

  const bySite = new Map<string, BadgeSite & { byArticle: Map<string, { id: string; title: string | null; visits: number }> }>();
  for (const v of mine) {
    const b = v.badge!;
    b.title = b.articleId ? (titles.get(b.articleId) ?? null) : null;
    if (b.articleId) v.campaign = b.title ?? "Article no longer on record";
    const s = bySite.get(b.site) ?? { site: b.site, visits: 0, signedIn: 0, articles: [], byArticle: new Map() };
    s.visits++;
    if (v.userId || signed.has(v.key.split(":")[0])) s.signedIn++;
    if (b.articleId) {
      const a = s.byArticle.get(b.articleId) ?? { id: b.articleId, title: b.title, visits: 0 };
      a.visits++;
      s.byArticle.set(b.articleId, a);
    }
    bySite.set(b.site, s);
  }
  return [...bySite.values()]
    .map(({ byArticle, ...s }) => ({ ...s, articles: [...byArticle.values()].sort((a, b) => b.visits - a.visits) }))
    .sort((a, b) => b.visits - a.visits);
}

/** Person, bot or unsure, strongest evidence first. An estimate: a careful
 *  scraper can fake all of it, and a person who leaves without touching
 *  anything looks like a scraper. */
function judge(list: Row[], engaged: boolean, chromeOf: (ua: string | null) => number | null, newestChrome: number): { verdict: Verdict; why: string } {
  if (list.some((r) => r.bot)) return { verdict: "bot", why: "The browser said it was automated (webdriver)" };
  if (list.some((r) => r.user_id)) return { verdict: "person", why: "Signed in" };
  if (engaged) return { verdict: "person", why: "Moved the mouse, scrolled with a wheel, tapped or typed" };
  const chrome = chromeOf(list[0].ua);
  if (chrome && newestChrome - chrome >= STALE_CHROME) {
    return { verdict: "bot", why: `Chrome ${chrome}, ${newestChrome - chrome} versions behind - real Chrome updates itself` };
  }
  if (list[0].kind === "import") return { verdict: "unsure", why: "Imported history: no interaction data" };
  if (list[list.length - 1].at < ENGAGE_SINCE) return { verdict: "unsure", why: "From before interaction was measured" };
  return { verdict: "unsure", why: "Loaded the page but never moved, scrolled, tapped or typed" };
}

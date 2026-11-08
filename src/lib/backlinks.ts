// Links from OLDER articles to each new one (spam-safety research,
// 2026-11-08). Internal links used to run one way only: a new article links to
// the site's existing pages, and nothing ever pointed back at it - so a fresh
// article is an orphan until Google stumbles on it in the sitemap. ClockedCode's
// articles that got indexed fast were the ones a related older page linked to.
//
// On publish, the 1-2 most related older articles on the same site get ONE
// contextual link to the new article: a phrase they already contain, wrapped
// in a link - never new prose. Only when the closest article has no phrase that
// fits does it get a single "Related:" line before its FAQ, so every article
// gets at least one way in. Repo sites: the older files change in the SAME
// pull request, so the link and its target go live together. Hosted sites: the
// older draft's markdown changes and it is re-rendered.
//
// Pure helpers first (tested in isolation), then the hosted orchestrator. The
// repo half lives in repo-publish.ts, next to its GitHub plumbing.

import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";

/** Older articles that get a link to each new one. */
export const BACKLINKS_PER_ARTICLE = 2;
/** An older article already this link-heavy gets no more. */
const MAX_INTERNAL_LINKS_IN_SOURCE = 10;

const STOPWORDS = new Set(
  (
    "a an the and or but of to in on at for from by with without into onto over under about as is are was were be been " +
    "it its this that these those your you my our their his her how what why when where which who whom do does did can " +
    "should would will vs versus best top guide tips way ways fix get make use using not no " +
    "של על עם את מה איך זה זו זאת לא או גם כל יש אם כי הוא היא הם הן אני אתה למה מתי איפה"
  ).split(" "),
);
/** Words an anchor may not start or end on: "the garbage disposal" reads worse than "garbage disposal". */
const EDGE_WORDS = new Set(
  "a an the and or of to in on at for from by with as is are your my our how what why when where which do does can vs not no את של על עם או".split(" "),
);

function tokens(s: string): string[] {
  return (s ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function stem(w: string): string {
  if (/^[a-z]+$/.test(w) && w.length > 4) return w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
  return w;
}

function distinctive(words: string[]): Set<string> {
  return new Set(words.filter((w) => w.length >= 3 && !STOPWORDS.has(w)).map(stem));
}

export type BacklinkTarget = { title: string; keyword: string; url: string };
export type BacklinkSource = { id: string; title: string; keyword: string; url: string; indexed: boolean; publishedAt: string };

/** How related an older article is to the new one: shared topic words. */
export function relatedness(target: Pick<BacklinkTarget, "title" | "keyword">, source: Pick<BacklinkSource, "title" | "keyword">): number {
  const t = distinctive(tokens(`${target.keyword} ${target.title}`));
  const s = distinctive(tokens(`${source.keyword} ${source.title}`));
  const tk = distinctive(tokens(target.keyword));
  let n = 0;
  for (const w of t) if (s.has(w)) n += tk.has(w) ? 2 : 1;
  return n;
}

/** The closest related older articles: shared keyword words first, indexed pages
 *  before unindexed (a link from a page Google already trusts is found sooner),
 *  then the newest. Unrelated articles never qualify. */
export function pickBacklinkSources(target: BacklinkTarget, sources: BacklinkSource[], max = BACKLINKS_PER_ARTICLE): BacklinkSource[] {
  const tk = distinctive(tokens(target.keyword));
  return sources
    .filter((s) => s.url !== target.url)
    .map((s) => ({ s, score: relatedness(target, s), keywordShared: [...distinctive(tokens(`${s.keyword} ${s.title}`))].some((w) => tk.has(w)) }))
    .filter((x) => x.keywordShared && x.score >= 2)
    .sort((a, b) => b.score - a.score || Number(b.s.indexed) - Number(a.s.indexed) || (Date.parse(b.s.publishedAt) || 0) - (Date.parse(a.s.publishedAt) || 0))
    .slice(0, max)
    .map((x) => x.s);
}

/**
 * Phrases from the new article's keyword that may become the anchor in an
 * older article, longest first: every run of 2+ words that carries a topic
 * word, does not start or end on a filler word, and is not just the OLDER
 * article's own subject (anchoring "garbage disposal" on the garbage-disposal
 * cost page to some other page tells Google the wrong page owns that phrase).
 */
export function anchorPhrases(targetKeyword: string, sourceKeyword: string): string[] {
  const words = tokens(targetKeyword);
  const own = distinctive(tokens(sourceKeyword));
  const out: string[] = [];
  for (let n = Math.min(words.length, 6); n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const run = words.slice(i, i + n);
      if (EDGE_WORDS.has(run[0]) || EDGE_WORDS.has(run[run.length - 1])) continue;
      const topic = [...distinctive(run)];
      if (!topic.length) continue;
      if (topic.every((w) => own.has(w))) continue;
      out.push(run.join(" "));
    }
  }
  return [...new Set(out)];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Spans of a markdown line that must never be touched: code, anything in
 *  square brackets at any depth (inline, reference and shortcut links,
 *  footnotes, images) plus the (...) or [...] that follows it, autolinks and
 *  HTML tags, bare URLs and www. hosts. */
function protectedSpans(line: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const re of [/`[^`]*`/g, /<[^>]+>/g, /https?:\/\/\S+/g, /\bwww\.\S+/g, /\S+@\S+\.\S+/g]) {
    for (const m of line.matchAll(re)) spans.push([m.index!, m.index! + m[0].length]);
  }
  let depth = 0;
  let open = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "[") {
      if (depth === 0) open = i;
      depth++;
    } else if (ch === "]" && depth > 0) {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        const next = line[end];
        if (next === "(" || next === "[") {
          const close = line.indexOf(next === "(" ? ")" : "]", end);
          end = close < 0 ? line.length : close + 1;
        }
        spans.push([open, end]);
        i = end - 1;
      }
    }
  }
  if (depth > 0 && open >= 0) spans.push([open, line.length]);
  return spans;
}

/** Where the body starts (after a frontmatter block) - the file's first line index. */
function bodyStart(lines: string[]): number {
  const fence = lines[0]?.trim();
  if (fence !== "---" && fence !== "+++") return 0;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === fence) return i + 1;
  return 0;
}

function linksTo(markdown: string, url: string): boolean {
  let path = url;
  try {
    path = new URL(url, "https://x.invalid").pathname.replace(/\/+$/, "");
  } catch {
    /* keep as given */
  }
  return markdown.includes(`](${url})`) || markdown.includes(`](${path})`) || markdown.includes(`](${path}/)`) || markdown.includes(`href="${url}"`);
}

function internalLinkCount(markdown: string, siteDomain?: string | null): number {
  const own = (siteDomain ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
  let n = (markdown.match(/\]\(\//g) ?? []).length;
  if (own) for (const m of markdown.matchAll(/\]\(https?:\/\/([^/)\s]+)/g)) if (m[1].toLowerCase().replace(/^www\./, "") === own) n++;
  return n;
}

/**
 * Wraps the first fitting phrase of an older article's PROSE in a link to the
 * new one. Prose only: never a heading, table, quote (the TL;DR), list of
 * links, code, frontmatter, an MDX/JSX line, or text already inside a link.
 * Body sections after the first H2 are preferred over the opening. Returns
 * null when nothing fits, when the article already links there, or when it is
 * already link-heavy.
 */
export function insertContextualLink(
  markdown: string,
  url: string,
  phrases: string[],
  opts: { mdx?: boolean; siteDomain?: string | null } = {},
): { markdown: string; anchor: string } | null {
  if (!phrases.length || linksTo(markdown, url) || internalLinkCount(markdown, opts.siteDomain) >= MAX_INTERNAL_LINKS_IN_SOURCE) return null;
  const lines = markdown.split("\n");
  const start = bodyStart(lines);
  const eligible: boolean[] = lines.map(() => false);
  let fence = false;
  let firstH2 = -1;
  // Multi-line constructs whose inner lines look like prose: a raw HTML block
  // (ends at a blank line, as CommonMark has it), an unclosed JSX tag, and in
  // MDX anything inside braces (export const x = {...}, expressions).
  let htmlBlock = false;
  let jsxOpen = false;
  let braces = 0;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^##\s/.test(l) && firstH2 < 0) firstH2 = i;
    if (!l.trim()) {
      htmlBlock = false;
      continue;
    }
    const insideBraces = braces > 0;
    if (opts.mdx) for (const ch of l) braces = Math.max(0, braces + (ch === "{" ? 1 : ch === "}" ? -1 : 0));
    if (insideBraces || jsxOpen) {
      if (jsxOpen && l.includes(">")) jsxOpen = false;
      continue;
    }
    if (/^\s*</.test(l)) {
      htmlBlock = true;
      if (opts.mdx && !l.includes(">")) jsxOpen = true;
    }
    if (htmlBlock) continue;
    if (/^\s*(#|\||>|!\[|\[[^\]]*\]:|import\s|export\s|---|\*\*\*|\+\+\+)/.test(l)) continue;
    // A setext heading: the text line above a row of === or ---.
    if (/^\s*(=+|-+)\s*$/.test(lines[i + 1] ?? "")) continue;
    if (opts.mdx && /[<{}]/.test(l)) continue;
    eligible[i] = true;
  }
  const order = [
    ...lines.map((_, i) => i).filter((i) => firstH2 >= 0 && i > firstH2),
    ...lines.map((_, i) => i).filter((i) => firstH2 < 0 || i < firstH2),
  ];
  for (const phrase of phrases) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}./@_-])${phrase.split(" ").map(escapeRe).join("\\s+")}(?![\\p{L}\\p{N}_-]|\\.\\p{L})`, "giu");
    for (const i of order) {
      if (!eligible[i]) continue;
      const line = lines[i];
      const spans = protectedSpans(line);
      for (const m of line.matchAll(re)) {
        const s = m.index!;
        const e = s + m[0].length;
        if (spans.some(([a, b]) => s < b && e > a)) continue;
        lines[i] = `${line.slice(0, s)}[${m[0]}](${url})${line.slice(e)}`;
        return { markdown: lines.join("\n"), anchor: m[0] };
      }
    }
  }
  return null;
}

const RELATED_LABEL: Record<string, string> = { en: "Related:", he: "כדאי לקרוא גם:", es: "Relacionado:", fr: "À lire aussi :", de: "Siehe auch:", pt: "Leia também:", it: "Leggi anche:", nl: "Lees ook:" };
const FAQ_HEADING = /^##\s+(faq|frequently asked|common questions|שאלות נפוצות|preguntas frecuentes|questions fréquentes|häufige fragen|perguntas frequentes|domande frequenti|veelgestelde vragen)/i;

/** The fallback: one "Related:" line before the FAQ (or at the end). Null for a
 *  language without a label, an MDX file that ends in components, or an
 *  article that already links there. */
export function appendRelatedLine(
  markdown: string,
  url: string,
  title: string,
  languageCode: string | null | undefined,
  opts: { mdx?: boolean; siteDomain?: string | null } = {},
): string | null {
  const label = RELATED_LABEL[(languageCode ?? "en").slice(0, 2).toLowerCase()];
  if (!label || linksTo(markdown, url) || internalLinkCount(markdown, opts.siteDomain) >= MAX_INTERNAL_LINKS_IN_SOURCE) return null;
  // The title is model output going into a customer's source file: nothing
  // that markdown, HTML or MDX would read as structure (a "<" or "{" can
  // break an MDX build or inject a component), and no line break.
  const safeTitle = title.replace(/[[\]<>{}`\\|]/g, "").replace(/\s+/g, " ").trim();
  if (!safeTitle) return null;
  const line = `${label} [${safeTitle}](${url})`;
  const lines = markdown.replace(/\s+$/, "").split("\n");
  let fence = false;
  let faqAt = -1;
  for (let i = bodyStart(lines); i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    else if (!fence && FAQ_HEADING.test(lines[i])) faqAt = i;
  }
  if (faqAt >= 0) {
    // Its own paragraph: a blank line above too, or it would continue the
    // paragraph, list item or table that runs into the heading.
    if (lines[faqAt - 1]?.trim()) lines.splice(faqAt++, 0, "");
    lines.splice(faqAt, 0, line, "");
    return lines.join("\n") + "\n";
  }
  const last = lines[lines.length - 1] ?? "";
  if (opts.mdx && /^\s*(<|import\s|export\s|\})/.test(last)) return null;
  return `${lines.join("\n")}\n\n${line}\n`;
}

/** One older article's edit: the contextual link, or (first source only) the
 *  Related line. */
export function backlinkEdit(
  markdown: string,
  target: BacklinkTarget,
  sourceKeyword: string,
  allowFallback: boolean,
  languageCode: string | null | undefined,
  linkUrl: string,
  opts: { mdx?: boolean; siteDomain?: string | null } = {},
): { markdown: string; anchor: string } | null {
  const contextual = insertContextualLink(markdown, linkUrl, anchorPhrases(target.keyword, sourceKeyword), opts);
  if (contextual) return contextual;
  if (!allowFallback) return null;
  const related = appendRelatedLine(markdown, linkUrl, target.title, languageCode, opts);
  return related ? { markdown: related, anchor: `Related: ${target.title}` } : null;
}

/** Published articles of a project that Google has indexed, by URL. */
export async function indexedUrls(projectId: string, urls: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < urls.length; i += 50) {
    const { data, error } = await db().from("pages").select("url").eq("project_id", projectId).in("url", urls.slice(i, i + 50)).not("indexed_at", "is", null);
    if (error) console.warn(`[backlinks] indexed lookup failed: ${error.message}`);
    for (const r of (data ?? []) as { url: string }[]) out.add(r.url);
  }
  return out;
}

// --- the not-indexed loop ------------------------------------------------------
//
// An article Google still has not indexed 14 days after going live gets more
// ways in: on each later publish, the site's oldest such article (live 14-60
// days, so the effort stops at two months) is linked from 1-2 related articles
// Google HAS indexed - a link from a trusted page is how an unknown one gets
// crawled. One per publish, so a site never rewrites its catalogue at once;
// the index-rate brake (math.ts rampQuota) already counts these articles.

export const STUCK_AFTER_DAYS = 14;
export const STUCK_GIVE_UP_DAYS = 60;

export async function stuckArticle(
  projectId: string,
  excludeId: string,
  now = new Date(),
): Promise<{ id: string; title: string; keyword: string; url: string } | null> {
  const { data: drafts } = await db()
    .from("article_drafts")
    .select("id, title, primary_keyword, published_url")
    .eq("project_id", projectId)
    .eq("status", "published")
    .neq("id", excludeId)
    .not("published_url", "is", null)
    .gte("published_at", new Date(now.getTime() - (STUCK_GIVE_UP_DAYS + 7) * 86_400_000).toISOString())
    .limit(100);
  const rows = (drafts ?? []) as { id: string; title: string; primary_keyword: string | null; published_url: string }[];
  if (!rows.length) return null;
  const { data: pages, error } = await db()
    .from("pages")
    .select("url, live_at, indexed_at")
    .eq("project_id", projectId)
    .in("url", rows.map((r) => r.published_url))
    .is("indexed_at", null)
    .not("live_at", "is", null)
    .lte("live_at", new Date(now.getTime() - STUCK_AFTER_DAYS * 86_400_000).toISOString())
    .gte("live_at", new Date(now.getTime() - STUCK_GIVE_UP_DAYS * 86_400_000).toISOString())
    .order("live_at", { ascending: true })
    .limit(1);
  if (error) return null;
  const page = ((pages ?? []) as { url: string }[])[0];
  const row = page && rows.find((r) => r.published_url === page.url);
  return row ? { id: row.id, title: row.title, keyword: row.primary_keyword ?? row.title, url: row.published_url } : null;
}

// --- hosted orchestrator --------------------------------------------------------

type HostedRow = {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  primary_keyword: string | null;
  markdown: string;
  faq: { question: string; answer: string }[] | null;
  sources: { url: string; title?: string }[] | null;
  published_url: string;
  published_at: string | null;
  updated_at: string;
  rendered_html: string | null;
};

/**
 * After a hosted article goes live: link to it from its closest older hosted
 * articles, then give the site's stuck article (above) links from indexed
 * ones. Best-effort by contract - the new article is already live, and a
 * failure here costs an inbound link, never the publish. Returns what it did.
 */
export async function linkOlderHostedArticles(
  project: Project,
  draft: { id: string; title: string; primary_keyword: string | null },
  url: string,
): Promise<{ sourceUrl: string; anchor: string; to: string }[]> {
  const prefix = url.slice(0, url.lastIndexOf("/") + 1);
  const { data } = await db()
    .from("article_drafts")
    .select("id, title, slug, meta_description, primary_keyword, markdown, faq, sources, published_url, published_at, updated_at, rendered_html")
    .eq("project_id", project.id)
    .eq("status", "published")
    .neq("id", draft.id)
    .not("published_url", "is", null)
    .order("published_at", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as HostedRow[]).filter((r) => r.published_url.startsWith(prefix) && typeof r.markdown === "string");
  if (!rows.length) return [];
  const indexed = await indexedUrls(project.id, rows.map((r) => r.published_url));
  const done = await linkToHosted(project, rows, indexed, { title: draft.title, keyword: draft.primary_keyword ?? draft.title, url }, false);

  const stuck = await stuckArticle(project.id, draft.id).catch(() => null);
  if (stuck && stuck.url.startsWith(prefix)) {
    const touched = new Set(done.map((d) => d.sourceUrl));
    const sources = rows.filter((r) => r.id !== stuck.id && !touched.has(r.published_url));
    done.push(...(await linkToHosted(project, sources, indexed, { title: stuck.title, keyword: stuck.keyword, url: stuck.url }, true)));
  }
  return done;
}

async function linkToHosted(
  project: Project,
  rows: HostedRow[],
  indexed: Set<string>,
  target: BacklinkTarget,
  onlyIndexed: boolean,
): Promise<{ sourceUrl: string; anchor: string; to: string }[]> {
  const { renderDraftForRoute } = await import("@/lib/job-handlers/finish");
  const { schemaScript } = await import("@/lib/article-render");
  const pool = rows.filter((r) => r.published_url !== target.url && (!onlyIndexed || indexed.has(r.published_url)));
  const picks = pickBacklinkSources(
    target,
    pool.map((r) => ({ id: r.id, title: r.title, keyword: r.primary_keyword ?? r.title, url: r.published_url, indexed: indexed.has(r.published_url), publishedAt: r.published_at ?? "" })),
  );
  const done: { sourceUrl: string; anchor: string; to: string }[] = [];
  for (const [i, pick] of picks.entries()) {
    const row = pool.find((r) => r.id === pick.id)!;
    const edit = backlinkEdit(row.markdown, target, pick.keyword, i === 0, project.language_code, target.url, { siteDomain: project.domain });
    if (!edit) continue;
    const finished = await renderDraftForRoute(project, { ...row, markdown: edit.markdown }, "hosted", row.published_at ?? new Date().toISOString());
    // The re-render re-inserts the article's other internal links from the
    // CURRENT crawl. Should that crawl be gone or thinner, the article would
    // trade its links for ours: never - it must come out with more links.
    const links = (h: string | null) => (h ?? "").split("<a ").length - 1;
    if (row.rendered_html && links(finished.html) <= links(row.rendered_html)) continue;
    const { data: updated, error } = await db()
      .from("article_drafts")
      .update({ markdown: edit.markdown, rendered_html: finished.html + schemaScript(finished.schema), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "published")
      .eq("updated_at", row.updated_at)
      .select("id");
    if (error || !updated?.length) {
      if (error) console.warn(`[backlinks] ${project.slug}: could not link from ${row.published_url}: ${error.message}`);
      continue;
    }
    done.push({ sourceUrl: row.published_url, anchor: edit.anchor, to: target.url });
  }
  return done;
}

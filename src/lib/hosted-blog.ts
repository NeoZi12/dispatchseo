import { db } from "@/lib/db";
import { getProjectByHostedKey, publishTarget, type Project } from "@/lib/projects";
import { loadSiteProfile } from "@/lib/site-profile";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { createHash } from "node:crypto";
import { normalizeTheme, type HostedTheme } from "@/lib/hosted-theme";

// The hosted blog: DispatchSEO serving a customer's /blog.
//
// A code-built site with no blog forwards yoursite.com/blog/* to
// <backend>/hosted/<slug>/blog/* (one rewrite line we open as a pull
// request - src/lib/hosted-rewrite.ts). Every page here is therefore seen at
// the CUSTOMER'S address: canonical URLs, the sitemap, structured data and
// every internal link name their domain, never ours. Our host appears in
// exactly one place - the cover image, which is drawn by /api/cover and has
// no customer-side equivalent.
//
// DESIGN: the same post layout as dispatchseo.com/blog, the one this team
// already iterated on, re-expressed in plain HTML and CSS so nothing from the
// app (dark dashboard chrome, fonts, analytics) leaks onto someone else's
// site. From 1024px up: the article beside a sticky 240px reading rail that
// holds "On this page" (every H2, with scroll-spy) and the site's own product
// card (name, one line, three ticks, one CTA). Below that: a collapsed "On
// this page" panel above the article and the product card after it. The
// article itself: cover, title, date and reading time, a TL;DR callout when
// the writer opened with a blockquote, styled tables, a key-takeaways card,
// FAQ as expandable items, and internal links as finish.ts rendered them.
//
// COLOURS come from the site (src/lib/hosted-theme.ts): one accent, light or
// dark, a logo. Everything else is a neutral palette built around that
// accent, which is what makes a blog read as the site's own without
// pretending to clone its landing page. The owner can change all three.
//
// EVERY RESPONSE CARRIES `x-dispatchseo-hosted: 1`. The settings card and the
// rewrite check fetch the site's own /blog and look for that header - the one
// honest way to say "the forwarding is live" rather than guessing from a
// merged pull request.
//
// COST: none per article. This is a template over stored HTML; no model is
// involved in rendering, and the theme is read once per site.

export const HOSTED_HEADER = "x-dispatchseo-hosted";

export type HostedPost = {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  rendered_html: string;
  cover_url: string | null;
  published_url: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
};

/** The date a post carries: when it went live, never when it was last edited. */
export function postDate(p: HostedPost): string {
  return p.published_at ?? p.created_at;
}

export function siteOrigin(project: Pick<Project, "domain"> & { hosted_origin?: string | null }): string {
  return project.hosted_origin || `https://${project.domain.replace(/^www\./, "")}`;
}

export function hostedArticleUrl(project: Pick<Project, "domain"> & { hosted_origin?: string | null }, slug: string): string {
  return `${siteOrigin(project)}/blog/${encodeURIComponent(slug)}`;
}

/** The project a hosted request is for, looked up by its random hosted key
 *  (never the slug - see 0065), or null when there is no such site or it
 *  does not publish through us (a stale rewrite must 404, not leak another
 *  route's drafts). */
export async function hostedProject(key: string): Promise<Project | null> {
  if (!/^[a-zA-Z0-9]{6,32}$/.test(key)) return null;
  const project = await getProjectByHostedKey(key);
  if (!project || publishTarget(project) !== "hosted") return null;
  return project;
}

const POST_COLS = "id, title, slug, meta_description, rendered_html, cover_url, published_url, published_at, updated_at, created_at";
export const INDEX_PAGE_SIZE = 50;

export async function listHostedPosts(projectId: string, limit = 100, offset = 0): Promise<HostedPost[]> {
  const { data } = await db()
    .from("article_drafts")
    .select(POST_COLS)
    .eq("project_id", projectId)
    .eq("status", "published")
    .not("rendered_html", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return ((data ?? []) as HostedPost[]).filter((p) => p.rendered_html);
}

export async function countHostedPosts(projectId: string): Promise<number> {
  const { count } = await db().from("article_drafts").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "published");
  return count ?? 0;
}

/** Two published drafts can share a slug (no constraint, and the gate's
 *  collision check fails open): the newest wins, nobody 404s. */
export async function getHostedPost(projectId: string, slug: string): Promise<HostedPost | null> {
  const { data } = await db()
    .from("article_drafts")
    .select(POST_COLS)
    .eq("project_id", projectId)
    .eq("slug", slug)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const post = ((data ?? []) as HostedPost[])[0] ?? null;
  return post?.rendered_html ? post : null;
}

// --- Reading the stored article ------------------------------------------------

export type Heading = { id: string; text: string };

/** The H2s finish.ts rendered, with the ids it gave them. */
export function headingsOf(html: string): Heading[] {
  const out: Heading[] = [];
  for (const m of html.matchAll(/<h2[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)) {
    // The renderer already escaped this text; decode it so our own esc()
    // does not turn "What's new" into "What&amp;#39;s new".
    const text = unescapeHtml(m[2].replace(/<[^>]+>/g, "")).trim();
    if (text) out.push({ id: m[1], text });
  }
  return out;
}

function unescapeHtml(s: string): string {
  return s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function readingMinutes(html: string): number {
  const words = (html.replace(/<[^>]+>/g, " ").match(/[\p{L}\p{N}]+/gu) ?? []).length;
  return Math.max(1, Math.round(words / 220));
}

/** Light post-processing of the rendered body into the layout's visual
 *  blocks. Each transform is a narrow pattern on markup renderMarkdown
 *  produced; anything it does not recognise is left exactly as it was. */
export function decorateBody(html: string, inShort = "In short"): string {
  // The page renders the title itself; the article's own H1 would repeat it.
  let s = html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");
  // 1. A blockquote at the very top (the TL;DR the writer rules ask for) ->
  //    a callout. Only the first, only when it comes before the first H2.
  const firstH2 = s.indexOf("<h2 ");
  const bq = s.indexOf("<blockquote>");
  if (bq >= 0 && (firstH2 < 0 || bq < firstH2)) {
    s = s.replace(/<blockquote>([\s\S]*?)<\/blockquote>/, `<aside class="tldr" aria-label="Summary"><span class="tldr-k">${esc(inShort)}</span>$1</aside>`);
  }
  // 2. Tables scroll on narrow screens instead of breaking the column.
  s = s.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, "</table></div>");
  // 3. "Key takeaways" / "Summary"-type H2 followed by a list -> a card.
  s = s.replace(/(<h2 id="[^"]+">(?:Key takeaways|Takeaways|What to remember|Summary|Bottom line|TL;DR)[^<]*<\/h2>)\s*(<(ul|ol)>(?:(?!<ul>|<ol>)[\s\S])*?<\/\3>)/i, '<section class="takeaways">$1$2</section>');
  // 4. FAQ: "**Question**" paragraphs followed by an answer -> expandable.
  const faqStart = s.search(/<h2 id="[^"]+">(?:Frequently asked questions|FAQ|FAQs|Common questions|שאלות נפוצות|Häufige Fragen|Preguntas frecuentes|Questions fréquentes)[^<]*<\/h2>/i);
  if (faqStart >= 0) {
    const before = s.slice(0, faqStart);
    const section = s.slice(faqStart);
    // Each answer runs until the next bold question, the next heading, a
    // script (the schema finish.ts appended) or the end of the body.
    // An answer is every paragraph or list up to the next bold question (or
    // the next heading, the schema script, or the end).
    const items = section.replace(/<p><strong>([^<]+)<\/strong><\/p>\s*((?:(?:<p>(?!<strong>)[\s\S]*?<\/p>|<(?:ul|ol)>[\s\S]*?<\/(?:ul|ol)>)\s*)+)(?=<p><strong>|<h2|<script|<section|\s*$)/g, '<details class="faq"><summary>$1</summary><div>$2</div></details>');
    s = before + items;
  }
  return s;
}

// --- Rendering ---------------------------------------------------------------

/** Page chrome in the article's own language; English for the rest. */
type Strings = { onThisPage: string; allPosts: string; minRead: string; inShort: string; blog: string; none: string; visit: string };
const STRINGS: Record<string, Strings> = {
  en: { onThisPage: "On this page", allPosts: "All posts", minRead: "min read", inShort: "In short", blog: "Blog", none: "No articles yet.", visit: "Visit" },
  he: { onThisPage: "בעמוד זה", allPosts: "כל המאמרים", minRead: "דקות קריאה", inShort: "בקצרה", blog: "בלוג", none: "אין מאמרים עדיין.", visit: "לאתר" },
  ar: { onThisPage: "في هذه الصفحة", allPosts: "كل المقالات", minRead: "دقائق قراءة", inShort: "باختصار", blog: "المدونة", none: "لا توجد مقالات بعد.", visit: "زيارة" },
  es: { onThisPage: "En esta página", allPosts: "Todos los artículos", minRead: "min de lectura", inShort: "En resumen", blog: "Blog", none: "Aún no hay artículos.", visit: "Visitar" },
  de: { onThisPage: "Auf dieser Seite", allPosts: "Alle Beiträge", minRead: "Min. Lesezeit", inShort: "Kurz gesagt", blog: "Blog", none: "Noch keine Beiträge.", visit: "Zu" },
  fr: { onThisPage: "Sur cette page", allPosts: "Tous les articles", minRead: "min de lecture", inShort: "En bref", blog: "Blog", none: "Pas encore d'articles.", visit: "Visiter" },
  pt: { onThisPage: "Nesta página", allPosts: "Todos os artigos", minRead: "min de leitura", inShort: "Em resumo", blog: "Blog", none: "Ainda não há artigos.", visit: "Visitar" },
  it: { onThisPage: "In questa pagina", allPosts: "Tutti gli articoli", minRead: "min di lettura", inShort: "In breve", blog: "Blog", none: "Ancora nessun articolo.", visit: "Vai a" },
  nl: { onThisPage: "Op deze pagina", allPosts: "Alle artikelen", minRead: "min leestijd", inShort: "Kort gezegd", blog: "Blog", none: "Nog geen artikelen.", visit: "Naar" },
  th: { onThisPage: "ในหน้านี้", allPosts: "บทความทั้งหมด", minRead: "นาทีในการอ่าน", inShort: "สรุปสั้นๆ", blog: "บล็อก", none: "ยังไม่มีบทความ", visit: "ไปที่" },
};
const RTL = new Set(["he", "ar", "fa", "ur"]);
function stringsFor(lang: string) {
  return STRINGS[lang.toLowerCase().split(/[-_]/)[0]] ?? STRINGS.en;
}
function dirFor(lang: string): "rtl" | "ltr" {
  return RTL.has(lang.toLowerCase().split(/[-_]/)[0]) ? "rtl" : "ltr";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function palette(theme: HostedTheme): string {
  const light = `--bg:#ffffff;--bg2:#f5f5f7;--ink:#171717;--ink2:#404040;--muted:#6b6b6b;--line:#e5e5e5;--card:#f7f7f8;--code:#f3f3f5`;
  const dark = `--bg:#0a0a0a;--bg2:#141414;--ink:#f3f3f3;--ink2:#d4d4d4;--muted:#9a9a9a;--line:#262626;--card:#161616;--code:#1b1b1b`;
  return `:root{${theme.mode === "dark" ? dark : light};--accent:${theme.accent};--accent-ink:${theme.mode === "dark" ? "#0a0a0a" : "#ffffff"};--max:48rem;--rail:240px}`;
}

const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:88px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
.mast{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line)}
.mast-in{max-width:72rem;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-weight:650;letter-spacing:-.01em;font-size:16px}
.brand img{width:26px;height:26px;border-radius:6px;object-fit:cover}
.mast nav a{color:var(--muted);text-decoration:none;font-size:14px;margin-inline-start:18px}
.mast nav a:hover{color:var(--ink)}
main{max-width:var(--max);margin:0 auto;padding:56px 24px 64px}
@media(min-width:1024px){main.rail{max-width:72rem;display:grid;grid-template-columns:minmax(0,1fr) var(--rail);gap:64px}}
article{max-width:var(--max);min-width:0}
.back{display:inline-flex;align-items:center;gap:6px;color:var(--muted);text-decoration:none;font-size:14px;font-weight:500;margin-bottom:32px}
.back:hover{color:var(--ink)}
h1{font-size:clamp(28px,4.2vw,36px);line-height:1.15;letter-spacing:-.02em;font-weight:650;margin:0}
.meta{color:var(--muted);font-size:14px;margin:10px 0 32px;display:flex;gap:8px;align-items:center}
.meta .byline a{color:inherit}
.author{margin:40px 0 0;padding:20px 0 0;border-top:1px solid var(--line);font-size:15px}
.author p{margin:6px 0 0;color:var(--muted)}
.cover{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px;margin:0 0 32px;background:var(--bg2)}
.toc-inline{border-radius:14px;background:var(--card);margin:0 0 32px}
.toc-inline summary{cursor:pointer;list-style:none;padding:12px 16px;font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);display:flex;justify-content:space-between;align-items:center}
.toc-inline summary::-webkit-details-marker{display:none}
.toc-inline nav{border-top:1px solid var(--line);padding:10px 16px 14px}
.toc-inline a,.toc a{display:block;padding-block:6px;padding-inline:12px 0;font-size:13px;line-height:1.35;color:var(--muted);text-decoration:none;border-inline-start:2px solid transparent;margin-inline-start:-1px}
.toc-inline a:hover,.toc a:hover{color:var(--ink)}
.toc a[aria-current]{color:var(--ink);border-inline-start-color:var(--accent);font-weight:500}
.toc ul,.toc-inline ul{list-style:none;margin:0;padding:0}
.toc ul{border-inline-start:1px solid var(--line)}
.toc .k{font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
aside.rail{display:none}
@media(min-width:1024px){main.rail .toc-inline{display:none}aside.rail{display:block}aside.rail>div{position:sticky;top:88px;display:flex;flex-direction:column;gap:32px;max-height:calc(100vh - 7rem)}.toc{min-height:0;overflow-y:auto}.promo.below{display:none}}
.promo{border-radius:14px;background:var(--card);padding:20px}
.promo img{width:28px;height:28px;border-radius:7px;object-fit:cover;display:block}
.promo .name{margin:12px 0 0;font-weight:600;font-size:15px;color:var(--ink)}
.promo .line{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--muted)}
.promo ul{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.promo li{display:flex;gap:10px;align-items:center;font-size:13px;color:var(--ink2)}
.promo li svg{width:16px;height:16px;flex:none;color:var(--accent)}
.promo .cta{display:block;margin-top:20px;background:var(--accent);color:var(--accent-ink);text-decoration:none;text-align:center;font-weight:600;font-size:13px;padding:9px 14px;border-radius:10px}
.promo .cta:hover{filter:brightness(1.08)}
.promo.below{margin-top:40px}
.body{font-size:17px}
.body>p:first-child{font-size:18px;color:var(--ink2)}
.body h2{font-size:24px;line-height:1.25;letter-spacing:-.015em;font-weight:650;margin:44px 0 12px}
.body h3{font-size:19px;font-weight:600;margin:28px 0 8px}
.body p{margin:0 0 18px}
.body ul,.body ol{padding-inline-start:22px;margin:0 0 18px}
.body li{margin:6px 0}
.body li::marker{color:var(--muted)}
.body img{max-width:100%;height:auto;border-radius:10px}
.body hr{border:0;border-top:1px solid var(--line);margin:36px 0}
.body blockquote{margin:22px 0;padding:6px 18px;border-inline-start:3px solid var(--accent);color:var(--ink2)}
.body pre{overflow-x:auto;padding:14px 16px;border-radius:10px;background:var(--code);font-size:14px;line-height:1.55}
.body code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--code);padding:.12em .35em;border-radius:5px}
.body pre code{background:none;padding:0}
.tbl{overflow-x:auto;margin:22px 0;border:1px solid var(--line);border-radius:12px}
.tbl table{border-collapse:collapse;width:100%;font-size:15px}
.tbl th,.tbl td{padding:10px 14px;text-align:start;vertical-align:top;border-bottom:1px solid var(--line)}
.tbl th{background:var(--bg2);font-weight:600;color:var(--ink2);font-size:13px;letter-spacing:.01em}
.tbl tr:last-child td{border-bottom:0}
.tbl tr:nth-child(even) td{background:color-mix(in srgb,var(--bg2) 50%,transparent)}
.tldr{margin:0 0 28px;padding:16px 18px;border-radius:14px;background:color-mix(in srgb,var(--accent) 8%,var(--bg));border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line))}
.tldr .tldr-k{display:block;font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 8px}
.tldr p{margin:0}.tldr p+p{margin-top:8px}
.takeaways{margin:36px 0;padding:6px 22px 18px;border-radius:14px;background:var(--card)}
.takeaways h2{margin:16px 0 8px;font-size:20px}
.takeaways ul{margin:0}
.faq{border-top:1px solid var(--line);padding:4px 0}
.faq:last-of-type{border-bottom:1px solid var(--line)}
.faq summary{cursor:pointer;list-style:none;padding:12px 0;font-weight:600;font-size:16px;display:flex;justify-content:space-between;gap:16px;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--muted);font-weight:400;font-size:20px;flex:none}
.faq[open] summary::after{content:"–"}
.faq>div{padding:0 0 14px;color:var(--ink2)}
.faq>div p:last-child{margin-bottom:0}
.endnav{margin-top:48px;border-top:1px solid var(--line);padding-top:24px}
.list h1{font-size:30px}.list .sub{color:var(--muted);margin:8px 0 32px;font-size:16px}
.card{display:block;padding:20px 0;border-top:1px solid var(--line);text-decoration:none;color:inherit}
.card:last-of-type{border-bottom:1px solid var(--line)}
.card h2{margin:0 0 6px;font-size:21px;line-height:1.3;letter-spacing:-.015em;font-weight:650}
.card:hover h2{color:var(--accent)}
.card p{margin:0;color:var(--muted);font-size:15px;line-height:1.55}
.card time{display:block;margin-top:8px;color:var(--muted);font-size:13px}
.pager{display:flex;justify-content:space-between;align-items:center;margin:24px 0 0;color:var(--muted);font-size:14px}.pager a{text-decoration:none;font-size:18px}
footer{max-width:72rem;margin:0 auto;padding:28px 24px 40px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{color:var(--muted);text-decoration:none}footer a:hover{color:var(--ink)}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

/** Scroll-spy for the rail ToC, the same rule as the app's TableOfContents:
 *  the active item is the heading crossing a band near the top; at the page
 *  bottom the last one wins. No dependencies, degrades to plain anchors. */
const PAGE_JS = `(function(){var c=document.querySelector("img.cover");if(c){c.addEventListener("error",function(){c.remove()})}var links=[].slice.call(document.querySelectorAll('.toc a[href^="#"]'));if(!links.length||!('IntersectionObserver' in window))return;var els=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))}).filter(Boolean);function set(id){links.forEach(function(a){if(a.getAttribute('href')==='#'+id)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')})}var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){if(es[i].isIntersecting){set(es[i].target.id);break}}},{rootMargin:'-96px 0px -70% 0px',threshold:0});els.forEach(function(e){io.observe(e)});window.addEventListener('scroll',function(){if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4)set(els[els.length-1].id)},{passive:true});if(els[0])set(els[0].id)})();`;

type Site = { name: string; tagline: string; short: string; categories: string[]; origin: string; theme: HostedTheme; ctaUrl: string; ctaLabel: string; lang: string };

async function siteOf(project: Project): Promise<Site> {
  const { profile } = await loadSiteProfile(project);
  const origin = siteOrigin(project);
  return {
    name: profile.name,
    tagline: profile.tagline,
    short: profile.short,
    categories: Array.isArray(profile.categories) ? profile.categories : [],
    origin,
    theme: normalizeTheme(project.hosted_theme),
    ctaUrl: project.hosted_cta_url || origin,
    ctaLabel: project.hosted_cta_label || `${stringsFor(project.language_code || "en").visit} ${profile.name}`,
    lang: project.language_code || "en",
  };
}

function shell(site: Site, opts: { title: string; description: string; canonical: string; body: string; head?: string; rail?: boolean; spy?: boolean }): string {
  const logo = site.theme.logo ? `<img src="${esc(site.theme.logo)}" alt="" width="26" height="26">` : "";
  return `<!doctype html>
<html lang="${esc(site.lang)}" dir="${dirFor(site.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
<meta name="theme-color" content="${esc(site.theme.mode === "dark" ? "#0a0a0a" : "#ffffff")}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(opts.title)}"><meta property="og:description" content="${esc(opts.description)}"><meta property="og:url" content="${esc(opts.canonical)}"><meta property="og:site_name" content="${esc(site.name)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} blog" href="${esc(site.origin)}/blog/feed.xml">
${site.theme.logo ? `<link rel="icon" href="${esc(site.theme.logo)}">` : ""}
${opts.head ?? ""}
<style>${palette(site.theme)}${CSS}</style>
</head>
<body>
<header class="mast"><div class="mast-in"><a class="brand" href="${esc(site.origin)}">${logo}${esc(site.name)}</a><nav><a href="${esc(site.origin)}/blog">${esc(stringsFor(site.lang).blog)}</a><a href="${esc(site.ctaUrl)}">${esc(site.ctaLabel)}</a></nav></div></header>
<main class="${opts.rail ? "rail" : ""}">
${opts.body}
</main>
<footer><span>© ${new Date().getUTCFullYear()} ${esc(site.name)}</span><a href="${esc(site.origin)}/blog/feed.xml">RSS</a></footer>
<script>${PAGE_JS}</script>
</body>
</html>`;
}

function promo(site: Site, cls = ""): string {
  const ticks = promoTicks(site);
  const logo = site.theme.logo ? `<img src="${esc(site.theme.logo)}" alt="" width="28" height="28">` : "";
  return `<aside class="promo ${cls}" aria-label="About ${esc(site.name)}">${logo}<p class="name">${esc(site.name)}</p><p class="line">${esc(site.tagline || site.short)}</p><ul>${ticks.map((t) => `<li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 8 14.5 16 5.5"/></svg><span>${esc(t)}</span></li>`).join("")}</ul><a class="cta" href="${esc(site.ctaUrl)}">${esc(site.ctaLabel)}</a></aside>`;
}

/** Up to three short lines for the card: the site profile's categories
 *  (what the site is about, written by the setup research). A profile
 *  without them gets no ticks - name, line and button carry the card. */
function promoTicks(site: Site): string[] {
  return site.categories.map((c) => c.trim()).filter((c) => c.length >= 3 && c.length <= 28).slice(0, 3);
}

function fmtDate(iso: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang || "en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function tocHtml(headings: Heading[], variant: "rail" | "inline", label: string): string {
  const links = headings.map((h) => `<li><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("");
  if (variant === "rail") return `<nav class="toc" aria-label="${esc(label)}"><p class="k">${esc(label)}</p><ul>${links}</ul></nav>`;
  return `<details class="toc-inline"><summary>${esc(label)} <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><nav aria-label="${esc(label)}"><ul>${links}</ul></nav></details>`;
}

export async function renderHostedIndex(project: Project, posts: HostedPost[], paging: { page: number; total: number } = { page: 1, total: posts.length }): Promise<string> {
  const site = await siteOf(project);
  const t = stringsFor(site.lang);
  const items = posts
    .map((p) => `<a class="card" href="${esc(hostedArticleUrl(project, p.slug))}"><h2>${esc(p.title)}</h2>${p.meta_description ? `<p>${esc(p.meta_description)}</p>` : ""}<time datetime="${esc(postDate(p))}">${esc(fmtDate(postDate(p), site.lang))}</time></a>`)
    .join("\n");
  const pages = Math.max(1, Math.ceil(paging.total / INDEX_PAGE_SIZE));
  const pager =
    pages > 1
      ? `<nav class="pager" aria-label="Pages">${paging.page > 1 ? `<a href="${esc(site.origin)}/blog${paging.page > 2 ? `?page=${paging.page - 1}` : ""}">←</a>` : "<span></span>"}<span>${paging.page} / ${pages}</span>${paging.page < pages ? `<a href="${esc(site.origin)}/blog?page=${paging.page + 1}">→</a>` : "<span></span>"}</nav>`
      : "";
  const body = `<section class="list"><h1>${esc(site.name)} ${esc(t.blog)}</h1><p class="sub">${esc(site.tagline || site.short || site.name)}</p>${items || `<p class="sub">${esc(t.none)}</p>`}${pager}${promo(site, "below")}</section>`;
  const canonical = `${site.origin}/blog${paging.page > 1 ? `?page=${paging.page}` : ""}`;
  return shell(site, { title: `${site.name} ${t.blog}${paging.page > 1 ? ` · ${paging.page}` : ""}`, description: site.short || site.tagline || site.name, canonical, body });
}

export async function renderHostedArticle(project: Project, post: HostedPost): Promise<string> {
  const site = await siteOf(project);
  const base = await backendBaseUrl();
  const cover = post.cover_url ? (post.cover_url.startsWith("http") ? post.cover_url : `${base}${post.cover_url}`) : null;
  const headings = headingsOf(post.rendered_html);
  const rail = headings.length >= 3;
  const canonical = hostedArticleUrl(project, post.slug);
  const t = stringsFor(site.lang);
  const arrow = dirFor(site.lang) === "rtl" ? "→" : "←";
  const back = `<a class="back" href="${esc(site.origin)}/blog"><span aria-hidden="true">${arrow}</span> ${esc(t.allPosts)}</a>`;
  // The byline the owner set (Settings > Author). Shown only when a real
  // person is named - the structured data says Person in exactly that case
  // (job-handlers/finish.ts), and the page must not claim less or more than
  // the schema does. The link is only ever the owner's own page: setAuthor
  // refuses an author_url off the site's domain.
  const authorName = project.author_name?.trim() || null;
  const authorUrl = authorName && project.author_url ? project.author_url : null;
  const byline = authorName
    ? `<span class="byline">${authorUrl ? `<a href="${esc(authorUrl)}" rel="author">${esc(authorName)}</a>` : esc(authorName)}</span>`
    : "";
  const bio = authorName && project.author_bio?.trim() ? `<aside class="author"><strong>${byline}</strong><p>${esc(project.author_bio.trim())}</p></aside>` : "";
  const body = `<article>
${back}
<h1>${esc(post.title)}</h1>
<p class="meta">${byline ? `${byline}<span aria-hidden="true">·</span>` : ""}<time datetime="${esc(postDate(post))}">${esc(fmtDate(postDate(post), site.lang))}</time><span aria-hidden="true">·</span><span>${readingMinutes(post.rendered_html)} ${esc(t.minRead)}</span></p>
${cover ? `<img class="cover" src="${esc(cover)}" alt="" width="1200" height="675" fetchpriority="high">` : ""}
${rail ? tocHtml(headings, "inline", t.onThisPage) : promo(site)}
<div class="body">${decorateBody(post.rendered_html, t.inShort)}</div>
${rail ? promo(site, "below") : ""}
${bio}
<div class="endnav">${back}</div>
</article>
${rail ? `<aside class="rail"><div>${tocHtml(headings, "rail", t.onThisPage)}${promo(site)}</div></aside>` : ""}`;
  const head = cover ? `<meta property="og:image" content="${esc(cover)}">` : "";
  return shell(site, { title: post.title, description: post.meta_description ?? "", canonical, body, head, rail, spy: rail });
}

export function renderHostedSitemap(project: Project, posts: HostedPost[]): string {
  const origin = siteOrigin(project);
  const urls = [`<url><loc>${esc(origin)}/blog</loc></url>`, ...posts.map((p) => `<url><loc>${esc(hostedArticleUrl(project, p.slug))}</loc><lastmod>${esc(postDate(p).slice(0, 10))}</lastmod></url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export async function renderHostedFeed(project: Project, posts: HostedPost[]): Promise<string> {
  const site = await siteOf(project);
  const items = posts
    .slice(0, 30)
    .map((p) => `<item><title>${esc(p.title)}</title><link>${esc(hostedArticleUrl(project, p.slug))}</link><guid>${esc(hostedArticleUrl(project, p.slug))}</guid><pubDate>${new Date(postDate(p)).toUTCString()}</pubDate>${p.meta_description ? `<description>${esc(p.meta_description)}</description>` : ""}</item>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(site.name)} blog</title><link>${esc(site.origin)}/blog</link><description>${esc(site.short || site.tagline || site.name)}</description>\n${items}\n</channel></rss>\n`;
}

/** The one inline script the pages carry, allowed by hash below. */
const PAGE_JS_HASH = `sha256-${createHash("sha256").update(PAGE_JS).digest("base64")}`;

/** These pages are served on OUR origin (the customer forwards to it) and
 *  their content originates with tenants, so nothing on them may run except
 *  the one hashed script: no inline handlers, no external scripts, no frames,
 *  no form posts, no fetches. The renderer already refuses raw HTML and
 *  javascript: links; this is the second lock on the same door. (JSON-LD is
 *  a data block the browser never executes, so the policy does not touch it.) */
const CSP = [
  "default-src 'none'",
  `script-src '${PAGE_JS_HASH}'`,
  "style-src 'unsafe-inline'",
  "img-src https: data:",
  "font-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function hostedHeaders(contentType: string): HeadersInit {
  return {
    "content-type": contentType,
    [HOSTED_HEADER]: "1",
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    // Five minutes at the edge, a day stale-while-revalidate: a new article
    // shows within minutes and a database blip never takes the blog down.
    "cache-control": "public, s-maxage=300, stale-while-revalidate=86400",
  };
}

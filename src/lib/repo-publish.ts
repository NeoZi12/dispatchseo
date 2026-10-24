import { tokenForRef } from "./github";
import { faqHeadingFor } from "@/lib/writer/evidence";
import type { Project } from "./projects";
import { yamlDoubleQuote } from "./article-render";
import { backendBaseUrl } from "./pipeline-pack";
import { db } from "./db";

// Publishing an article into the customer's own Git repository - from our
// server, not from an agent in their CI.
//
// WHY THIS EXISTS. The repo route used to mean "a coding agent inside your
// GitHub Actions writes the file and opens the PR". That is fine for an owner
// who runs Claude Code or Codex, and a dead end for the owner whose AI is a
// chat app: they have a repo, they have an article, and nothing in between.
// So the server does the mechanical half itself - commit the markdown on a
// branch, open a pull request, merge it when the project is on Auto - and the
// verify job confirms the page afterwards, exactly as it does for WordPress.
//
// THE HARD PART IS NOT GIT, IT IS FITTING IN. Every static-site generator
// invents its own frontmatter: Astro wants `pubDate` and `heroImage`, Hugo
// wants `date` and `draft`, Jekyll wants `_posts/YYYY-MM-DD-name.md` and a
// `layout`. Committing OUR shape into THEIR repo means a build that fails on
// a missing required field, which for the owner reads as "DispatchSEO broke my
// site". So we read a file that is already there and mirror it: the same key
// names, the same date format, the same file naming. It is imitation rather
// than configuration, because the owner should not have to describe their
// build system to us before their first article can ship.
//
// The pure helpers below (scoring, frontmatter, naming, URL prediction) are
// exported separately from the orchestrator so they can be exercised without a
// GitHub token - they carry all of the guessing, and guessing is what needs
// checking.

const GH = "https://api.github.com";

/** Mirrors pipeline-install.ts's helper: same headers, same 20s bound. A hung
 *  GitHub socket must not sit inside the jobs cron's budget until the platform
 *  kills the whole batch. */
export async function githubApi(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  return gh(token, method, path, body);
}

async function gh(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  let res: Response;
  try {
    res = await fetch(`${GH}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dispatchseo-app",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // A network failure and a 5xx mean the same thing to every caller here -
    // try again later - so it is reported as a status rather than thrown, and
    // the one throw site (the orchestrator's github-error) stays the only one.
    return { status: 0, json: null };
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Finding where the articles live
// ---------------------------------------------------------------------------

/** Directory segments that name a place articles live. Worth much more than a
 *  file count: one post in `content/blog` is a stronger signal than forty
 *  markdown files in `docs`. */
const ARTICLE_SEGMENTS = new Set([
  "blog",
  "blogs",
  "posts",
  "post",
  "articles",
  "article",
  "guides",
  "guide",
  "news",
  "insights",
  "journal",
  "writing",
  "stories",
  "resources",
]);

/** Segments that merely mean "content lives somewhere under here". A weak
 *  nudge, because they are also where a site keeps its legal pages.
 *  (The spec's `src/content` is covered by its `content` segment - a
 *  path with a slash can never match a single path segment.) */
const CONTAINER_SEGMENTS = new Set(["content", "_posts", "collections"]);

/** Files that are repo furniture, never articles. Matched on the basename's
 *  START so README.md, readme.mdx and CHANGELOG.old.md all go. */
const FURNITURE = [
  "readme",
  "changelog",
  "license",
  "contributing",
  "code_of_conduct",
  "security",
];

const IGNORED_PREFIXES = ["node_modules/", "vendor/"];

/** Path segments that are never where a site's articles live, at any depth:
 *  every dot-directory (.github, .changeset, .claude, .cursor, .dispatchseo -
 *  tooling that happens to keep markdown) and docs/ (a project's own
 *  documentation). A 2026-10 repo published its first article into
 *  .changeset/ because changeset notes are a folder of short .md files
 *  (audit C4). */
function ignoredSegment(segment: string): boolean {
  return segment.startsWith(".") || segment.toLowerCase() === "docs";
}

export type ContentDirCandidate = {
  /** Repo-relative directory, no trailing slash. */
  dir: string;
  /** Repo-relative paths of the markdown files directly inside it. */
  files: string[];
  score: number;
  /** The directory (or a parent) is NAMED for articles (blog, posts,
   *  articles, news, guides, journal...). A candidate without a name has to
   *  prove itself by its files' frontmatter (see qualifiesByFrontmatter)
   *  before anything is committed into it. */
  named: boolean;
};

/** Segments that alone qualify a directory as the articles folder. Narrower
 *  than ARTICLE_SEGMENTS on purpose: "resources" or "stories" is often
 *  marketing copy, and those must prove themselves by frontmatter. */
const QUALIFYING_SEGMENTS = new Set(["blog", "blogs", "posts", "post", "_posts", "articles", "article", "news", "guides", "guide", "journal"]);

function isNamedForArticles(dir: string): boolean {
  return dir.split("/").some((seg) => QUALIFYING_SEGMENTS.has(seg.toLowerCase()));
}

/** At least two of these files open with frontmatter carrying a `title:` key:
 *  the shape of a folder of posts, as opposed to a folder of notes, legal
 *  pages or component docs. */
export function qualifiesByFrontmatter(texts: string[]): boolean {
  return texts.filter((t) => "title" in parseFrontmatter(t).raw).length >= 2;
}

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function baseOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}

/**
 * Rank every directory in a repo tree by how much it looks like the folder the
 * site keeps its articles in.
 *
 * Input is every path in the tree (the recursive git-trees listing); output is
 * every plausible directory, best first. Returning all of them rather than the
 * winner is deliberate - the caller picks [0], and a human reading a support
 * ticket can see what came second.
 */
/** Upper bound on directories that enter the pairwise demotion pass. */
const MAX_SCORED_DIRS = 300;

export function scoreContentDirs(paths: string[]): ContentDirCandidate[] {
  const byDir = new Map<string, string[]>();

  for (const path of paths) {
    const lower = path.toLowerCase();
    if (!lower.endsWith(".md") && !lower.endsWith(".mdx")) continue;
    if (IGNORED_PREFIXES.some((p) => path.startsWith(p) || path.includes(`/${p}`))) continue;
    if (path.split("/").slice(0, -1).some(ignoredSegment)) continue;
    const base = baseOf(path).toLowerCase();
    if (FURNITURE.some((f) => base.startsWith(f))) continue;
    const dir = dirOf(path);
    // A repo root is never "where the site keeps its articles" - and an index
    // page there is the site's own homepage source, not an article.
    if (dir === "") continue;
    const list = byDir.get(dir);
    if (list) list.push(path);
    else byDir.set(dir, [path]);
  }

  let candidates: ContentDirCandidate[] = [];
  for (const [dir, files] of byDir) {
    candidates.push({ dir, files: files.slice().sort(), score: files.length + nameBonus(dir), named: isNamedForArticles(dir) });
  }
  // BOUNDED before the pairwise pass below. A hostile (or merely enormous)
  // repo can present tens of thousands of one-file directories, and a
  // quadratic walk over those blocks the event loop long enough that the
  // drain route's own deadline never fires and every co-claimed job wedges.
  // The real answer is always near the top of this ordering, so keeping the
  // best few hundred by score loses nothing.
  if (candidates.length > MAX_SCORED_DIRS) {
    candidates = candidates
      .sort((a, b) => b.score - a.score || b.files.length - a.files.length)
      .slice(0, MAX_SCORED_DIRS);
  }
  const bonusOf = new Map(candidates.map((c) => [c.dir, nameBonus(c.dir)] as const));

  // DEEPER WINS when the deeper directory is the one actually NAMED for
  // articles. A repo with content/ and content/blog/ means articles in the
  // second and something else in the first, however many files the first
  // holds. The test is a HIGHER name bonus, not merely a nonzero one: a
  // descendant inherits every segment of its ancestor's path, so content/legal
  // scores the same "content" point that content does - and a site with twenty
  // posts in content/ and one terms page in content/legal/ would otherwise
  // publish into legal/.
  const demoted = new Set<string>();
  for (const a of candidates) {
    const aBonus = bonusOf.get(a.dir) ?? 0;
    for (const b of candidates) {
      if (a === b) continue;
      if (b.dir.startsWith(`${a.dir}/`) && (bonusOf.get(b.dir) ?? 0) > aBonus) demoted.add(a.dir);
    }
  }

  return candidates.sort((a, b) => {
    const aDemoted = demoted.has(a.dir) ? 1 : 0;
    const bDemoted = demoted.has(b.dir) ? 1 : 0;
    if (aDemoted !== bDemoted) return aDemoted - bDemoted;
    if (b.score !== a.score) return b.score - a.score;
    if (b.files.length !== a.files.length) return b.files.length - a.files.length;
    return a.dir.localeCompare(b.dir);
  });
}

function nameBonus(dir: string): number {
  let bonus = 0;
  for (const segment of dir.split("/")) {
    const s = segment.toLowerCase();
    if (ARTICLE_SEGMENTS.has(s)) bonus += 3;
    else if (CONTAINER_SEGMENTS.has(s)) bonus += 1;
  }
  return bonus;
}

// ---------------------------------------------------------------------------
// Reading a neighbour's frontmatter
// ---------------------------------------------------------------------------

export type ParsedSample = {
  /** Keys in the order they appear, so a mirrored file reads like its siblings. */
  keys: string[];
  /** Values with surrounding quotes stripped - for comparing. */
  values: Record<string, string>;
  /** Values exactly as written - for copying through untouched. */
  raw: Record<string, string>;
  /** Whether the sample's FILE NAME carried a YYYY-MM-DD- prefix. Not set by
   *  parseFrontmatter (which never sees a file name); carried on this type so
   *  a caller that knows both can hand one object onward. */
  datePrefixed?: boolean;
  /** Whether the sample's BODY opens with a markdown H1. Most layouts render
   *  the frontmatter title themselves, so their posts carry no H1 and ours
   *  must not either (clockedcode.com showed the title twice, 2026-10-24). */
  bodyHasH1?: boolean;
};

/**
 * Read the leading `---` block of a markdown file as flat `key: value` pairs.
 *
 * Deliberately NOT a YAML parser. We only ever ask three questions of a
 * sample - which key names does this site use, is the date quoted, does it
 * have a cover field - and every one of them is answered by the top-level
 * keys. Nested blocks and lists are skipped rather than parsed, so a file we
 * only half-understand still teaches us the naming, and no YAML dependency is
 * added to read six lines.
 */
export function parseFrontmatter(text: string): ParsedSample {
  const empty: ParsedSample = { keys: [], values: {}, raw: {} };
  if (!text) return empty;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  // A leading BOM or blank line before the fence is common enough to survive.
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i].replace(/^﻿/, "").trim() !== "---") return empty;
  i++;

  const keys: string[] = [];
  const values: Record<string, string> = {};
  const raw: Record<string, string> = {};

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "---" || trimmed === "...") break;
    // Indented = a child of the key above it, or a list item. We do not model
    // nesting, so it is skipped rather than mistaken for a top-level key.
    if (/^\s/.test(line)) continue;
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    if (!(key in raw)) keys.push(key);
    raw[key] = value;
    values[key] = stripQuotes(value);
  }

  // The first non-blank body line after the closing fence: an H1 there means
  // this site's posts repeat the title in the body, so ours may too.
  let j = i + 1;
  while (j < lines.length && lines[j].trim() === "") j++;
  const bodyHasH1 = j < lines.length && /^#\s+\S/.test(lines[j].trim());

  return { keys, values, raw, bodyHasH1 };
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

// The key names a generator might use for each role, in the order we would
// choose them. First hit in the sample wins; the head of each list is our
// default when the sample has none of them.
const DESCRIPTION_KEYS = [
  "description",
  "summary",
  "excerpt",
  "meta_description",
  "metaDescription",
  "seoDescription",
];
const DATE_KEYS = [
  "date",
  "pubDate",
  // AstroPaper and its forks: a required z.date(); a post without it fails
  // the content-collection build.
  "pubDatetime",
  "publishedAt",
  "published",
  "publishDate",
  "datePublished",
  "created",
];
const COVER_KEYS = ["cover", "image", "heroImage", "hero", "thumbnail", "coverImage", "ogImage"];
/** Keys whose value is about the SITE, not the article - copied through byte
 *  for byte, because a build that requires `layout: post` requires the exact
 *  string this repo already uses. */
const VERBATIM_KEYS = ["author", "authors", "layout", "lang", "locale", "category", "categories"];

export type ArticleFileInput = {
  title: string;
  metaDescription: string;
  primaryKeyword: string;
  /** The ORIGINAL markdown, never our rendered HTML - a repo wants source. */
  markdown: string;
  /** YYYY-MM-DD. */
  dateIso: string;
  /** Site-root-relative path of the cover we also committed, if any. */
  coverPath?: string | null;
  /** Real Q&A pairs, appended as a markdown section. On the WordPress route
   *  the finisher renders these into the HTML and the FAQ schema; a repo gets
   *  the markdown and its own generator's schema, so the questions ride in the
   *  body where the site's template can see them. */
  faq?: { question: string; answer: string }[] | null;
  /** The site's own host: links to it are written root-relative, the way the
   *  repo's own posts link each other (and the way a site's content lint
   *  counts them - Paperbot's requires `](/blog/...)` and failed the first
   *  hosted article's build over an absolute URL to its own guide). */
  siteDomain?: string | null;
  /** The FAQ section heading in the article's language (writer/evidence
   *  faqHeadingFor); defaults to English. */
  faqHeading?: string | null;
};

/** Whether a sample has a cover-shaped key at all - the one signal that this
 *  site's articles carry an image, and therefore that committing one is
 *  useful rather than a stray binary in someone's repo. */
export function sampleCoverKey(sample: ParsedSample | null): string | null {
  if (!sample) return null;
  return COVER_KEYS.find((k) => k in sample.raw) ?? null;
}

/**
 * The file to commit: frontmatter shaped like the sample's, then the article's
 * own markdown.
 *
 * Every key we emit is either one the sample already uses (so the build finds
 * what it requires) or one of ours that no generator reads (so adding it is
 * free). What we never do is RENAME the sample's keys or invent values for
 * fields we cannot know - a wrong `author` is worse than a missing one.
 */
export function buildArticleFile(sample: ParsedSample | null, article: ArticleFileInput): string {
  const lines: string[] = [];
  const emitted = new Set<string>();
  const push = (key: string, value: string) => {
    if (emitted.has(key)) return;
    emitted.add(key);
    lines.push(`${key}: ${value}`);
  };

  const firstPresent = (candidates: string[]): string | null =>
    sample ? (candidates.find((k) => k in sample.raw) ?? null) : null;

  push("title", yamlDoubleQuote(article.title));

  const descKey = firstPresent(DESCRIPTION_KEYS) ?? DESCRIPTION_KEYS[0];
  push(descKey, yamlDoubleQuote(article.metaDescription));

  const dateKey = firstPresent(DATE_KEYS) ?? DATE_KEYS[0];
  // Follow the sample's quoting rather than ours. A bare 2026-08-20 is a YAML
  // DATE and a quoted one is a string, and some schemas accept only one of
  // them - so the safe answer is whichever this repo already writes.
  const sampleDate = sample && dateKey in sample.raw ? sample.raw[dateKey] : null;
  const dateUnquoted = sampleDate !== null && !/^["']/.test(sampleDate);
  // And its precision: a sample written as a full timestamp
  // (pubDatetime: 2022-09-23T15:22:00Z) gets one, midnight UTC of the day.
  const withTime = sampleDate !== null && /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(sampleDate);
  const dateValue = withTime ? `${article.dateIso}T00:00:00Z` : article.dateIso;
  push(dateKey, dateUnquoted ? dateValue : yamlDoubleQuote(dateValue));

  const coverKey = sampleCoverKey(sample);
  if (coverKey && article.coverPath) push(coverKey, yamlDoubleQuote(article.coverPath));

  for (const key of VERBATIM_KEYS) {
    if (sample && key in sample.raw) push(key, sample.raw[key]);
  }

  // A site that marks drafts expects the field on every post; ours is never a
  // draft by the time it reaches here.
  if (sample && "draft" in sample.raw) push("draft", "false");
  // Only when the site already has tags - inventing a taxonomy would create
  // one-post tag pages that exist to be thin.
  if (sample && "tags" in sample.raw) push("tags", `[${yamlDoubleQuote(article.primaryKeyword)}]`);

  // Ours, and nobody else's: the term this article targets, so a later reader
  // (us or the owner) can tell what it was written for. Skipped when the site
  // already spends that key on something of its own.
  if (article.primaryKeyword.trim() && !(sample && "keyword" in sample.raw)) {
    push("keyword", yamlDoubleQuote(article.primaryKeyword));
  }

  return `---\n${lines.join("\n")}\n---\n\n${bodyWithFaq(article, sample)}\n`;
}

/** The article body plus its FAQ as plain markdown. The gate guarantees every
 *  question ends in "?" and every answer is a real sentence, so this only
 *  lays them out; an article with no FAQ is returned untouched. No schema
 *  script is injected: in MDX a raw <script> with JSON braces is parsed as an
 *  expression and breaks the build, and every static-site generator this
 *  targets emits its own structured data. */
function bodyWithFaq(article: ArticleFileInput, sample: ParsedSample | null): string {
  // The frontmatter carries the title; unless this site's own posts open with
  // an H1, the layout prints it and a body H1 would show it twice.
  const withTitle = sample?.bodyHasH1 ? article.markdown : article.markdown.replace(/^\s*#\s+[^\n]*\n+/, "");
  const body = relativizeOwnLinks(withTitle, article.siteDomain).trim();
  const faq = (article.faq ?? []).filter(
    (f) => f && typeof f.question === "string" && typeof f.answer === "string" && f.question.trim() && f.answer.trim(),
  );
  if (faq.length === 0) return body;
  const section = faq
    .map((f) => `### ${f.question.trim().replace(/\s+/g, " ")}\n\n${f.answer.trim()}`)
    .join("\n\n");
  return `${body}\n\n## ${(article.faqHeading ?? "").trim() || "Frequently asked questions"}\n\n${section}`;
}

/** `[text](https://www.site.com/blog/x)` -> `[text](/blog/x)` for the site's
 *  own host only (www. or not, http or https); every other link is untouched.
 *  The home page becomes `/`. Only markdown link targets are rewritten, so a
 *  URL quoted in prose stays as the writer put it. */
export function relativizeOwnLinks(markdown: string, siteDomain: string | null | undefined): string {
  const own = (siteDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").toLowerCase();
  if (!own) return markdown;
  const host = own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\]\\(https?://(?:www\\.)?${host}(/[^)\\s]*)?\\)`, "gi");
  return markdown.replace(re, (_m, path: string | undefined) => `](${path && path.length ? path : "/"})`);
}

// ---------------------------------------------------------------------------
// Naming the file
// ---------------------------------------------------------------------------

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

/** A sample file name reduced to the part a URL is usually built from: no date
 *  prefix, no extension. */
export function fileStem(name: string): string {
  return name.replace(/\.mdx?$/i, "").replace(DATE_PREFIX, "");
}

/**
 * What to call the new file, copied from what the neighbours are called.
 *
 * Jekyll REQUIRES the YYYY-MM-DD- prefix (a post without one is not a post),
 * Astro and Next never use it, and a repo that uses .mdx everywhere will have
 * a component import somewhere that a .md file cannot serve. Both are read off
 * the directory rather than configured.
 *
 * `ext` is the fallback for a directory with no files to learn from; when
 * there are samples, their majority extension wins (a tie goes to .mdx, which
 * is a superset - plain markdown is valid MDX).
 */
export function chooseFileName(
  sampleNames: string[],
  slug: string,
  ext: ".md" | ".mdx",
  dateIso: string,
): string {
  const names = sampleNames.map(baseOf);
  const mdx = names.filter((n) => /\.mdx$/i.test(n)).length;
  const md = names.filter((n) => /\.md$/i.test(n)).length;
  const chosenExt: ".md" | ".mdx" = mdx + md === 0 ? ext : mdx >= md ? ".mdx" : ".md";

  const dated = names.filter((n) => DATE_PREFIX.test(n)).length;
  const prefix = names.length > 0 && dated * 2 > names.length ? `${dateIso}-` : "";

  const taken = new Set(names.map((n) => n.toLowerCase()));
  let name = `${prefix}${slug}${chosenExt}`;
  // A collision means the owner already has an article at this slug. Adding a
  // suffix beats overwriting theirs, and beats failing: the PR is reviewable,
  // and a duplicate is a thing they can see and close.
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    name = `${prefix}${slug}-${n}${chosenExt}`;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Guessing the published address
// ---------------------------------------------------------------------------

/** Directory names that are build plumbing rather than a URL segment - a file
 *  in `src/content/blog` is served at /blog/..., never at /src/... */
const NON_URL_SEGMENTS = new Set(["content", "src", "pages", "app", "data"]);

/**
 * Where the committed article will probably be readable, best guess first.
 *
 * There is no way to KNOW: the mapping from a repo path to a URL lives in a
 * framework's routing config, which we do not read. But the site's own crawled
 * pages are a demonstrated answer - if `older-post.md` sits in this directory
 * and https://site.com/blog/older-post is a real page of the site, then the
 * prefix is /blog and the guess stops being a guess. The fallbacks after it
 * are the shapes every other generator uses, and the verify job simply asks
 * each in turn until one answers 200.
 */
export function predictUrls(opts: {
  domain: string;
  dir: string;
  slug: string;
  sampleStems: string[];
  linkCandidates: { url: string }[];
}): string[] {
  const paths: string[] = [];
  const stems = new Set(opts.sampleStems.map((s) => s.toLowerCase()));

  for (const candidate of opts.linkCandidates) {
    let parsed: URL;
    try {
      parsed = new URL(candidate.url);
    } catch {
      continue;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last || !stems.has(last.toLowerCase())) continue;
    const prefix = segments.slice(0, -1).join("/");
    paths.push(prefix ? `/${prefix}/${opts.slug}` : `/${opts.slug}`);
  }

  const lastDirSegment = opts.dir.split("/").filter(Boolean).pop() ?? "";
  if (lastDirSegment && !NON_URL_SEGMENTS.has(lastDirSegment.toLowerCase())) {
    paths.push(`/${lastDirSegment}/${opts.slug}`);
  }
  paths.push(`/${opts.slug}`);
  for (const prefix of ["blog", "posts", "articles", "guides"]) {
    paths.push(`/${prefix}/${opts.slug}`);
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const path of paths) {
    const url = `https://${opts.domain}${path}`;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= 8) break;
  }
  return urls;
}

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

export type RepoDraft = {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  primary_keyword: string | null;
  markdown: string;
  cover_url: string | null;
  faq?: { question: string; answer: string }[] | null;
  pr_url: string | null;
  pr_number: number | null;
  repo_path: string | null;
};

export type RepoPublishResult =
  | {
      ok: true;
      prUrl: string;
      prNumber: number;
      repoPath: string;
      predictedUrls: string[];
      merged: boolean;
    }
  | { ok: false; reason: "no-content-dir" | "no-token" | "github-error"; message: string };

/** One PR, as the verify job needs to see it. Kept here so verify.ts holds no
 *  GitHub plumbing of its own. */
export type PullRequestState = {
  number: number;
  html_url: string;
  state: string;
  merged_at: string | null;
  mergeable_state: string | null;
};

export async function fetchPullRequest(
  project: Project,
  number: number,
): Promise<PullRequestState | null> {
  if (!project.github_repo) return null;
  const token = await tokenForRef(project);
  if (!token) return null;
  const res = await gh(token, "GET", `/repos/${project.github_repo}/pulls/${number}`);
  if (res.status !== 200 || !res.json) return null;
  return {
    number,
    html_url: String(res.json.html_url ?? ""),
    state: String(res.json.state ?? ""),
    merged_at: (res.json.merged_at as string | null) ?? null,
    mergeable_state: (res.json.mergeable_state as string | null) ?? null,
  };
}

/**
 * Commit the article, open the pull request, and merge it when this project
 * publishes automatically.
 *
 * Every failure is returned rather than thrown, because the three kinds mean
 * three different things to the job handler above: the owner has to tell us
 * where their articles live (their setup, quiet), a stored GitHub connection
 * will not resolve (a regression, loud), or GitHub had a bad minute (retry).
 */
export async function publishDraftToRepo(
  project: Project,
  draft: RepoDraft,
): Promise<RepoPublishResult> {
  const repo = project.github_repo;
  if (!repo) return { ok: false, reason: "no-token", message: "no repository connected" };

  const token = await tokenForRef(project);
  if (!token) return { ok: false, reason: "no-token", message: "no GitHub credential resolved" };

  const bad = (step: string, status: number): RepoPublishResult => ({
    ok: false,
    reason: "github-error",
    message: `${step}: HTTP ${status}`,
  });

  // ALREADY OPEN. A retry after a failed status write must not commit the
  // article twice - the PR we already opened IS the publication, so the job
  // resumes from it exactly as the WordPress handler resumes from wp_post_id.
  if (draft.pr_number) {
    const existing = await gh(token, "GET", `/repos/${repo}/pulls/${draft.pr_number}`);
    if (existing.status !== 200 || !existing.json) return bad("pull request lookup", existing.status);
    // The URLs are re-derived from the stored path so a resumed run can still
    // arm a verify chain if the first one was lost (the handler checks before
    // arming; see publish-repo.ts). No sample stems without the tree, so this
    // leans on the digest and the fallback list - the same order as a fresh
    // run minus the one hint the stems provide.
    return {
      ok: true,
      prUrl: String(existing.json.html_url ?? draft.pr_url ?? ""),
      prNumber: draft.pr_number,
      repoPath: draft.repo_path ?? "",
      predictedUrls: predictUrls({
        domain: project.domain,
        dir: draft.repo_path ? dirOf(draft.repo_path) : "",
        slug: draft.slug,
        sampleStems: [],
        linkCandidates: await linkCandidatesFor(project.id),
      }),
      merged: Boolean(existing.json.merged_at),
    };
  }

  const repoInfo = await gh(token, "GET", `/repos/${repo}`);
  if (repoInfo.status !== 200) return bad("repo lookup", repoInfo.status);
  const baseBranch = String(repoInfo.json?.default_branch ?? "main");

  const ref = await gh(
    token,
    "GET",
    `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${baseBranch}`)}`,
  );
  const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;
  if (ref.status !== 200 || !headSha) return bad("branch ref lookup", ref.status);

  const headCommit = await gh(token, "GET", `/repos/${repo}/git/commits/${headSha}`);
  const baseTree = (headCommit.json?.tree as { sha?: string } | undefined)?.sha;
  if (headCommit.status !== 200 || !baseTree) return bad("base tree lookup", headCommit.status);

  const treeRes = await gh(token, "GET", `/repos/${repo}/git/trees/${baseTree}?recursive=1`);
  if (treeRes.status !== 200) return bad("tree listing", treeRes.status);
  const entries = (treeRes.json?.tree as { path?: string; type?: string }[] | undefined) ?? [];
  const allPaths = entries.filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));
  if (treeRes.json?.truncated === true) {
    // GitHub caps a recursive listing at ~100k entries. Proceeding on the
    // prefix we did get is right: content directories sit near the top of a
    // repo, and refusing to publish because someone's repo is enormous helps
    // nobody. Worth saying out loud in the run log if a guess later looks odd.
    console.warn(`[repo-publish] ${repo}: tree listing was truncated; scoring what came back`);
  }

  // WHERE THE ARTICLES LIVE. The owner's hint wins when it points at something
  // real - they know their repo - and the scorer answers when they never said.
  const hint = normalizeDirHint(project.content_path_hint);
  const candidates = scoreContentDirs(allPaths);
  let dir: string | null = null;
  let dirFiles: string[] = [];
  // The hint wins when it points at something real. It ALSO wins when the
  // scorer has nothing to offer, or when the listing was cut short - git
  // creates a directory on first commit, and an owner who typed "content/blog"
  // into an empty site must not be sent back to the same Settings field by a
  // scorer that found no articles because there are none yet.
  const hintExists = Boolean(hint) && allPaths.some((p) => p.startsWith(`${hint}/`));
  if (hint && (hintExists || !candidates[0] || treeRes.json?.truncated === true)) {
    dir = hint;
    // Only the markdown DIRECTLY inside it - a sample from a subfolder would
    // teach the wrong naming for the folder we are about to write into.
    dirFiles = allPaths.filter((p) => dirOf(p) === hint && /\.mdx?$/i.test(p)).sort();
  }
  if (!dir) {
    // A candidate must QUALIFY, not merely rank first: named for articles, or
    // at least two of its files carry a frontmatter title (read from the
    // repo, at most three files for each of the first four candidates).
    // Ranking first among a repo's markdown used to be enough, which is how
    // an article landed in a folder of changeset notes. Nothing qualifying
    // means no-content-dir, and a hosted site then gets the hosted blog.
    let best: ContentDirCandidate | null = null;
    for (const c of candidates.slice(0, 4)) {
      if (c.named) {
        best = c;
        break;
      }
      const texts: string[] = [];
      for (const f of c.files.slice(-3)) {
        const res = await gh(token, "GET", `/repos/${repo}/contents/${encodeURI(f)}?ref=${encodeURIComponent(baseBranch)}`);
        if (res.status === 200 && typeof res.json?.content === "string") {
          try {
            texts.push(Buffer.from(res.json.content as string, "base64").toString("utf8"));
          } catch {
            // unreadable file: it simply does not count
          }
        }
      }
      if (qualifiesByFrontmatter(texts)) {
        best = c;
        break;
      }
    }
    if (!best) {
      return {
        ok: false,
        reason: "no-content-dir",
        message: "no directory in this repo looks like where its articles live",
      };
    }
    dir = best.dir;
    dirFiles = best.files;
  }

  // THE NEIGHBOUR WE COPY. Last in sorted order, because a date-prefixed set
  // sorts oldest to newest and the newest file is the one most likely to match
  // what this site's build currently requires.
  let sample: ParsedSample | null = null;
  const samplePath = dirFiles[dirFiles.length - 1];
  if (samplePath) {
    const contents = await gh(
      token,
      "GET",
      `/repos/${repo}/contents/${encodeURI(samplePath)}?ref=${encodeURIComponent(baseBranch)}`,
    );
    if (contents.status === 200 && typeof contents.json?.content === "string") {
      try {
        const text = Buffer.from(contents.json.content as string, "base64").toString("utf8");
        sample = parseFrontmatter(text);
        sample.datePrefixed = DATE_PREFIX.test(baseOf(samplePath));
      } catch {
        // An unreadable sample costs us the mirroring, not the article: our own
        // defaults still produce a valid post for most generators.
        sample = null;
      }
    }
  }

  const slug = draft.slug;
  const dateIso = new Date().toISOString().slice(0, 10);
  const treeEntries: Record<string, unknown>[] = [];

  // THE COVER, and the conditions on it. A site whose posts carry no image
  // field would never render one, and a repo with no public/ for the app
  // that serves this folder has no convention for where an image goes - in
  // both cases committing a PNG is litter in someone else's repository.
  // Every failure below simply drops the cover.
  //
  // Where it goes follows the neighbour's own value:
  //   relative (Astro's image() schema: "../../assets/hero.jpg")  next to
  //            the file the sample points at, referenced by the same
  //            relative path - a site-root "/images/..." string FAILS that
  //            schema and breaks the build (audit H6);
  //   anything else  <app>/public/images/dispatchseo/, where <app> is the
  //            monorepo app (apps/<x>, packages/<x>) that owns the content
  //            folder, or the repo root. A root public/ is not served by an
  //            app under apps/, which is how a monorepo article shipped with a
  //            cover pointing at nothing.
  let coverPath: string | null = null;
  const coverKey = sampleCoverKey(sample);
  const sampleCover = coverKey && sample ? (sample.values[coverKey] ?? "") : "";
  const relCover = /^\.\.?\//.test(sampleCover);
  const appRoot = dir.match(/^((?:apps|packages)\/[^/]+)\//)?.[1] ?? "";
  const publicPrefix = appRoot ? `${appRoot}/public/` : "public/";
  let coverTarget: { repoPath: string; ref: string } | null = null;
  if (draft.cover_url && coverKey) {
    if (relCover) {
      const relDir = sampleCover.slice(0, sampleCover.lastIndexOf("/")) || ".";
      const repoPath = normalizeRepoPath(`${dir}/${relDir}/${slug}.png`);
      if (repoPath) coverTarget = { repoPath, ref: `${relDir}/${slug}.png` };
    } else if (allPaths.some((p) => p.startsWith(publicPrefix))) {
      coverTarget = { repoPath: `${publicPrefix}images/dispatchseo/${slug}.png`, ref: `/images/dispatchseo/${slug}.png` };
    }
  }
  if (draft.cover_url && coverTarget) {
    try {
      const { fetchCover } = await import("./job-handlers/publish");
      const image = await fetchCover(draft.cover_url);
      // A cover that cannot be fetched is dropped, but never silently: the
      // first ClockedCode article shipped without one because the publish ran
      // before the deploy serving /api/cover was live, and nothing said so.
      if (!image) console.warn(`[publish-repo] cover dropped for ${slug}: ${draft.cover_url} did not return an image`);
      if (image) {
        const blob = await gh(token, "POST", `/repos/${repo}/git/blobs`, {
          content: Buffer.from(image.bytes).toString("base64"),
          encoding: "base64",
        });
        if (blob.status === 201 && blob.json?.sha) {
          treeEntries.push({
            path: coverTarget.repoPath,
            mode: "100644",
            type: "blob",
            sha: String(blob.json.sha),
          });
          coverPath = coverTarget.ref;
        }
      }
    } catch {
      coverPath = null;
    }
  }

  const fileName = chooseFileName(dirFiles, slug, ".mdx", dateIso);
  const repoPath = `${dir}/${fileName}`;
  const content = buildArticleFile(sample, {
    title: draft.title,
    metaDescription: draft.meta_description ?? "",
    primaryKeyword: draft.primary_keyword ?? "",
    markdown: draft.markdown,
    faq: draft.faq ?? null,
    dateIso,
    coverPath,
    siteDomain: project.domain,
    faqHeading: faqHeadingFor(project.language_code),
  });
  treeEntries.unshift({ path: repoPath, mode: "100644", type: "blob", content });

  // The draft id rides in the branch name: a slug alone would let a later
  // draft that reuses it (the first was discarded, its PR left open) force-reset
  // the first draft's branch and adopt its pull request. Eight hex characters
  // keep it readable and unique enough for one repo.
  const branch = `dispatchseo/article-${slug}-${draft.id.replace(/-/g, "").slice(0, 8)}`;
  const created = await gh(token, "POST", `/repos/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: headSha,
  });
  if (created.status === 422) {
    // The branch survived a previous attempt. Reset it to the current head
    // rather than committing on top of whatever it holds - the file below is
    // built against THIS tree.
    await gh(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, {
      sha: headSha,
      force: true,
    });
  } else if (created.status !== 201) {
    return bad("branch create", created.status);
  }

  const tree = await gh(token, "POST", `/repos/${repo}/git/trees`, {
    base_tree: baseTree,
    tree: treeEntries,
  });
  if (tree.status !== 201 || !tree.json?.sha) return bad("tree create", tree.status);

  // Who wrote it, truthfully: on a hosted-writer site our server did (there
  // is no "owner's AI"), on an agent site the owner's own agent did.
  const hostedWriter = project.writer_mode === "hosted";
  const commit = await gh(token, "POST", `/repos/${repo}/git/commits`, {
    message:
      `Add article: ${draft.title}\n\n` +
      (hostedWriter
        ? `Written by DispatchSEO for ${project.domain}; committed by the DispatchSEO app.`
        : "Written by the owner's AI and handed in through DispatchSEO; committed by the DispatchSEO app."),
    tree: String(tree.json.sha),
    parents: [headSha],
  });
  if (commit.status !== 201 || !commit.json?.sha) return bad("commit create", commit.status);

  const push = await gh(
    token,
    "PATCH",
    `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`,
    { sha: String(commit.json.sha), force: true },
  );
  if (push.status !== 200) return bad("branch update", push.status);

  const base = await backendBaseUrl();
  const body =
    `${draft.meta_description ?? ""}\n\n` +
    (hostedWriter
      ? `Written by DispatchSEO for ${project.domain}; this pull request was opened by the DispatchSEO app. `
      : "Written by your AI through DispatchSEO and handed in for publishing; this pull request was " +
        "opened by the DispatchSEO app. ") +
    "Merge it to publish. If the build fails on this PR, your site " +
    "expects extra fields in the article header - reply here or ask your developer; it is a " +
    "one-time fix.\n\n" +
    // Hosted sites have no Drafts screen; their article lives on /articles.
    `Review it on your dashboard: ${base}/${hostedWriter ? `articles/${draft.id}` : "drafts"}`;

  let prNumber: number | null = null;
  let prUrl = "";
  const pr = await gh(token, "POST", `/repos/${repo}/pulls`, {
    title: draft.title,
    head: branch,
    base: baseBranch,
    body,
  });
  if (pr.status === 201 && pr.json) {
    prNumber = Number(pr.json.number);
    prUrl = String(pr.json.html_url ?? "");
  } else if (pr.status === 422) {
    // Already open from a previous attempt: reuse it rather than failing, and
    // rather than opening a second PR for the same article.
    const owner = repo.split("/")[0];
    const open = await gh(
      token,
      "GET",
      `/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`,
    );
    const list = (open.json as unknown as { number?: number; html_url?: string }[] | null) ?? [];
    const first = Array.isArray(list) ? list[0] : undefined;
    if (!first?.number) return bad("pull request create", pr.status);
    prNumber = Number(first.number);
    prUrl = String(first.html_url ?? "");
  } else {
    return bad("pull request create", pr.status);
  }

  // The label the dashboard's "Ready to ship" card filters on. Tolerated in
  // full: the GitHub App may hold no Issues permission (labels are an issues
  // endpoint), and an unlabelled PR still shows on the Drafts screen, which is
  // where the owner is told about it anyway.
  await gh(token, "POST", `/repos/${repo}/labels`, {
    name: "seo",
    color: "0e8a16",
    description: "DispatchSEO SEO pipeline",
  });
  await gh(token, "POST", `/repos/${repo}/issues/${prNumber}/labels`, {
    labels: ["seo"],
  });

  // Deliberately NOT merged here, even on Auto. Seconds after a PR opens no
  // check has run, so a merge now would land an article whose build may fail -
  // on a static site that means the deploy fails quietly and the article never
  // appears, with nobody told. The verify job owns the merge instead: it looks
  // again once the checks have had time to finish and merges only when GitHub
  // reports the branch clean (verify.ts). A freshly opened PR is therefore
  // always unmerged at this point; `merged` is only ever true for a resumed
  // run whose PR was merged by hand in the meantime (see above).
  const merged = false;

  const linkCandidates = await linkCandidatesFor(project.id);

  const predictedUrls = predictUrls({
    domain: project.domain,
    dir,
    slug,
    sampleStems: dirFiles.map((p) => fileStem(baseOf(p))),
    linkCandidates,
  });

  return { ok: true, prUrl, prNumber, repoPath, predictedUrls, merged };
}

/** "a/b/../c/./d.png" -> "a/c/d.png"; null when it climbs out of the repo. */
function normalizeRepoPath(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.length ? out.join("/") : null;
}

/** The crawled pages of this site, for URL prediction. Empty when the site
 *  has never been read - the fallback candidates still apply. */
async function linkCandidatesFor(projectId: string): Promise<{ url: string }[]> {
  const { data: digestRow } = await db()
    .from("site_digests")
    .select("link_candidates")
    .eq("project_id", projectId)
    .maybeSingle();
  const raw = (digestRow as { link_candidates?: unknown } | null)?.link_candidates;
  return Array.isArray(raw) ? (raw as { url: string }[]) : [];
}

/** The owner's "where my articles live" answer, made safe to build a path
 *  from - shared by the Settings action, the MCP tool and the publisher, so
 *  the three can never accept different shapes. Returns null for an empty or
 *  refused value. */
export function normalizeContentPathHint(hint: string | null | undefined): string | null {
  return normalizeDirHint(hint ?? null);
}

function normalizeDirHint(hint: string | null): string | null {
  if (!hint) return null;
  const trimmed = hint.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return null;
  if (trimmed.length > 120) return null;
  if (!/^[A-Za-z0-9._/-]*$/.test(trimmed)) return null;
  if (trimmed.split("/").includes("..")) return null;
  return trimmed;
}

import { siteStyleOf } from "@/lib/site-style";
import "server-only";
import { db } from "@/lib/db";
import { effectiveAutomations, publishTarget, type Project } from "@/lib/projects";
import { renderDraftForRoute } from "@/lib/job-handlers/finish";
import { buildExcerpt, buildSchema, schemaScript, yamlDoubleQuote } from "@/lib/article-render";
import { CREDIT_LINE_AT_END, creditLine, DESCRIPTION_KEYS, fetchPullRequest, fileStem, githubApi, parseFrontmatter, relativizeOwnLinks } from "@/lib/repo-publish";
import { fetchProjectUrl } from "@/lib/url-guard";
import { articleSignature } from "@/lib/article-signature";
import { tokenForRef } from "@/lib/github";
import { creditParts, hostedBase, siteOrigin } from "@/lib/hosted-blog";
import { isFreeProject } from "@/lib/billing";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { enqueue } from "@/lib/jobs";
import { EDIT_LIMITS, type ArticleRoute } from "@/lib/article-owner-shared";
import { publishRoute } from "@/lib/job-handlers/draft-status";

// The owner's two levers over a LIVE article: change it, or take it down.
// (LATER.md, "Owner control over articles": the first two of three, shipped
// 2026-11-09; review-before-publish stays queued.)
//
// Both read the article's own source (article_drafts.markdown - every route
// renders from it, so an edit here is a real edit, not a patch on HTML) and
// then do whatever the route the article went out on needs:
//
//   hosted     we serve the page (hosted-blog.ts): the stored HTML is
//              re-rendered from the new markdown by the same deterministic
//              renderer every publish uses. A removal flips the row to
//              "removed": the index, sitemap and feed drop it (they select
//              status = published) and the article route answers 410 Gone,
//              which Google treats as final.
//   repo       the article is a file in the owner's repository, and THE FILE
//              IS THE SOURCE: the editor loads its body from the default
//              branch and the save writes the same file back, so nothing that
//              reached the file since we published it (our backlink pass
//              edits older files in place; the owner's own fixes on GitHub)
//              is ever undone. The file's sha plays the role updated_at plays
//              for the row. The change is a commit on a branch and a pull
//              request, exactly as the article itself went out
//              (repo-publish.ts). We NEVER merge at open time
//              (verify.ts states the rule: a failing build must not be merged
//              before its checks have spoken) - the owner-pr job watches the
//              PR, merges it on Auto once GitHub reports the branch clean,
//              and settles our records by what actually happened to it. A
//              removal is a PR that deletes the file; until it merges the
//              article is "removing": still live, still listed, no longer
//              editable.
//   wordpress  the post is updated, or moved to the trash (reversible from
//              their own admin), through the same API the publish used.
//
// ORDER OF OPERATIONS, every route: claim the row, then change the world,
// then record it. The claim is a compare-and-swap on updated_at (the value
// the caller read when it loaded the article, so a second editor's save, the
// backlinks pass or a removal that landed meanwhile all refuse this one) and
// it happens BEFORE GitHub or WordPress are touched - a change that went out
// must never be followed by "we couldn't record it". If the external call
// fails, the claim is rolled back.
//
// Neither action is a quality gate. The writer's gate guards what WE publish;
// what the owner does to their own article afterwards is theirs to decide,
// so the only checks here are the ones that protect their site from a broken
// build (MDX safety on the repo route) and the dashboard from an empty page.
//
// "removed" is a status, never a DELETE: like "discarded", the row stays so
// "what happened to that article" is answerable, and so a URL that once
// existed can be told apart from one that never did (the 410 above).
//
// Both faces of the dashboard call this: the article page's Edit / Remove
// (autopilot-actions.ts) and the MCP tools get_article / edit_article /
// remove_article (api/[transport]/route.ts). Nothing in here knows which.

export type OwnerResult =
  | { ok: true; message: string; prUrl?: string | null; /** A repo change: the site changes when its pull request merges. */ pending?: boolean }
  | { ok: false; error: string };

export type { ArticleRoute };
export { EDIT_LIMITS };

export type ArticleSource = {
  id: string;
  title: string;
  slug: string;
  metaDescription: string;
  /** The article body as the owner edits it, WITHOUT its leading H1 (the
   *  title is its own field; the H1 is re-derived from it on save when the
   *  original carried one). Hosted and WordPress: the stored markdown. Repo
   *  (with `repoBody`): the file's body as it is in the repository today,
   *  frontmatter and signature removed. */
  body: string;
  faq: { question: string; answer: string }[];
  /** published | removing (a repo removal's pull request is open) | removed | … */
  status: string;
  url: string | null;
  publishedAt: string | null;
  /** Hand this back as `expectedUpdatedAt` on save: a save is refused when
   *  the article changed since it was read. */
  updatedAt: string;
  /** Which way the article went out, and so which way a change goes. Null
   *  when it cannot be told (published outside DispatchSEO). */
  route: ArticleRoute | null;
  /** The repository a repo-route change becomes a pull request in. */
  repo: string | null;
  /** Whether a repo-route pull request is merged by us once its checks pass
   *  (the site is on Auto) or left for the owner to merge. */
  autoMerge: boolean;
  /** The pull request on this article while one is pending: a removal's,
   *  or an edit's that has not merged yet. */
  prUrl: string | null;
  /** An edit's pull request is open: the body shown is that pull request's
   *  version, and the next save joins the same pull request. */
  pendingEdit: boolean;
  /** Repo route, with `repoBody`: the sha of the file the body came from.
   *  Hand it back as `expectedFileSha` on save. */
  fileSha: string | null;
  canEdit: boolean;
  canRemove: boolean;
  /** Why not, when canEdit is false on a live article. */
  reason: string | null;
};

type Row = {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  primary_keyword: string | null;
  markdown: string;
  faq: { question: string; answer: string }[] | null;
  sources: { url: string; title?: string }[] | null;
  status: string;
  published_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  repo_path: string | null;
  pr_url: string | null;
  wp_post_id: number | null;
};

const COLS = "id, title, slug, meta_description, primary_keyword, markdown, faq, sources, status, published_url, published_at, created_at, updated_at, repo_path, pr_url, wp_post_id";

/** A leading markdown H1 and the blank lines after it. */
const LEADING_H1 = /^\s*#\s+[^\n]*\n+/;

const STALE: OwnerResult = { ok: false, error: "This article changed since you opened it. Reload the page and try again." };

async function loadRow(projectId: string, draftId: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return null;
  const { data } = await db().from("article_drafts").select(COLS).eq("id", draftId).eq("project_id", projectId).maybeSingle();
  return (data as Row | null) ?? null;
}

/** Which route the article went out on, read from the row itself rather
 *  than the project's CURRENT target: a project can switch targets after an
 *  article is live (publish-repo.ts switches a repo with no blog folder to
 *  the hosted blog), and the change must follow the article, not the
 *  setting. WordPress leaves a post id, the repo route a file path (or at
 *  least its pull request); the hosted publish leaves only its address. */
function routeOf(project: Project, row: Row): ArticleRoute | null {
  if (row.wp_post_id) return "wordpress";
  if (row.repo_path || row.pr_url) return "repo";
  // /blog, or a second path (/articles) for a site whose own /blog is kept.
  if (row.published_url?.startsWith(`${hostedBase(project)}/`) || row.published_url?.startsWith(`${siteOrigin(project)}/blog/`)) return "hosted";
  if (publishTarget(project) === "hosted") return "hosted";
  // Nothing on the row and the project does not publish through us: the
  // article was handed to the owner's own agent (the manual route).
  return null;
}

export async function loadArticleSource(project: Project, draftId: string, opts: { repoBody?: boolean } = {}): Promise<ArticleSource | null> {
  const row = await loadRow(project.id, draftId);
  if (!row) return null;
  // Waiting for the owner's review (article-review.ts): nothing is on the
  // site yet, so the route is where it WILL go, and the stored source is
  // the article - editable, never removable (dropping it is "Don't publish").
  const inReview = row.status === "review";
  const route = inReview ? upcomingRoute(project) : routeOf(project, row);
  const live = row.status === "published";
  let body = row.markdown.replace(LEADING_H1, "");
  let fileSha: string | null = null;
  let prUrl = row.status === "removing" ? row.pr_url : null;
  let pendingEdit = false;
  let reason: string | null = null;
  let changeable = live && route !== null;
  if (live && route === "repo") {
    // A repo-route article we cannot find the file of (pre-0060 rows carry
    // no path) is one we can only read, not change.
    if (!row.repo_path || !project.github_repo) {
      changeable = false;
      reason = "We don't know where this article's file is in your repo, so it can't be changed from here.";
    } else {
      // An edit waiting on its pull request holds text the default branch
      // does not have yet: that version is the one to show and build on,
      // and the next save joins the same pull request.
      const pending = await pendingEditPr(project, row);
      if (pending) {
        pendingEdit = true;
        prUrl = pending.url;
      }
      if (opts.repoBody) {
        const file = await readRepoFile(project, row.repo_path, pending?.branch);
        if (!file.ok) {
          changeable = false;
          reason = file.error;
        } else {
          body = file.body.replace(LEADING_H1, "");
          fileSha = file.sha;
        }
      }
    }
  }
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    metaDescription: row.meta_description ?? "",
    body,
    faq: Array.isArray(row.faq) ? row.faq : [],
    status: row.status,
    url: row.published_url,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    route,
    repo: route === "repo" ? (project.github_repo ?? null) : null,
    autoMerge: route === "repo" && effectiveAutomations(project).auto_merge,
    prUrl,
    pendingEdit,
    fileSha,
    canEdit: changeable || inReview,
    canRemove: changeable,
    reason,
  };
}

/** Where an article that hasn't gone out yet will go, as an ArticleRoute;
 *  null when the site has nowhere to publish (setup unfinished). */
function upcomingRoute(project: Project): ArticleRoute | null {
  const r = publishRoute(project);
  return r === "hosted" || r === "repo" || r === "wordpress" ? r : null;
}

type PendingPr = { prNumber: number; url: string; previous: Previous | null; previousPrUrl: string | null; /** Where the pending text is read from: the branch, or a commit on it. */ branch: string; /** Open on GitHub with no watcher left: a chain that died. */ orphan: boolean };

/** Is a watcher's pull request in the repo the site publishes to today? A
 *  watcher from before the repo was stamped (2026-11-11) says yes. */
export function sameRepo(watched: string | null | undefined, current: string | null | undefined): boolean {
  return !watched || watched.toLowerCase() === String(current ?? "").toLowerCase();
}

const editBranch = (row: Pick<Row, "slug" | "id">) => `dispatchseo/edit-${row.slug}-${row.id.replace(/-/g, "").slice(0, 8)}`;

/** The pull request still being watched for this article (the owner-pr
 *  job's pending round) of the given kind, if any. */
async function pendingPr(project: Project, draftId: string, kind: "edit" | "remove", branch = ""): Promise<PendingPr | null> {
  const { data } = await db()
    .from("jobs")
    .select("payload")
    .eq("project_id", project.id)
    .eq("kind", "owner-pr")
    .is("finished_at", null)
    .contains("payload", { draftId, kind })
    .limit(20);
  // Two can be unfinished at once (2026-11-11): a newer edit's watcher, and
  // an older one whose pull request was closed or merged but which has not
  // looked yet. GitHub numbers only go up, so the highest is the current one.
  // A watcher armed on another repo (the site's repo was changed since) is
  // not this article's pull request: its number means nothing here.
  type P = { prNumber?: number; repo?: string; previous?: Previous; previousPrUrl?: string | null; land?: { probe?: { from?: string } | null } };
  const payload = ((data ?? []) as { payload?: P }[])
    .map((d) => d.payload)
    .filter((x): x is P => Boolean(x?.prNumber) && sameRepo(x?.repo, project.github_repo))
    .sort((a, b) => Number(b.prNumber) - Number(a.prNumber))[0];
  if (!payload?.prNumber) return null;
  // While the checks are being run without the change (pr-landing.ts), the
  // branch head holds the site's own text for a few minutes; the owner's
  // edit is in the commit under it, and that is the one to read.
  const readFrom = payload.land?.probe?.from || branch;
  return { prNumber: Number(payload.prNumber), url: `https://github.com/${project.github_repo}/pull/${payload.prNumber}`, previous: payload.previous ?? null, previousPrUrl: payload.previousPrUrl ?? null, branch: readFrom, orphan: false };
}

/** The edit pull request open for this article: the one a watcher is on,
 *  or one open on GitHub with no watcher left (the chain died: GitHub
 *  unreachable for a day, the queue's give-up) - adopted rather than
 *  ignored, so the next edit joins it instead of starting a second chain
 *  whose "previous" text never went live. */
async function pendingEditPr(project: Project, row: Pick<Row, "id" | "slug">): Promise<PendingPr | null> {
  const branch = editBranch(row);
  const watched = await pendingPr(project, row.id, "edit", branch);
  if (watched) {
    // The watcher looks every two hours on a manual-merge site, so its pull
    // request may already be closed or merged (2026-11-11): reading that old
    // branch and calling the save "joined" opened a second pull request
    // nobody watched. Only an open one is pending; otherwise the edit starts
    // from the default branch, which is what is live. Unreadable (GitHub
    // down) keeps the old answer - the watcher finds out on its own.
    const pr = await fetchPullRequest(project, watched.prNumber);
    if (!pr || pr.state === "open") return watched;
  }
  const token = await tokenForRef(project);
  if (!token || !project.github_repo) return null;
  const owner = project.github_repo.split("/")[0];
  const open = await githubApi(token, "GET", `/repos/${project.github_repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);
  const first = (Array.isArray(open.json) ? (open.json as unknown as { number?: number; html_url?: string }[]) : [])[0];
  return first?.number ? { prNumber: Number(first.number), url: String(first.html_url ?? ""), previous: null, previousPrUrl: null, branch, orphan: true } : null;
}

type Previous = { title: string; meta_description: string | null; markdown: string };

type RepoFile = { ok: true; sha: string; text: string; frontmatter: string; body: string; hadH1: boolean } | { ok: false; error: string };

const ON_GITHUB = "Edit it on GitHub instead.";

/** The article's file from the default branch (or from `ref`, an edit's
 *  open branch), split into the frontmatter block and the body (signature
 *  removed). */
async function readRepoFile(project: Project, path: string, ref?: string): Promise<RepoFile> {
  const token = await tokenForRef(project);
  if (!token) return { ok: false, error: "Your GitHub connection isn't available right now. Check it in Settings, then try again." };
  const repo = project.github_repo!;
  const file = await githubApi(token, "GET", `/repos/${repo}/contents/${encodeURI(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
  if (file.status === 404) return { ok: false, error: "The article's file isn't in your repo any more - was it moved or deleted on GitHub?" };
  if (file.status !== 200 || typeof file.json?.content !== "string" || typeof file.json?.sha !== "string") {
    return { ok: false, error: `GitHub didn't answer (HTTP ${file.status}). Try again in a minute.` };
  }
  const text = Buffer.from(file.json.content as string, "base64").toString("utf8").replace(/\r\n/g, "\n");
  const m = text.match(/^\uFEFF?\s*---\n([\s\S]*?)\n---[ \t]*\n?/);
  if (!m) return { ok: false, error: `The article's file in your repo doesn't start with a front matter block, so it can't be changed safely from here. ${ON_GITHUB}` };
  const body = text.slice(m[0].length).replace(/\s*<span data-dispatchseo="[^"]*" hidden><\/span>\s*$/, "").trim().replace(CREDIT_LINE_AT_END, "").trim();
  return { ok: true, sha: String(file.json.sha), text, frontmatter: m[1], body, hadH1: LEADING_H1.test(body) };
}

/** The article as the site has it: the default branch's file, in the row's
 *  terms. What the row must go back to when it may hold text that never went
 *  live - an orphaned pull request's, or one closed before its watcher
 *  looked (2026-11-11). Null when the file can't be read. */
async function liveVersion(project: Project, row: Row, file?: Extract<RepoFile, { ok: true }>): Promise<Previous | null> {
  const f = file ?? (await readRepoFile(project, row.repo_path!));
  if (!f.ok) return null;
  const fm = parseFrontmatter(f.text);
  const descKey = DESCRIPTION_KEYS.find((k) => k in fm.values);
  return { title: fm.values.title?.trim() || row.title, meta_description: descKey ? fm.values[descKey] : row.meta_description, markdown: f.body };
}

export type EditInput = {
  title?: string;
  metaDescription?: string;
  body?: string;
  /** `updatedAt` from loadArticleSource. The save is refused when the row
   *  has changed since - without it only the request itself is guarded. */
  expectedUpdatedAt?: string;
  /** Repo route: `fileSha` from loadArticleSource. The save is refused when
   *  the file changed on GitHub since. */
  expectedFileSha?: string;
};

export async function editArticle(project: Project, draftId: string, input: EditInput): Promise<OwnerResult> {
  const row = await loadRow(project.id, draftId);
  if (!row) return { ok: false, error: "That article is no longer on this site." };
  if (row.status === "removed") return { ok: false, error: "That article was removed from your site, so there is nothing to edit." };
  if (row.status === "removing") return { ok: false, error: "A removal is pending for this article. Merge or close its pull request first." };
  if (row.status === "review") return editReviewDraft(project, row, input);
  if (row.status !== "published") return { ok: false, error: "Only a live article can be edited from here. This one hasn't gone out yet." };
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== row.updated_at) return STALE;
  const route = routeOf(project, row);
  if (!route) return { ok: false, error: "This article was published outside DispatchSEO, so it can't be changed from here." };

  // The base the edit is measured against: the row, or on the repo route
  // the file itself (header: THE FILE IS THE SOURCE) - from the open edit
  // pull request's branch when there is one, so edits stack.
  let file: Extract<RepoFile, { ok: true }> | null = null;
  let pending: PendingPr | null = null;
  // A watcher is still queued but its pull request is no longer open: the
  // row may hold that pull request's text, which never went live.
  let endedWatcher = false;
  if (route === "repo") {
    if (!project.github_repo || !row.repo_path) {
      return { ok: false, error: `We don't know where this article's file is in your repo, so it can't be edited from here. ${ON_GITHUB}` };
    }
    pending = await pendingEditPr(project, row);
    if (!pending) endedWatcher = Boolean(await pendingPr(project, row.id, "edit"));
    const read = await readRepoFile(project, row.repo_path, pending?.branch);
    if (!read.ok) return read;
    if (input.expectedFileSha && input.expectedFileSha !== read.sha) {
      return { ok: false, error: "The article's file changed on GitHub since you opened it. Reload the page and try again." };
    }
    file = read;
  }
  const baseMarkdown = file ? file.body : row.markdown;
  const hadH1 = LEADING_H1.test(baseMarkdown);
  const currentBody = baseMarkdown.replace(LEADING_H1, "").trim();
  const title = (input.title ?? row.title).trim().replace(/\s+/g, " ");
  const metaDescription = (input.metaDescription ?? row.meta_description ?? "").trim();
  // A body that arrives with its own H1 (agents habitually send one) has it
  // dropped: the title is the title, and the stored shape is decided below.
  const body = (input.body ?? currentBody).replace(/\r\n/g, "\n").replace(LEADING_H1, "").trim();

  if (title.length < 3) return { ok: false, error: "Give it a title." };
  if (title.length > EDIT_LIMITS.title) return { ok: false, error: `Keep the title under ${EDIT_LIMITS.title} characters.` };
  if (metaDescription.length > EDIT_LIMITS.metaDescription) return { ok: false, error: `Keep the description under ${EDIT_LIMITS.metaDescription} characters.` };
  if (body.length < EDIT_LIMITS.bodyMin) return { ok: false, error: "The article needs a body - at least a short paragraph." };
  if (body.length > EDIT_LIMITS.bodyMax) return { ok: false, error: "That's too long for one article." };
  if (title === row.title && metaDescription === (row.meta_description ?? "").trim() && body === currentBody) {
    return { ok: true, message: "Nothing changed, so nothing to save." };
  }

  // The stored markdown keeps the shape it had: an H1 when it carried one
  // (every route strips or keeps it by its own rule), none when it did not.
  const markdown = hadH1 ? `# ${title}\n\n${body}\n` : `${body}\n`;
  const now = new Date().toISOString();
  const publishedAt = row.published_at ?? row.created_at;
  const next = { ...row, title, meta_description: metaDescription, markdown };
  const pageTitle = async () => {
    if (row.published_url) await db().from("pages").update({ title }).eq("project_id", project.id).eq("url", row.published_url);
  };

  if (route === "hosted") {
    // No external call: the render and the guarded write are the whole change.
    const finished = await renderDraftForRoute(project, next, "hosted", publishedAt, now);
    const saved = await claim(row, now, { title, meta_description: finished.excerpt, markdown, rendered_html: finished.html + schemaScript(finished.schema) });
    if (!saved) return STALE;
    await pageTitle();
    return { ok: true, message: "Saved. The live page shows the change within a few minutes." };
  }

  if (route === "wordpress") {
    const [{ credentialsFor }, { updatePost }] = await Promise.all([import("@/lib/wordpress-connect"), import("@/lib/wordpress")]);
    const creds = await credentialsFor(project);
    if (!creds || !row.wp_post_id) return { ok: false, error: "Your WordPress connection isn't available right now. Reconnect it in Settings, then try again." };
    const finished = await renderDraftForRoute(project, next, "wordpress", publishedAt, now);
    // The theme prints the title; the body's own H1 would repeat it - and
    // the structured data names the permalink WordPress gave the post, as
    // the publish did (job-handlers/publish.ts).
    const bodyHtml = finished.html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");
    const schema = buildSchema({
      headline: title,
      description: finished.excerpt,
      url: row.published_url ?? `${project.wp_url ?? `https://${project.domain}`}/${row.slug}`,
      datePublished: publishedAt,
      dateModified: now,
      ...(project.author_name?.trim()
        ? { authorName: project.author_name.trim(), authorType: "Person" as const, authorUrl: project.author_url ?? undefined }
        : { authorName: project.name, authorType: "Organization" as const }),
      siteName: project.name,
      siteUrl: project.wp_url ?? `https://${project.domain}`,
      faq: row.faq ?? [],
    });
    if (!(await claim(row, now))) return STALE;
    const postId = row.wp_post_id;
    const r = await guarded(row, now, async () => {
      const w = await updatePost(creds, postId, { title, html: bodyHtml + schemaScript(schema), excerpt: finished.excerpt });
      return w.ok ? w : { ok: false as const, error: `WordPress didn't take the change: ${w.message}` };
    });
    if (!r.ok) return r;
    await record(row.id, { title, meta_description: finished.excerpt, markdown });
    await pageTitle();
    return { ok: true, message: "Saved. The post on your WordPress site is updated." };
  }

  // repo
  const { mdxSafety } = await import("@/lib/writer/mdx-safety");
  const safety = await mdxSafety(markdown);
  if (!safety.ok) return { ok: false, error: `This can't go into your repo as written - it would break the build: ${safety.problems[0]}.` };
  if (!(await claim(row, now))) return STALE;
  const change = await guarded(row, now, () => repoChange(project, row, { kind: "edit", title, metaDescription, markdown, file: file! }));
  if (!change.ok) return change;
  await record(row.id, { title, meta_description: metaDescription || buildExcerpt(markdown), markdown });
  await pageTitle();
  // The watcher: merges on Auto once the checks pass, and puts the old text
  // back if the pull request is closed instead (job-handlers/owner-pr.ts).
  // An edit joining an already-watched pull request keeps that watcher (its
  // "previous" is the text that is live); any other pull request - a new
  // one, an orphaned one, or a different number than the one we joined -
  // gets a watcher of its own. Its "previous" is the row only when the row
  // is known to be live; otherwise the default branch's file (2026-11-11:
  // an orphan's row held its never-merged text, and a row whose pull request
  // was closed before its watcher looked holds that one's).
  const joined = Boolean(pending) && change.prNumber === pending!.prNumber;
  if (!joined || pending!.orphan) {
    const rowText: Previous = { title: row.title, meta_description: row.meta_description, markdown: row.markdown };
    const previous = pending || endedWatcher ? ((await liveVersion(project, row, pending ? undefined : file!)) ?? rowText) : rowText;
    await watchPr(project, row.id, change.prNumber, { kind: "edit", previous, ...(pending?.orphan ? { rearmed: Date.now() } : {}) });
  }
  const auto = effectiveAutomations(project).auto_merge;
  return {
    ok: true,
    pending: true,
    prUrl: change.prUrl,
    message: joined
      ? "Saved into the open pull request."
      : auto
        ? "Saved. We opened a pull request with the change; it merges on its own once your site's checks pass, and the page updates on the next deploy."
        : "Saved. We opened a pull request with the change - merge it and your site shows the new version.",
  };
}

/** An article waiting for the owner's review (article-review.ts): nothing is
 *  on their site, so the edit is the stored source, re-rendered the way the
 *  finish rendered it. The publish job renders again from this markdown when
 *  the owner presses Publish, so what they approve is what goes out. Same
 *  validation and the same compare-and-swap as a live edit; the repo route's
 *  build-safety check runs now rather than surfacing as a broken PR later. */
async function editReviewDraft(project: Project, row: Row, input: EditInput): Promise<OwnerResult> {
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== row.updated_at) return STALE;
  const hadH1 = LEADING_H1.test(row.markdown);
  const currentBody = row.markdown.replace(LEADING_H1, "").trim();
  const title = (input.title ?? row.title).trim().replace(/\s+/g, " ");
  const metaDescription = (input.metaDescription ?? row.meta_description ?? "").trim();
  const body = (input.body ?? currentBody).replace(/\r\n/g, "\n").replace(LEADING_H1, "").trim();
  if (title.length < 3) return { ok: false, error: "Give it a title." };
  if (title.length > EDIT_LIMITS.title) return { ok: false, error: `Keep the title under ${EDIT_LIMITS.title} characters.` };
  if (metaDescription.length > EDIT_LIMITS.metaDescription) return { ok: false, error: `Keep the description under ${EDIT_LIMITS.metaDescription} characters.` };
  if (body.length < EDIT_LIMITS.bodyMin) return { ok: false, error: "The article needs a body - at least a short paragraph." };
  if (body.length > EDIT_LIMITS.bodyMax) return { ok: false, error: "That's too long for one article." };
  if (title === row.title && metaDescription === (row.meta_description ?? "").trim() && body === currentBody) {
    return { ok: true, message: "Nothing changed, so nothing to save." };
  }
  const markdown = hadH1 ? `# ${title}\n\n${body}\n` : `${body}\n`;
  const route = publishRoute(project);
  if (route === "repo") {
    const { mdxSafety } = await import("@/lib/writer/mdx-safety");
    const safety = await mdxSafety(markdown);
    if (!safety.ok) return { ok: false, error: `This can't go into your repo as written - it would break the build: ${safety.problems[0]}.` };
  }
  const now = new Date().toISOString();
  const finished = await renderDraftForRoute(project, { ...row, title, meta_description: metaDescription, markdown }, route, now);
  // WordPress gets its structured data once WordPress names the permalink
  // (finish.ts says why); every other route carries it with the HTML.
  const html = route === "wordpress" ? finished.html : finished.html + schemaScript(finished.schema);
  const saved = await claim(row, now, { title, meta_description: finished.excerpt, markdown, rendered_html: html }, "review");
  if (!saved) return STALE;
  return { ok: true, message: "Saved. Publish it when you're ready." };
}

/** The claim: still live, unchanged since it was read, and from now on ours
 *  (updated_at moves, so anyone else who read the old value is refused).
 *  Extra fields ride along when the claim IS the whole change (hosted). */
async function claim(row: Row, now: string, fields: Record<string, unknown> = {}, status: "published" | "review" = "published"): Promise<boolean> {
  const { data, error } = await db()
    .from("article_drafts")
    .update({ ...fields, updated_at: now })
    .eq("id", row.id)
    .eq("status", status)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (error) throw new Error(`could not save the article: ${error.message}`);
  return Boolean(data?.length);
}

/** The external call failed after the claim: give the row its old timestamp
 *  back so the owner (or another tab) can simply try again. */
async function release(row: Row, now: string): Promise<void> {
  await db().from("article_drafts").update({ updated_at: row.updated_at }).eq("id", row.id).eq("updated_at", now);
}

/** The external call between a claim and its record: a refusal OR a throw
 *  gives the row its old timestamp back, so nothing stays claimed by a
 *  change that never happened. */
async function guarded<T extends { ok: boolean }>(row: Row, now: string, call: () => Promise<T>): Promise<T> {
  try {
    const r = await call();
    if (!r.ok) await release(row, now);
    return r;
  } catch (e) {
    await release(row, now).catch(() => undefined);
    throw e;
  }
}

/** The change went out; record it. Unconditional on purpose - the world has
 *  already changed, and a record that disagrees with it is the one outcome
 *  this file must never produce. */
async function record(id: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await db().from("article_drafts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error(`[article-owner] ${id}: the change is live but could not be recorded: ${error.message}`);
}

async function watchPr(project: Project, draftId: string, prNumber: number, payload: Record<string, unknown>): Promise<void> {
  await enqueue({
    projectId: project.id,
    kind: "owner-pr",
    payload: { draftId, prNumber, repo: project.github_repo ?? undefined, round: 0, deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...payload },
    // Long enough for the site's checks to have run on a fresh PR.
    runAfter: new Date(Date.now() + 10 * 60_000),
    idempotencyKey: `owner-pr:${draftId}:${prNumber}:${payload.rearmed ? `re${payload.rearmed}` : "r0"}`,
  }).catch((e) => console.error(`[article-owner] ${draftId}: PR #${prNumber} is open but its watcher could not be queued: ${e instanceof Error ? e.message : String(e)}`));
}

export async function removeArticle(project: Project, draftId: string): Promise<OwnerResult> {
  const row = await loadRow(project.id, draftId);
  if (!row) return { ok: false, error: "That article is no longer on this site." };
  if (row.status === "removed") return { ok: true, message: "It was already removed." };
  if (row.status === "removing") return settleRemoving(project, row);
  if (row.status !== "published") return { ok: false, error: "Only a live article can be removed from here. This one hasn't gone out yet." };
  const route = routeOf(project, row);
  if (!route) return { ok: false, error: "This article was published outside DispatchSEO, so it can't be removed from here." };
  const now = new Date().toISOString();

  if (route === "hosted") {
    // The status flip IS the removal: the routes select status = published.
    if (!(await claim(row, now, { status: "removed" }))) return STALE;
    await afterRemoval(project, row);
    return { ok: true, message: "Removed. The page leaves your blog within a few minutes, and Google is told it's gone." };
  }

  if (route === "wordpress") {
    const [{ credentialsFor }, { deletePost }] = await Promise.all([import("@/lib/wordpress-connect"), import("@/lib/wordpress")]);
    const creds = await credentialsFor(project);
    if (!creds || !row.wp_post_id) return { ok: false, error: "Your WordPress connection isn't available right now. Reconnect it in Settings, then try again." };
    if (!(await claim(row, now))) return STALE;
    const postId = row.wp_post_id;
    const r = await guarded(row, now, async () => {
      const w = await deletePost(creds, postId);
      if (w.ok) return { ok: true as const, gone: false };
      // Already trashed or deleted in wp-admin (2026-11-11): what the owner
      // asked for is true already, so record it instead of refusing forever.
      // Only WordPress's own word about THIS post counts - a bare 404 is a
      // broken REST route (permalinks), which says nothing about the post.
      const code = (w.body as { code?: unknown } | undefined)?.code;
      if (code === "rest_post_invalid_id" || code === "rest_already_trashed") return { ok: true as const, gone: true };
      return { ok: false as const, error: `WordPress didn't remove it: ${w.message}` };
    });
    if (!r.ok) return r;
    await record(row.id, { status: "removed" });
    await afterRemoval(project, row);
    if (r.gone) return { ok: true, message: "Removed. The post was already gone from your WordPress site, so it's marked removed here too." };
    return { ok: true, message: "Removed. The post is in your WordPress trash, where you can still restore it." };
  }

  // repo
  if (!project.github_repo || !row.repo_path) {
    return { ok: false, error: "We don't know where this article's file is in your repo, so it can't be removed from here. Delete the file on GitHub instead." };
  }
  const pendingEdit = await pendingEditPr(project, row);
  // The text the row goes back to: an open edit's watcher knows it; an
  // orphaned edit, or one whose pull request closed before its watcher
  // looked, leaves the row holding text that never went live - the file on
  // the default branch is what is (2026-11-11).
  const live = pendingEdit?.previous ?? (pendingEdit || (await pendingPr(project, row.id, "edit")) ? await liveVersion(project, row) : null);
  if (!(await claim(row, now))) return STALE;
  const change = await guarded(row, now, () => repoChange(project, row, { kind: "remove", title: row.title, closeEditPr: pendingEdit?.prNumber ?? null }));
  if (!change.ok && change.gone) return removeGoneFile(project, row, pendingEdit?.prNumber ?? null);
  if (!change.ok) return change;
  // Live until the pull request merges: "removing", with its PR where the
  // article page can show it. The publish PR's address moves to the watcher's
  // payload and comes back if the removal is closed instead. An edit that
  // was waiting on its own PR is closed above; its text never reached the
  // site, so the row gets the text that did.
  await record(row.id, { status: "removing", pr_url: change.prUrl, ...(live ?? {}) });
  await watchPr(project, row.id, change.prNumber, { kind: "remove", previousPrUrl: row.pr_url });
  const auto = effectiveAutomations(project).auto_merge;
  return {
    ok: true,
    pending: true,
    prUrl: change.prUrl,
    message: auto
      ? "We opened a pull request that deletes it; it merges on its own once your site's checks pass, and the page is gone after the next deploy."
      : "We opened a pull request that deletes it - merge it on GitHub and the page is gone.",
  };
}

// --- Adopting a page the old pipeline wrote -----------------------------------

/**
 * An article from before the hosted writer (a `pages` row the site's own
 * coding agent published; no draft behind it) becomes an article_drafts row
 * so Edit and Remove work on it: its file is found in the repo by the URL's
 * last segment (the stem every generator builds the URL from), read, and
 * recorded as a published draft with that path. Only repo sites have such
 * pages. Returns the draft id, or why not.
 */
export async function adoptPage(project: Project, pageId: string): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(pageId)) return { ok: false, error: "That page is no longer on this site." };
  const { data } = await db().from("pages").select("id, url, title, primary_keyword, published_at, live_at, created_at").eq("id", pageId).eq("project_id", project.id).maybeSingle();
  const page = data as { id: string; url: string; title: string | null; primary_keyword: string | null; published_at: string | null; live_at: string | null; created_at: string } | null;
  if (!page) return { ok: false, error: "That page is no longer on this site." };
  // Already adopted (or a writer article at the same address): use that.
  const { data: existing } = await db().from("article_drafts").select("id").eq("project_id", project.id).eq("published_url", page.url).in("status", ["published", "removing"]).limit(1);
  if (existing?.length) return { ok: true, draftId: (existing[0] as { id: string }).id };
  if (!project.github_repo) return { ok: false, error: "This article was published outside DispatchSEO, so it can't be changed from here." };
  const token = await tokenForRef(project);
  if (!token) return { ok: false, error: "Your GitHub connection isn't available right now. Check it in Settings, then try again." };

  let stem = "";
  let urlDirs: string[] = [];
  try {
    const segs = new URL(page.url).pathname.replace(/\/+$/, "").split("/");
    stem = decodeURIComponent(segs.pop() ?? "");
    urlDirs = segs.filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    return { ok: false, error: "This page's address can't be read." };
  }
  if (!stem) return { ok: false, error: "This page's address has no article name in it." };
  const repo = project.github_repo;
  const info = await githubApi(token, "GET", `/repos/${repo}`);
  if (info.status !== 200) return { ok: false, error: `GitHub didn't answer (HTTP ${info.status}). Try again in a minute.` };
  const base = String(info.json?.default_branch ?? "main");
  const ref = await githubApi(token, "GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${base}`)}`);
  const sha = (ref.json?.object as { sha?: string } | undefined)?.sha;
  if (!sha) return { ok: false, error: "GitHub didn't answer. Try again in a minute." };
  const tree = await githubApi(token, "GET", `/repos/${repo}/git/trees/${sha}?recursive=1`);
  const paths = ((tree.json?.tree as { path?: string; type?: string }[] | undefined) ?? []).filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));
  const want = stem.toLowerCase();
  const matches = paths.filter((p) => {
    if (!/\.mdx?$/i.test(p)) return false;
    const parts = p.split("/");
    const name = parts.pop() ?? "";
    // A page bundle (x/index.md) is served at .../x just as x.md is.
    return fileStem(name).toLowerCase() === want || (/^index\.mdx?$/i.test(name) && (parts.pop() ?? "").toLowerCase() === want);
  });
  if (!matches.length) return { ok: false, error: "We couldn't find this article's file in your repo, so it can't be changed from here." };
  // Several files could be this article (a translation, a page bundle next
  // to a stray copy): only one whose folders agree with the address (/en/blog/x
  // -> a path through en/ and blog/) is safe to take. Remove deletes this
  // file through a pull request that may merge on its own, so a guess - the
  // old "folder with the most articles" tie-break - could take down another
  // page (2026-11-11). Still not exactly one: refuse.
  let path = matches[0];
  // One match that is a page bundle (x/index.md) still has to sit under the
  // address's folders: docs/getting-started/index.md is not the page at
  // /blog/getting-started, and Remove would have deleted it.
  if (matches.length === 1 && /(^|\/)index\.mdx?$/i.test(path)) {
    const dirs = path.toLowerCase().split("/").slice(0, -1);
    if (!urlDirs.every((d) => dirs.includes(d))) return { ok: false, error: "We couldn't find this article's file in your repo, so it can't be changed from here." };
  }
  if (matches.length > 1) {
    const agree = matches.filter((m) => {
      const dirs = m.toLowerCase().split("/").slice(0, -1);
      return urlDirs.every((d) => dirs.includes(d));
    });
    if (agree.length !== 1) return { ok: false, error: `We found more than one file that could be this article, so we didn't touch any: ${matches.join(", ")}.` };
    path = agree[0];
  }
  const file = await readRepoFile(project, path);
  if (!file.ok) return { ok: false, error: file.error };
  const fm = parseFrontmatter(file.text);
  const title = fm.values.title?.trim() || page.title?.trim() || stem;
  const descKey = DESCRIPTION_KEYS.find((k) => k in fm.values);
  const now = new Date().toISOString();
  const { data: inserted, error } = await db()
    .from("article_drafts")
    .insert({
      project_id: project.id,
      title,
      slug: stem,
      meta_description: descKey ? fm.values[descKey] : null,
      primary_keyword: page.primary_keyword,
      markdown: file.body,
      faq: [],
      sources: [],
      status: "published",
      published_url: page.url,
      published_at: page.published_at ?? page.live_at ?? page.created_at,
      repo_path: path,
      client_kind: "adopted",
      cost_usd: 0,
      created_at: page.published_at ?? page.live_at ?? page.created_at,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();
  if (error || !inserted) return { ok: false, error: "We couldn't record this article just now. Try again in a moment." };
  return { ok: true, draftId: (inserted as { id: string }).id };
}

/** Remove asked again while a removal is "removing": look at the pull
 *  request now rather than answering "already waiting" - the watcher may
 *  have died (GitHub unreachable for a day, the queue's give-up), and this
 *  is the owner's way out. Merged: settle it. Closed: the article is live
 *  again, say so. Open: make sure a watcher is on it. */
async function settleRemoving(project: Project, row: Row): Promise<OwnerResult> {
  const prNumber = Number(row.pr_url?.match(/\/pull\/(\d+)$/)?.[1]);
  if (!prNumber) {
    await db().from("article_drafts").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "removing");
    return { ok: false, error: "We lost track of its pull request, so the article is marked live again. Try again to open a new one." };
  }
  const [pr, pending] = await Promise.all([fetchPullRequest(project, prNumber), pendingPr(project, row.id, "remove")]);
  if (!pr) return { ok: false, error: "We couldn't reach GitHub to check its pull request. Try again in a minute." };
  const now = new Date().toISOString();
  if (pr.merged_at) {
    const { data } = await db().from("article_drafts").update({ status: "removed", updated_at: now }).eq("id", row.id).eq("status", "removing").select("id");
    if (data?.length) await afterRemoval(project, row);
    return { ok: true, message: "Removed. The pull request was merged; the page is gone after your site's next deploy." };
  }
  if (pr.state !== "open") {
    await db().from("article_drafts").update({ status: "published", pr_url: pending?.previousPrUrl ?? null, updated_at: now }).eq("id", row.id).eq("status", "removing");
    return { ok: false, error: "Its pull request was closed without merging, so the article is still live. Try again to open a new one." };
  }
  if (!pending) await watchPr(project, row.id, prNumber, { kind: "remove", previousPrUrl: null, rearmed: Date.now() });
  return { ok: true, pending: true, prUrl: pr.html_url, message: "Its removal is waiting on its pull request." };
}

/** Remove asked for an article whose file is already gone from the default
 *  branch (deleted on GitHub, 2026-11-11): what the owner wants has happened,
 *  and refusing left it "live" here forever, still costing rank checks. A
 *  MOVED file looks the same from GitHub, so it only counts as gone once the
 *  site agrees - the page answers 404 or 410. */
async function removeGoneFile(project: Project, row: Row, editPr: number | null): Promise<OwnerResult> {
  const res = row.published_url ? await fetchProjectUrl(row.published_url, project.domain, { timeoutMs: 8_000, userAgent: "DispatchSEO-liveness-check" }) : null;
  if (res?.status !== 404 && res?.status !== 410) {
    return { ok: false, error: "The article's file isn't in your repo any more, but its page still loads (or we couldn't check it). If you moved the file, change it on GitHub instead; if you deleted it, try again once your site has redeployed." };
  }
  // An edit still open would bring the file back if merged: close it, as a
  // normal removal does.
  if (editPr) {
    const token = await tokenForRef(project);
    const closed = token ? await githubApi(token, "PATCH", `/repos/${project.github_repo}/pulls/${editPr}`, { state: "closed" }) : null;
    if (closed?.status !== 200) return { ok: false, error: "The article's file is already gone from your repo, but we couldn't close its open edit pull request. Try again in a minute." };
  }
  if (!(await claim(row, new Date().toISOString(), { status: "removed" }))) return STALE;
  await afterRemoval(project, row);
  return { ok: true, message: "Removed. Its file was already gone from your repo and the page no longer loads, so it's marked removed here too." };
}

/** What follows a removal that has taken effect: the page record goes
 *  (the dashboard's page lists, the liveness probe and the per-page history
 *  key off it), and the article's keyword stops costing rank checks unless
 *  another live article still targets it. Best-effort: the article is
 *  already down. Also called by the owner-pr job when a deleting PR merges. */
export async function afterRemoval(project: Pick<Project, "id">, row: { published_url: string | null; primary_keyword: string | null }): Promise<void> {
  try {
    if (row.published_url) await db().from("pages").delete().eq("project_id", project.id).eq("url", row.published_url);
    const keyword = row.primary_keyword?.trim().toLowerCase();
    if (keyword) {
      // Another article still up (or on its way down, but up) on the same
      // keyword keeps it tracked. Compared in code: a keyword can hold `_`
      // or `%`, which a pattern match would read as wildcards.
      const { data } = await db().from("article_drafts").select("primary_keyword").eq("project_id", project.id).in("status", ["published", "removing"]);
      const stillUp = ((data ?? []) as { primary_keyword: string | null }[]).some((d) => d.primary_keyword?.trim().toLowerCase() === keyword);
      if (!stillUp) await db().from("keywords").update({ status: "paused" }).eq("project_id", project.id).eq("keyword", keyword).eq("status", "tracking");
    }
  } catch (e) {
    console.warn(`[article-owner] after removal: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// --- The repo route: one branch, one commit, one pull request ---------------

type RepoChange =
  | { kind: "edit"; title: string; metaDescription: string; markdown: string; file: Extract<RepoFile, { ok: true }> }
  | { kind: "remove"; title: string; closeEditPr: number | null };

/** `gone`: a removal found no file on the default branch to delete. */
type RepoChangeResult = { ok: true; prUrl: string; prNumber: number } | { ok: false; error: string; gone?: true };

/** Replace one top-level `key: value` line of a frontmatter block. Null when
 *  the value cannot be swapped in place: a block scalar (`|`, `>`), a value
 *  that continues on indented lines, or a quoted string whose closing quote
 *  is not on the same line - replacing the first line alone would leave
 *  invalid YAML behind. A missing key is left as it is (never invent a line
 *  the build may not expect). Lines are spliced, never pattern-replaced, so
 *  a `$` in a title is just a dollar sign. */
function setFrontmatterKey(fm: string, key: string, value: string): string | null {
  const lines = fm.split("\n");
  const i = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (i < 0) return fm;
  const current = lines[i].slice(lines[i].indexOf(":") + 1).trim();
  const continues = i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]);
  const openQuote = /^["']/.test(current) && !(current.length > 1 && current.endsWith(current[0]));
  if (/^[|>]/.test(current) || continues || openQuote) return null;
  lines[i] = `${key}: ${value}`;
  return lines.join("\n");
}

/** The same owner change, built again on the default branch as it is now:
 *  the watcher's answer to a pull request GitHub reports as conflicting
 *  (job-handlers/owner-pr.ts). The row already holds the owner's text (an
 *  edit) or the "removing" mark, so nothing is asked again. Same branch, so
 *  the same pull request. Null: could not be done, the watcher waits. */
export async function redoOwnerChange(project: Project, draftId: string, kind: "edit" | "remove"): Promise<{ prNumber: number } | null> {
  const row = await loadRow(project.id, draftId);
  if (!row || !project.github_repo || !row.repo_path) return null;
  if (row.status !== (kind === "edit" ? "published" : "removing")) return null;
  if (kind === "remove") {
    const change = await repoChange(project, row, { kind: "remove", title: row.title, closeEditPr: null });
    return change.ok ? { prNumber: change.prNumber } : null;
  }
  const file = await readRepoFile(project, row.repo_path);
  if (!file.ok) return null;
  const change = await repoChange(project, row, { kind: "edit", title: row.title, metaDescription: row.meta_description ?? "", markdown: row.markdown, file });
  return change.ok ? { prNumber: change.prNumber } : null;
}

async function repoChange(project: Project, row: Row, change: RepoChange): Promise<RepoChangeResult> {
  const repo = project.github_repo!;
  const path = row.repo_path!;
  const token = await tokenForRef(project);
  if (!token) return { ok: false, error: "Your GitHub connection isn't available right now. Check it in Settings, then try again." };
  const gh = (method: string, p: string, body?: unknown) => githubApi(token, method, p, body);
  const bad = (step: string, status: number): RepoChangeResult => ({ ok: false, error: `GitHub didn't take it (${step}: HTTP ${status}). Try again in a minute.` });

  const repoInfo = await gh("GET", `/repos/${repo}`);
  if (repoInfo.status !== 200) return bad("repo lookup", repoInfo.status);
  const baseBranch = String(repoInfo.json?.default_branch ?? "main");

  let content: string | null = null;
  if (change.kind === "edit") {
    // The file's own frontmatter, line for line, with only the title and
    // description values swapped; its own body shape (an H1 when it had
    // one); our signature last, as buildArticleFile writes it.
    const sample = parseFrontmatter(change.file.text);
    // A site with its own file shape (site-style.ts): values bare, the way
    // its parser reads them, and no raw HTML under the body.
    const style = siteStyleOf(project);
    const fmValue = (v: string) => (style?.frontmatter ? v.replace(/\s*[\r\n]+\s*/g, " ").trim() : yamlDoubleQuote(v));
    const withTitle = setFrontmatterKey(change.file.frontmatter, "title", fmValue(change.title));
    const descKey = DESCRIPTION_KEYS.find((k) => k in sample.raw);
    let fm = withTitle === null || !descKey ? withTitle : setFrontmatterKey(withTitle, descKey, fmValue(change.metaDescription || buildExcerpt(change.markdown)));
    // A styled site may write the description under more than one key
    // (excerpt and meta_description): an edit keeps them all in step.
    if (style?.frontmatter) {
      for (const k of DESCRIPTION_KEYS) if (fm !== null && k !== descKey && k in sample.raw) fm = setFrontmatterKey(fm, k, fmValue(change.metaDescription || buildExcerpt(change.markdown)));
    }
    if (fm === null) return { ok: false, error: `The article's front matter writes its title or description over several lines, which can't be updated safely from here. ${ON_GITHUB}` };
    // Own-site links root-relative, as every file we write (a site's lint may
    // require `](/blog/...)`; relativizeOwnLinks says which one did).
    // The free plan's credit goes back under the body exactly as the publish
    // wrote it (readRepoFile took it off, so the owner never edits it and a
    // save never doubles it): an edit must not be the way it disappears.
    const credit = (await isFreeProject(project.id)) ? `\n\n${creditLine(creditParts(project, row.id))}` : "";
    content = `---\n${fm}\n---\n\n${relativizeOwnLinks(change.markdown, project.domain).trim().replace(CREDIT_LINE_AT_END, "").trim()}${style?.plainBody ? "" : `${credit}\n\n${articleSignature(row.id)}`}\n`;
  } else {
    // The file must still be there to delete (a stale path after a move).
    const head = await gh("GET", `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(baseBranch)}`);
    if (head.status === 404) return { ok: false, gone: true, error: "The article's file isn't in your repo any more - was it moved or deleted on GitHub? Nothing was changed." };
    if (head.status !== 200) return bad("file read", head.status);
  }

  const ref = await gh("GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${baseBranch}`)}`);
  const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;
  if (ref.status !== 200 || !headSha) return bad("branch lookup", ref.status);
  const headCommit = await gh("GET", `/repos/${repo}/git/commits/${headSha}`);
  const baseTree = (headCommit.json?.tree as { sha?: string } | undefined)?.sha;
  if (headCommit.status !== 200 || !baseTree) return bad("tree lookup", headCommit.status);

  // One branch per article and kind, as the publish names its own. A
  // second edit while the first still waits on its merge lands on the same
  // branch and so in the same pull request (see pendingEditPr).
  const id8 = row.id.replace(/-/g, "").slice(0, 8);
  const branch = `dispatchseo/${change.kind}-${row.slug}-${id8}`;
  const owner = repo.split("/")[0];
  if (change.kind === "remove" && change.closeEditPr) {
    // An edit still waiting on its merge would bring the file back (or
    // conflict) if merged after the deletion: close it first.
    const closed = await gh("PATCH", `/repos/${repo}/pulls/${change.closeEditPr}`, { state: "closed" });
    if (closed.status !== 200) return bad("close the pending edit", closed.status);
  }
  const tree = await gh("POST", `/repos/${repo}/git/trees`, {
    base_tree: baseTree,
    // sha: null in a tree entry is GitHub's "delete this path".
    tree: [content !== null ? { path, mode: "100644", type: "blob", content } : { path, mode: "100644", type: "blob", sha: null }],
  });
  if (tree.status !== 201 || !tree.json?.sha) return bad("tree create", tree.status);

  const commit = await gh("POST", `/repos/${repo}/git/commits`, {
    message:
      change.kind === "edit"
        ? `Update article: ${change.title}\n\nEdited by the site owner on their DispatchSEO dashboard; committed by the DispatchSEO app.`
        : `Remove article: ${change.title}\n\nTaken down by the site owner from their DispatchSEO dashboard; committed by the DispatchSEO app.`,
    tree: String(tree.json.sha),
    parents: [headSha],
  });
  if (commit.status !== 201 || !commit.json?.sha) return bad("commit", commit.status);
  // The branch is pointed at the finished commit in ONE move: created there,
  // or (a leftover branch, or a pull request still open on it) moved there.
  // Never by way of the default branch's head - a branch reset to its base
  // has nothing to merge, and GitHub CLOSES its open pull request on the
  // spot; the change then came back under a new pull request nobody watched,
  // while the old one's watcher saw "closed" and undid the owner's edit.
  const created = await gh("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: String(commit.json.sha) });
  if (created.status === 422) {
    const moved = await gh("PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, { sha: String(commit.json.sha), force: true });
    if (moved.status !== 200) return bad("branch update", moved.status);
  } else if (created.status !== 201) {
    return bad("branch create", created.status);
  }

  const base = await backendBaseUrl();
  const auto = effectiveAutomations(project).auto_merge;
  const pr = await gh("POST", `/repos/${repo}/pulls`, {
    title: change.kind === "edit" ? `Update article: ${change.title}` : `Remove article: ${change.title}`,
    head: branch,
    base: baseBranch,
    body:
      (change.kind === "edit"
        ? "The site owner edited this article on their DispatchSEO dashboard; this pull request carries the change."
        : "The site owner took this article down from their DispatchSEO dashboard; this pull request deletes its file.") +
      (auto ? " It merges on its own once the checks pass." : " Merge it to apply the change.") +
      `\n\nOpened by the DispatchSEO app. Articles: ${base}/articles`,
  });
  let prNumber: number;
  let prUrl: string;
  if (pr.status === 201 && pr.json) {
    prNumber = Number(pr.json.number);
    prUrl = String(pr.json.html_url ?? "");
  } else if (pr.status === 422) {
    // Already open from an earlier attempt on this branch: it now holds
    // this commit, so it is the pull request.
    const open = await gh("GET", `/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);
    const first = (Array.isArray(open.json) ? (open.json as unknown as { number?: number; html_url?: string }[]) : [])[0];
    if (!first?.number) return bad("pull request", pr.status);
    prNumber = Number(first.number);
    prUrl = String(first.html_url ?? "");
  } else {
    return bad("pull request", pr.status);
  }
  if (!prNumber || !prUrl) return bad("pull request", 0);
  // The pipeline's label, so the PR sits with the others on GitHub. Tolerated
  // in full: the App may hold no Issues permission.
  await gh("POST", `/repos/${repo}/issues/${prNumber}/labels`, { labels: ["seo"] });
  return { ok: true, prUrl, prNumber };
}

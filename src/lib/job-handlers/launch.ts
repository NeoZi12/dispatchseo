import { db } from "@/lib/db";
import { enqueue, type Job } from "@/lib/jobs";
import { effectiveAutomations, getProjectById, publishTarget, writerMode, type Project } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { siteRoot, sitePath } from "@/lib/site-root";
import { resolveSitePath } from "@/lib/site-root-resolve";
import { fetchProjectUrl } from "@/lib/url-guard";
import { isCloudMode } from "@/lib/cloud";
import { checkRewriteLive, mergeRewritePr, servesOwnBlog, siteAppRoot, switchToHostedBlog } from "@/lib/hosted-rewrite";
import {
  addSearchConsoleSite,
  confirmSiteVerification,
  grantHasSetupScopes,
  oauthListSites,
  setTrackedProperty,
  siteVerificationFileBody,
  siteVerificationFileToken,
} from "@/lib/gsc-oauth";

// A new hosted site's first minutes, as one queue job.
//
// Setup asks the owner for three things - the address, GitHub, Google - and
// promises nothing else is ever asked. Everything after that is this job:
// switch the blog on, get Google to confirm the site is theirs, and start
// reading the site, which chains research and the first article
// (job-handlers/crawl.ts). The dashboard's first-article card
// (lib/first-article-progress.ts) reads its progress from the same rows this
// job writes, so nothing new is recorded here.
//
// Every step is idempotent: the job retries on a throw, and a retry walks
// every step again and finds the done ones done. A failing step never stops
// the others - the crawl is queued whatever happens to the blog or Google,
// because the article is the thing the owner is waiting for - and the error
// names its step ("blog: ...", "google: ...") so the card can say which one
// is stuck.

/** Queued once per project; the key frees itself when the job finishes. */
export async function enqueueLaunch(projectId: string): Promise<Job | null> {
  return enqueue({ projectId, kind: "launch", idempotencyKey: `launch:${projectId}` });
}

/** Sites the new setup finished but whose launch never queued (the stamp
 *  landed, the enqueue was lost). Called from the jobs tick; cheap: one
 *  indexed read of a handful of rows. Only projects made since the new setup
 *  shipped - an older site never had a launch and keeps its normal
 *  dashboard (decided 2026-11-06). */
const BACKFILL_SINCE = "2026-11-06";

export async function backfillLaunches(): Promise<number> {
  if (!isCloudMode()) return 0;
  const { data, error } = await db()
    .from("projects")
    .select("id")
    .eq("writer_mode", "hosted")
    .not("setup_connected_at", "is", null)
    .not("gsc_oauth_refresh_token", "is", null)
    .gt("created_at", BACKFILL_SINCE)
    .limit(200);
  if (error || !data?.length) return 0;
  const ids = (data as { id: string }[]).map((r) => r.id);
  const { data: have, error: haveError } = await db().from("jobs").select("project_id").eq("kind", "launch").in("project_id", ids);
  // An unreadable queue must not read as "nobody launched": that would
  // re-run every site's launch.
  if (haveError) return 0;
  const launched = new Set(((have ?? []) as { project_id: string }[]).map((r) => r.project_id));
  let queued = 0;
  for (const id of ids) {
    if (launched.has(id)) continue;
    if (await enqueueLaunch(id)) queued++;
  }
  return queued;
}

/** The prefix a step's error carries, read back by the progress card. */
export type LaunchStep = "blog" | "crawl" | "google";

/** One step's own error out of the joined "blog: …; google: …; crawl: …",
 *  so a Google failure never reads as a blog one. Null = that step passed. */
export function launchStepError(error: string | null | undefined, step: LaunchStep): string | null {
  if (!error) return null;
  for (const part of error.split(/; (?=(?:blog|crawl|google): )/)) {
    if (part.startsWith(`${step}: `)) return part.slice(step.length + 2);
  }
  return null;
}

/** How long one attempt waits for the verification file to answer. Under
 *  the drain route's 240 s deadline with room for the other steps; a site
 *  still deploying is picked up by the retry. */
const FILE_WAIT_MS = 120_000;
const FILE_POLL_MS = 10_000;

export async function runLaunchJob(job: Job): Promise<void> {
  let project = await getProjectById(job.project_id);
  if (!project) return; // deleted since it was queued: a state, not a fault
  if (writerMode(project) !== "hosted") return;
  // A site the writer may not work on (beyond the plan's site allowance, a
  // second free site, a lapsed plan) gets no launch crawl, Google setup or
  // profile spend. A quiet skip, like the crons' "setup incomplete": the
  // plan's state, not a fault. A gate that could not READ the plan is a
  // blip, not a verdict: that one throws, so the job retries (the launch's
  // idempotency key never queues a second one, so a quiet skip is final).
  const { writerGate, getSubscriptionOrThrow, isActive } = await import("@/lib/billing");
  // The gate reads the plan through getSubscription, which answers "no
  // plan" on a read error - and a paying owner's site would then be skipped
  // here for good. Ask once in the form that throws, so a blip retries; and
  // a gate that says "inactive" about a plan this read saw live was a blip
  // inside the gate, so that retries too.
  const sub = project.owner_user_id ? await getSubscriptionOrThrow(project.owner_user_id) : null;
  const gate = await writerGate(project.id);
  if (!gate.allowed && isActive(sub) && /inactive/i.test(gate.reason)) throw new Error(`plan: read as inactive while the subscription is live (${gate.reason})`);
  if (!gate.allowed && gate.reason.startsWith("could not read")) throw new Error(`plan: ${gate.reason}`);
  if (!gate.allowed) {
    console.info(`[launch] ${project.slug}: skipped, setup incomplete (${gate.reason})`);
    return;
  }

  const errors: string[] = [];
  // Before anything reads the site: a GitHub Pages project site lives in a
  // folder of its host, and the crawl, Google and the article addresses must
  // all start there (site-root.ts). Best effort - an unanswered check leaves
  // the site at the root, as before.
  try {
    project = await resolveSitePath(project);
  } catch (e) {
    console.warn(`[launch] ${project.slug}: site folder not checked: ${message(e)}`);
  }
  try {
    project = await launchBlog(project);
  } catch (e) {
    errors.push(`blog: ${message(e)}`);
    // A step that threw may still have written (the flip, the origin read
    // from the homepage); the rest of the job reads the row as it is now.
    project = (await getProjectById(job.project_id)) ?? project;
  }
  try {
    await queueFirstCrawl(project, job);
  } catch (e) {
    errors.push(`crawl: ${message(e)}`);
  }
  try {
    await launchGoogle(project);
  } catch (e) {
    errors.push(`google: ${message(e)}`);
  }
  if (errors.length) throw new Error(errors.join("; "));
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------- blog

async function launchBlog(project: Project): Promise<Project> {
  // A site in a folder of its host (a GitHub Pages project site) cannot have
  // a /blog forwarded to us - the host's root is not theirs, and a static
  // host takes no forwarding rules. Its articles go into its own repo, which
  // setup only lets through when the repo has an article folder
  // (onboarding/page.tsx folderSiteFit). Undo a hosted switch an earlier
  // launch made before the folder was known.
  if (sitePath(project)) {
    if (publishTarget(project) === "hosted") {
      await db().from("projects").update({ publish_target: "github", hosted_rewrite_pr_url: null, hosted_rewrite_state: null }).eq("id", project.id);
      project = (await getProjectById(project.id)) ?? project;
    }
    return project;
  }
  if (publishTarget(project) !== "hosted" || !project.hosted_key) {
    // A site that already runs its own blog keeps it: articles go into the
    // repo next to its posts (publish-repo), and there is nothing to switch -
    // PROVIDED the repo actually holds its posts. A blog run from a CMS has
    // none in the repo, and its first article used to park for good
    // (dfmsolutions.de, 2026-11-10). That site gets the hosted blog at a
    // second path (/articles) now, while the first article is still being
    // written, so the forwarding is merged and deployed by the time it is
    // done. "Could not tell" (GitHub unreadable) keeps the old answer; the
    // publish step makes the same switch if the folder really is missing.
    let secondPath = false;
    if (await servesOwnBlog(project)) {
      const { repoHasArticleFolder } = await import("@/lib/repo-publish");
      if ((await repoHasArticleFolder(project).catch(() => null)) !== false) return project;
      // Posts kept as data in the repo (a JSON array, an array in a code
      // file) are a blog we can write into: stay on the repo route
      // (blog-store.ts). A scout that runs out of its minute is "not yet",
      // uncached, and the publish step asks again.
      // Only on Auto: without merging the second path is what goes live.
      const { ensureBlogStore } = await import("@/lib/blog-store");
      if (effectiveAutomations(project).auto_merge && (await ensureBlogStore(project, { deadlineMs: 60_000 }).catch(() => null))?.status === "ready") return project;
      secondPath = true;
    }
    if (!(await switchToHostedBlog(project, secondPath ? { secondPath, ownBlog: true } : {}))) {
      // A second path that is taken too is the old "keeps its own blog"
      // answer, not a failure: the publish step parks and says so.
      if (secondPath) return project;
      throw new Error("could not switch the project to the hosted blog");
    }
  } else if (!project.hosted_rewrite_pr_url && !project.hosted_rewrite_live_at) {
    // Flipped on an earlier attempt, but the pull request never opened.
    await switchToHostedBlog({ ...project, publish_target: "github" });
  }
  // Re-read: openRewritePr stamps "manual" on the row without returning it.
  project = (await getProjectById(project.id)) ?? project;
  if (project.hosted_rewrite_live_at) return project;

  const pr = project.hosted_rewrite_pr_url;
  // "manual" = a host we cannot write the rule for; the card links the
  // owner to the snippet. Nothing to retry.
  if (pr === "manual") return project;
  if (!pr) throw new Error("the forwarding pull request did not open");

  // Merged by us on Auto (hosted-rewrite.ts mergeRewritePr, shared with the
  // switch a parked article triggers): a site the new setup launched on Auto
  // was promised its blog switched on with nothing else to do. Not on Auto:
  // the PR stays open and the card links it. A merge GitHub refuses (branch
  // protection, a conflict) also leaves it open.
  if (project.auto_merge) await mergeRewritePr(project, pr);
  await checkRewriteLive(project).catch(() => false);
  return project;
}

// ---------------------------------------------------------------- crawl

/** Same shape as completeConnectPhase's crawl. Once per launch: a retry of
 *  this job must not re-read 150 pages, so a crawl queued since the launch
 *  started counts as done. */
async function queueFirstCrawl(project: Project, job: Job): Promise<void> {
  if (!project.domain) return;
  const { data } = await db()
    .from("jobs")
    .select("id")
    .eq("project_id", project.id)
    .eq("kind", "crawl")
    .gte("created_at", job.created_at)
    .limit(1);
  if (data && data.length) return;
  const day = new Date().toISOString().slice(0, 10);
  await enqueue({
    projectId: project.id,
    kind: "crawl",
    payload: { isWordPress: publishTarget(project) === "wordpress", maxPages: 150 },
    idempotencyKey: `crawl:${project.id}:${day}`,
  });
}

// ---------------------------------------------------------------- google

/** The URL-prefix property we verify: the site's real origin, with the
 *  trailing slash Search Console names it with. */
export function urlPrefixProperty(project: Pick<Project, "domain"> & { hosted_origin?: string | null; site_path?: string | null }): string {
  return `${siteRoot(project)}/`;
}

function propertyCandidates(project: Project): string[] {
  // A site in a folder is only its folder: the host's domain property or
  // root (another repo's site, or somebody else's) would count other pages.
  if (sitePath(project)) return [urlPrefixProperty(project)];
  const host = project.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return [
    `sc-domain:${host}`,
    urlPrefixProperty(project),
    `https://${host}/`,
    `https://www.${host}/`,
    `http://${host}/`,
    `http://www.${host}/`,
  ].filter((v, i, all) => all.indexOf(v) === i);
}

async function launchGoogle(project: Project): Promise<void> {
  const refresh = project.gsc_oauth_refresh_token;
  if (!refresh || !project.domain) return;

  // Only properties this account can read count: an unverified entry is a
  // property someone added and never proved.
  const sites = (await oauthListSites(refresh)).filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser");
  const has = (url: string) => sites.some((s) => s.siteUrl === url);

  // Rows made by the old flow carry a guessed `sc-domain:` from creation.
  // A guess that is not in the account's list is not a property.
  if (project.gsc_site_url) {
    // A folder site's property is its folder; a host-wide one stored before
    // the folder was known counts other people's pages.
    if (has(project.gsc_site_url) && (!sitePath(project) || project.gsc_site_url === urlPrefixProperty(project))) return;
    await db().from("projects").update({ gsc_site_url: null }).eq("id", project.id);
    project.gsc_site_url = null;
  }

  const found = propertyCandidates(project).find(has);
  if (found) {
    const err = await setTrackedProperty(project.id, found);
    if (err) throw new Error(err);
    return;
  }

  // No property yet: verify the site's origin with Google's file, committed
  // to the repo. A read-only grant (every grant while GOOGLE_SETUP_SCOPES is
  // off) stops here with gsc_site_url still empty, and the card shows the
  // owner the two Search Console clicks instead.
  if (!(await grantHasSetupScopes(refresh))) return;
  const siteUrl = urlPrefixProperty(project);
  const token = await siteVerificationFileToken(refresh, siteUrl);
  if (!token) return;
  await commitVerificationFile(project, token);
  await waitForFile(project, `${siteUrl}${token}`, token);
  await confirmSiteVerification(refresh, siteUrl);
  // A read-only grant cannot add the property, but Google lists a site its
  // user just verified, so the re-list below may still find it.
  await addSearchConsoleSite(refresh, siteUrl).catch(() => false);
  const after = await oauthListSites(refresh);
  const listed = after.find((s) => s.siteUrl === siteUrl);
  if (!listed) throw new Error("Google verified the site but it is not in Search Console yet");
  const err = await setTrackedProperty(project.id, siteUrl);
  if (err) throw new Error(err);
}

/** One commit on the default branch, no pull request: a static file nobody
 *  links to, which Google reads once. Next.js and most static builders
 *  serve public/ at the root; a plain static site serves its root. */
async function commitVerificationFile(project: Project, token: string): Promise<void> {
  const repo = project.github_repo;
  if (!repo) throw new Error("no repo to put Google's verification file in");
  const gh = await tokenForRef(project);
  if (!gh) throw new Error("no GitHub access to add Google's verification file");

  const info = await githubApi(gh, "GET", `/repos/${repo}`);
  if (info.status !== 200) throw new Error(`could not read the repo (HTTP ${info.status})`);
  const branch = String(info.json?.default_branch ?? "main");
  const tree = await githubApi(gh, "GET", `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const paths = ((tree.json?.tree as { path?: string; type?: string }[] | undefined) ?? [])
    .filter((e) => e.type === "blob")
    .map((e) => String(e.path ?? ""));
  // Where the site serves its static files from, learned from the live page
  // first (servedFileDir); the framework guess only when the page names no
  // file we can find in the repo.
  // Folder sites only for now: root sites keep the guess that has worked
  // for every launch so far.
  let dir = sitePath(project) ? await servedFileDir(project, paths).catch(() => null) : null;
  if (dir === null) {
    const app = siteAppRoot(paths);
    const prefix = app.root ? `${app.root}/` : "";
    const appPaths = prefix ? paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)) : paths;
    const usesPublic = appPaths.some((p) => p.startsWith("public/") || /^next\.config\.(js|mjs|ts|cjs)$/.test(p));
    dir = `${prefix}${usesPublic ? "public/" : ""}`;
  }
  const path = `${dir}${token}`;

  const body = siteVerificationFileBody(token);
  const existing = await githubApi(gh, "GET", `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  let sha: string | undefined;
  if (existing.status === 200) {
    const content = typeof existing.json?.content === "string" ? Buffer.from(existing.json.content.replace(/\n/g, ""), "base64").toString("utf8") : "";
    if (content.trim() === body) return;
    sha = typeof existing.json?.sha === "string" ? existing.json.sha : undefined;
  }
  const put = await githubApi(gh, "PUT", `/repos/${repo}/contents/${encodeURI(path)}`, {
    message: "Add Google's site verification file\n\nLets Google confirm the site is yours, so Search Console shows its searches.",
    content: Buffer.from(body, "utf8").toString("base64"),
    branch,
    ...(sha ? { sha } : {}),
  });
  if (put.status !== 200 && put.status !== 201) {
    const why = typeof put.json?.message === "string" ? put.json.message : `HTTP ${put.status}`;
    throw new Error(`could not add Google's verification file: ${why}`);
  }
}

async function waitForFile(project: Project, url: string, token: string): Promise<void> {
  const until = Date.now() + FILE_WAIT_MS;
  for (;;) {
    const res = await fetchProjectUrl(url, project.domain, { timeoutMs: 8_000, userAgent: "DispatchSEO-Check/1.0" });
    if (res && res.status === 200) {
      const text = await res.text().catch(() => "");
      if (text.includes(token)) return;
    }
    if (Date.now() + FILE_POLL_MS > until) break;
    await new Promise((r) => setTimeout(r, FILE_POLL_MS));
  }
  throw new Error("the verification file is not live on the site yet (waiting for the deploy)");
}

/**
 * The repo folder whose files the live site serves at its root, read off the
 * site itself: the homepage names files (its icon, its images), and the repo
 * file whose path ends in the same relative name says which folder they come
 * from. "website/public/" for a VitePress site in website/, "public/" for
 * Next.js, "" for a plain static site. Null when the page names nothing the
 * repo has - the caller falls back to the framework guess.
 *
 * Learned rather than guessed because the guess (public/ when there is a
 * Next config) put Google's file at the repo root of a VitePress docs site,
 * where nothing serves it (mohamadgarmabi, 2026-11-10).
 */
export async function servedFileDir(project: Project, paths: string[]): Promise<string | null> {
  const root = siteRoot(project);
  const host = project.domain.replace(/^www\./, "");
  const res = await fetchProjectUrl(`${root}/`, host, { timeoutMs: 8_000, userAgent: "DispatchSEO-Check/1.0" });
  if (!res || !res.ok) return null;
  const html = (await res.text().catch(() => "")).slice(0, 400_000);
  const rootUrl = new URL(`${root}/`);
  const rels = new Set<string>();
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], rootUrl);
    } catch {
      continue;
    }
    if (u.host !== rootUrl.host || !u.pathname.startsWith(rootUrl.pathname)) continue;
    const rel = decodeURIComponent(u.pathname.slice(rootUrl.pathname.length));
    // A file, not a page or a hashed build output nobody commits.
    if (!/\.(png|jpe?g|gif|svg|webp|ico|txt|xml|webmanifest|json|woff2?)$/i.test(rel)) continue;
    rels.add(rel);
  }
  const votes = new Map<string, number>();
  for (const rel of rels) {
    const hits = paths.filter((p) => p === rel || p.endsWith(`/${rel}`));
    if (hits.length !== 1) continue; // ambiguous or not in the repo
    const dir = hits[0].slice(0, hits[0].length - rel.length);
    // A route folder (Next's app/ icons) is not a folder of plain files.
    if (/(^|\/)(app|pages)\/$/.test(dir)) continue;
    votes.set(dir, (votes.get(dir) ?? 0) + 1);
  }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

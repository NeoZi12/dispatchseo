import { db } from "@/lib/db";
import { enqueue, type Job } from "@/lib/jobs";
import { getProjectById, publishTarget, writerMode, type Project } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { siteOrigin } from "@/lib/hosted-blog";
import { fetchProjectUrl } from "@/lib/url-guard";
import { isCloudMode } from "@/lib/cloud";
import { checkRewriteLive, servesOwnBlog, siteAppRoot, switchToHostedBlog } from "@/lib/hosted-rewrite";
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

  const errors: string[] = [];
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
  if (publishTarget(project) !== "hosted" || !project.hosted_key) {
    // A site that already runs its own blog keeps it: articles go into the
    // repo next to its posts (publish-repo), and there is nothing to switch.
    if (await servesOwnBlog(project)) return project;
    if (!(await switchToHostedBlog(project))) throw new Error("could not switch the project to the hosted blog");
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

  // The one place a forwarding pull request is merged by us. openRewritePr
  // never merges (that routing change is the owner's call on an existing
  // site), but a site the new setup launched on Auto was promised its blog
  // switched on with nothing else to do. Not on Auto: the PR stays open and
  // the card links it. A merge GitHub refuses (branch protection, a
  // conflict) also leaves it open.
  if (project.auto_merge) await mergeRewritePr(project, pr);
  await checkRewriteLive(project).catch(() => false);
  return project;
}

/** hosted-rewrite.ts's branch. Only a PR from exactly this branch, in the
 *  project's own repo, is ever merged here. */
const REWRITE_BRANCH = "dispatchseo/hosted-blog";

async function mergeRewritePr(project: Project, prUrl: string): Promise<void> {
  const repo = project.github_repo;
  const number = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!repo || !number) throw new Error("the forwarding pull request has no number we can read");
  const token = await tokenForRef(project);
  if (!token) throw new Error("no GitHub access to merge the forwarding pull request");

  const state = await githubApi(token, "GET", `/repos/${repo}/pulls/${number}`);
  if (state.status !== 200 || !state.json) throw new Error(`could not read the forwarding pull request (HTTP ${state.status})`);
  if (state.json.merged) return;
  if (state.json.state !== "open") throw new Error("the forwarding pull request was closed without merging");

  // The stored URL is a pointer, not proof: merge only our own branch into
  // the project's own repo, at the exact commit we just looked at.
  const same = (a: unknown) => typeof a === "string" && a.toLowerCase() === repo.toLowerCase();
  const base = state.json.base as { repo?: { full_name?: string } } | undefined;
  const head = state.json.head as { ref?: string; sha?: string; repo?: { full_name?: string } } | undefined;
  if (!same(base?.repo?.full_name) || head?.ref !== REWRITE_BRANCH || !same(head?.repo?.full_name) || !head?.sha) {
    throw new Error("the stored pull request is not our forwarding pull request; left alone");
  }

  const merged = await githubApi(token, "PUT", `/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash", sha: head.sha });
  if (merged.status !== 200) {
    const why = typeof merged.json?.message === "string" ? merged.json.message : `HTTP ${merged.status}`;
    throw new Error(`GitHub did not merge the forwarding pull request: ${why}`);
  }
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
export function urlPrefixProperty(project: Pick<Project, "domain"> & { hosted_origin?: string | null }): string {
  return `${siteOrigin(project).replace(/\/+$/, "")}/`;
}

function propertyCandidates(project: Project): string[] {
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
    if (has(project.gsc_site_url)) return;
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
  const app = siteAppRoot(paths);
  const prefix = app.root ? `${app.root}/` : "";
  const appPaths = prefix ? paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)) : paths;
  const usesPublic = appPaths.some((p) => p.startsWith("public/") || /^next\.config\.(js|mjs|ts|cjs)$/.test(p));
  const path = `${prefix}${usesPublic ? "public/" : ""}${token}`;

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

import { db } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { fetchProjectUrl } from "@/lib/url-guard";

import { enqueue } from "@/lib/jobs";
import { getProjectById, effectiveAutomations } from "@/lib/projects";
import { fetchPullRequest } from "@/lib/repo-publish";
import { landMemo, landPullRequest, mergedWithoutChange } from "@/lib/pr-landing";
import type { Job } from "@/lib/jobs";
import { trackPublishedKeyword } from "@/lib/autopilot/tracking";
import { submitSiteSitemap } from "@/lib/gsc-sitemaps";
import { ideaDone } from "@/lib/writer/runs";
import { warmScreenshotsLater } from "@/lib/page-screenshot";
import { notifyFirstArticleLive } from "@/lib/first-article-email";

// Confirms a published article is actually reachable - and, once it is, files
// it as a real page of the site.
//
// The first half exists because "we posted it" and "it is live" are different
// claims, and this product has a standing rule against reporting the first as
// if it were the second. A post can be created successfully and still not be
// visible: a caching layer that has not caught up, a plugin that holds new
// posts for moderation, a theme that does not list the post type, a permalink
// structure that puts it somewhere other than where the API said.
//
// THE SECOND HALF matters just as much. Until the page is logged, an article
// published this way is invisible to the rest of the product: rank tracking,
// the refresh loop, internal-link candidates and the "do not write this twice"
// corpus all read `pages`, and the queued idea that produced it would sit
// in_progress forever with nothing left to move it. A repo article built by
// the customer's own CI agent gets this from its log_page call - these two
// routes have no agent in the loop, so it happens here.
//
// ORDER IS DELIBERATE: log the page, close the idea, and only then mark the
// draft published. The status flip is what makes this job a no-op on re-run,
// so it goes last - a failure anywhere above it leaves the draft `finished`
// and the retry does the whole thing again. The page write is an upsert on
// (project_id, url), so repeating it costs nothing.
//
// TWO SHAPES OF WAITING. WordPress hands back the real permalink, so there is
// one URL and the only question is whether it serves yet - worth a retry, and
// the queue's own backoff (minutes) is the right clock. A pull request is a
// different kind of waiting: somebody has to merge it, then a deploy has to
// run, and the address is a GUESS the publisher derived from the repo layout.
// That needs hours and days, which the backoff ladder cannot express, so the
// repo branch RE-ARMS itself instead - it enqueues its own successor and
// returns normally, and each of those is a completed job rather than a failed
// one. The round suffix on the idempotency key is what lets the successor
// exist while the current job is still unfinished.

export async function runVerifyJob(job: Job): Promise<void> {
  const draftId = String(job.payload.draftId ?? "");
  if (!draftId) throw new Error("verify job is missing its draft");
  if (job.payload.prNumber) return verifyRepoArticle(job, draftId);

  const url = String(job.payload.url ?? "");
  if (!url) throw new Error("verify job is missing its draft or url");

  const { data } = await db()
    .from("article_drafts")
    .select("id, project_id, status, title, slug, primary_keyword, suggestion_id")
    .eq("id", draftId)
    .maybeSingle();
  if (!data) throw new Error("that article no longer exists");
  const row = data as {
    id: string;
    project_id: string;
    status: string;
    title: string;
    slug: string;
    primary_keyword: string | null;
    suggestion_id: string | null;
  };

  // ALLOWLIST, not a blocklist: only an article we actually posted is worth
  // confirming. A draft the owner discarded between the publish and this check
  // must not be marked published (discard does not cancel queued jobs), and an
  // already-published one has nothing left to do.
  if (row.status !== "finished") return;

  // Through the project-scoped guard, same as every other outbound fetch: the
  // URL came back from a customer's own WordPress and is therefore not ours
  // to trust just because we were the ones who asked for it. Scoped to the
  // host the owner connected (wp_url - the install can live on a host the
  // public domain does not), falling back to the project's domain; scoping it
  // to the URL's own host would make the guard a tautology.
  const scopeProject = await getProjectById(row.project_id);
  if (!scopeProject) throw new Error("project no longer exists");
  let scopeHost = scopeProject.domain;
  if (scopeProject.wp_url) {
    try {
      scopeHost = new URL(scopeProject.wp_url).hostname;
    } catch {
      scopeHost = scopeProject.domain;
    }
  }
  const res = await fetchProjectUrl(url, scopeHost, {
    timeoutMs: 12_000,
    userAgent: "Mozilla/5.0 (compatible; DispatchSEO/1.0; +https://dispatchseo.com)",
  });
  if (!res || !res.ok) {
    throw new Error(`the published page did not answer yet (${res ? res.status : "no response"})`);
  }
  // A 200 is not proof the ARTICLE is there: a caching layer, a maintenance
  // page or a theme that serves the front page for unknown paths all answer
  // 200 too. The page must carry the article's title or slug (audit H7).
  if (!(await pageCarriesArticle(res, row.title, row.slug, { url, scopeHost }))) {

    throw new Error("the published page loads but does not show the article yet");
  }

  const now = new Date().toISOString();

  // Same row shape log_page writes, so a page published through WordPress and
  // one published through a pull request are the same kind of thing to every
  // reader downstream.
  const { error: pageError } = await db()
    .from("pages")
    .upsert(
      {
        project_id: row.project_id,
        url,
        title: row.title,
        type: "guide",
        primary_keyword: row.primary_keyword,
        published_at: now,
        // We just loaded it, so it IS live - and the liveness module reads
        // these two columns, not published_at. Without them a page we verified
        // seconds ago shows as pending on the Pages screen until that module's
        // own probe happens to come round to it.
        live_at: now,
        live_checked_at: now,
      },
      { onConflict: "project_id,url" },
    );
  if (pageError) {
    throw new Error(`the page is live but we could not record it: ${pageError.message}`);
  }

  // Live: a hosted site's keyword starts being rank-tracked now, not when it
  // was queued (autopilot/tracking.ts).
  await trackPublishedKeyword(scopeProject, row);
  // Google re-reads the site's sitemap now (gsc-sitemaps.ts); best-effort.
  await submitSiteSitemap(scopeProject).catch(() => undefined);

  // The idea is finished. started_at is cleared for the same reason
  // update_suggestion clears it: it is a build clock, and a stale one feeds
  // the stuck-build sweep.
  if (row.suggestion_id) await ideaDone(row.project_id, row.suggestion_id, now, true);

  await db()
    .from("article_drafts")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", draftId);
  // The owner's "your first article is up" email (first-article-email.ts).
  await notifyFirstArticleLive(scopeProject, { draftId, url, title: row.title });

  // The dashboard's preview of it, taken once now so opening the article
  // never waits on a browser (page-screenshot.ts).
  warmScreenshotsLater(row.project_id, [url], 1);
}

/** How long after a merge we keep looking for the page. Long enough for a slow
 *  static build and a CDN purge, short enough that a site whose URLs we guessed
 *  wrong stops being asked about. */
const LIVE_WINDOW_MS = 48 * 60 * 60_000;
const STORE_LIVE_WINDOW_MS = 2 * 60 * 60_000;
const AFTER_MERGE_RETRY_MS = 30 * 60_000;
const AWAITING_MERGE_RETRY_MS = 2 * 60 * 60_000;
/** On Auto, the first few looks come every half hour - checks usually finish
 *  within minutes of the PR opening, and "automatic" should not mean the
 *  article waits two hours for a merge nobody is blocking. After six rounds
 *  (three hours) it is clearly waiting on something else, and the slow cadence
 *  takes over. */
const AUTO_EARLY_RETRY_MS = 30 * 60_000;
const AUTO_EARLY_ROUNDS = 6;
/** Right after WE merged, the page is minutes away: look again soon rather
 *  than waiting out a whole round. */
const POST_MERGE_LOOK_MS = 2 * 60_000;
/** Hard ceiling on the chain regardless of the deadline - a missing or
 *  unparseable deadline must never mean forever. 30 days at two-hour rounds
 *  is 360; this leaves room for the early Auto rounds. */
const MAX_ROUNDS = 500;
async function verifyRepoArticle(job: Job, draftId: string): Promise<void> {
  const prNumber = Number(job.payload.prNumber);
  const urls = Array.isArray(job.payload.urls) ? (job.payload.urls as string[]) : [];
  const deadline = String(job.payload.deadline ?? "");
  const round = Number(job.payload.round ?? 0);

  const { data } = await db()
    .from("article_drafts")
    .select(
      "id, project_id, status, title, slug, primary_keyword, suggestion_id, pr_url, pr_number, pr_merged_at",
    )
    .eq("id", draftId)
    .maybeSingle();
  if (!data) throw new Error("that article no longer exists");
  const row = data as {
    id: string;
    project_id: string;
    status: string;
    title: string;
    slug: string;
    primary_keyword: string | null;
    suggestion_id: string | null;
    pr_url: string | null;
    pr_number: number | null;
    pr_merged_at: string | null;
  };
  if (row.status !== "finished") return;
  // The draft let go of this pull request (a store publish undone or written
  // again, publish-repo.ts): this chain watches nothing any more. Without
  // this, our own close of it would read as the owner's "no" below.
  if (row.pr_number !== null && row.pr_number !== prNumber) return;
  if (row.pr_number === null && job.payload.store) return;

  const project = await getProjectById(row.project_id);
  if (!project) throw new Error("project no longer exists");

  const pr = await fetchPullRequest(project, prNumber);
  if (!pr) throw new Error("could not read the pull request from GitHub");

  const nowDate = new Date();
  const now = nowDate.toISOString();

  // STILL OPEN. Nothing to check on the site yet - the article is not in the
  // repo's main branch, so no deploy has seen it.
  if (pr.state === "open") {
    // On Auto the owner delegated the merge; do it as soon as GitHub says the
    // branch is clean. Not clean means checks are still running or the build
    // failed on this PR, and neither is ours to force. This is the ONLY place
    // a repo-route PR is ever merged by us - never at open time, so a failing
    // build cannot be merged before its checks have spoken.
    const auto = effectiveAutomations(project).auto_merge;
    // Paused (the owner's Pause, or the automatic one after a Search Console
    // collapse): nothing new reaches the site, so the lander keeps the pull
    // request open and this chain looks again until the owner resumes. An
    // article the owner approved by hand still goes out - their Publish is
    // the go-ahead (the same rule as publish.ts). Read on its own, only when
    // paused, as publish.ts does: a database without 0089 must still verify.
    let held = false;
    if (auto && project.writer_paused_at) {
      const { data: gate } = await db().from("article_drafts").select("approved_at").eq("id", draftId).eq("project_id", project.id).maybeSingle();
      held = !(gate as { approved_at?: string | null } | null)?.approved_at;
    }
    // A store publish that conflicts (another one merged into the same spot
    // first) is written again from a fresh read of the branch, once.
    if (job.payload.store && pr.mergeable_state === "dirty") {
      const { retryConflictedStorePublish } = await import("./publish-repo");
      await retryConflictedStorePublish(project, draftId, prNumber, { retries: Number(job.payload.storeRetries ?? 0), title: row.title });
      return;
    }
    // Everything else between "open" and "merged" is pr-landing.ts's. What
    // it clears on its own: a check that is red on the default branch too
    // (tanstack-fetch, 2026-11-10: its Cloudflare copy failed on every
    // commit while GitHub Pages - the live site - built fine), a red build
    // that passes when run again, a red check that stays red with our
    // article taken out, a branch the repo wants brought up to date, a repo
    // with squash merging switched off.
    const land = await landPullRequest(project, pr, landMemo(job.payload), { merge: auto && !held });
    if (land.outcome === "merged") {
      // A merge that WORKED is followed up in minutes rather than at the
      // next round: the page is a deploy away.
      if (round < MAX_ROUNDS) await rearm(job, draftId, round, new Date(nowDate.getTime() + POST_MERGE_LOOK_MS), { land: land.memo });
      return;
    }
    const stuck = land.outcome === "wait" ? land.stuck : undefined;
    // Not while held: with merging off the lander calls a red build "red"
    // without checking whether the red is the site's own, and abandoning
    // here marks the site's blog store unusable for good over a pause. The
    // chain looks again, and after a resume the lander checks it properly.
    if (stuck === "red" && job.payload.store && !held) {
      // A store publish (blog-store.ts) whose build stays red is closed and
      // the article goes to the hosted blog - never a comment asking the
      // owner to fix an entry we wrote into their post list.
      const { abandonStorePublish } = await import("./publish-repo");
      await abandonStorePublish(project, draftId, prNumber, { merged: false, reason: "failed its build after the automatic rebuilds", title: row.title });
      return;
    }
    const patch: Record<string, unknown> = { land: land.memo };
    if (stuck && !job.payload.buildNotified) {
      // No comment on the owner's pull request: we never hand the owner a
      // fix to make (owner rule 2026-11-10). The operator sees the stuck
      // article on the customer page; the slow cadence carries on, so a
      // check that turns green later still merges.
      console.warn(`[verify] ${project.slug}: PR #${pr.number} is stuck (${stuck}) after everything automatic was tried`);
      patch.buildNotified = true;
    }
    if (held || ((!deadline || now < deadline) && round < MAX_ROUNDS)) {
      // A refused merge is answered by asking again on the next round, not
      // by failing a job the owner would be emailed about.
      const wait = (land.outcome === "wait" ? land.afterMs : null) ?? (auto && round < AUTO_EARLY_ROUNDS ? AUTO_EARLY_RETRY_MS : AWAITING_MERGE_RETRY_MS);
      // A round spent waiting out a pause is not a round the pull request
      // had to merge in: the deadline moves with it, or a long pause ended
      // the chain and left the article unmerged after the resume.
      if (held && deadline && Number.isFinite(Date.parse(deadline))) patch.deadline = new Date(Date.parse(deadline) + wait).toISOString();
      await rearm(job, draftId, round, new Date(nowDate.getTime() + wait), patch);
    }
    return;
  }

  // CLOSED WITHOUT MERGING. Somebody looked at the article and said no - the
  // owner, or a developer who did not want it. That is a decision, not a
  // failure, and the draft should say so; the idea goes back to approved so it
  // can be written again rather than sitting in_progress forever.
  if (!pr.merged_at) {
    await db()
      .from("article_drafts")
      .update({ status: "discarded", updated_at: now })
      .eq("id", draftId);
    if (row.suggestion_id) {
      await db()
        .from("suggestions")
        .update({ status: "approved", started_at: null })
        .eq("id", row.suggestion_id)
        .eq("project_id", row.project_id);
    }
    return;
  }

  // Merged by hand in the few minutes the branch held no change (the checks
  // were being run without the article, pr-landing.ts): nothing reached the
  // repo. The article is published again, under a new pull request.
  if (mergedWithoutChange(pr, landMemo(job.payload))) {
    const { republishAfterEmptyMerge } = await import("./publish-repo");
    // Once. A second empty merge is recorded as the merge it was: the page
    // never appears, and the "not live" rail says so, instead of a new pull
    // request in the owner's repo every round.
    if (await republishAfterEmptyMerge(project, draftId)) return;
  }

  // MERGED. Stamp it once - the publish handler only knows about a merge it
  // performed itself, so one the owner did by hand is recorded here.
  if (!row.pr_merged_at) {
    await db()
      .from("article_drafts")
      .update({ pr_merged_at: pr.merged_at, updated_at: now })
      .eq("id", draftId);
  }

  // The addresses the publisher predicted, asked in order. The first one that
  // answers 200 is the article's real home - there is no other way to learn it
  // without reading the site's routing config.
  for (const url of urls) {
    // Scoped to the project's own domain - which is also the only host the
    // predictor ever builds these from - so the guard means something.
    const res = await fetchProjectUrl(url, project.domain, {
      timeoutMs: 12_000,
      userAgent: "Mozilla/5.0 (compatible; DispatchSEO/1.0; +https://dispatchseo.com)",
    });
    if (!res || !res.ok) continue;
    // Predicted addresses are guesses, and a single-page app answers EVERY
    // guess with its 200 shell: without this the first guess "went live" on
    // a page that was really the homepage (audit H7). Not the article = not
    // this address; try the next one.
    if (!(await pageCarriesArticle(res, row.title, row.slug, { url, scopeHost: project.domain }))) continue;


    const { error: pageError } = await db()
      .from("pages")
      .upsert(
        {
          project_id: row.project_id,
          url,
          title: row.title,
          type: "guide",
          primary_keyword: row.primary_keyword,
          published_at: now,
          pr_url: row.pr_url,
          live_at: now,
          live_checked_at: now,
        },
        { onConflict: "project_id,url" },
      );
    if (pageError) {
      throw new Error(`the page is live but we could not record it: ${pageError.message}`);
    }

    await trackPublishedKeyword(project, row);
    // Google re-reads the site's sitemap now (gsc-sitemaps.ts); best-effort.
    await submitSiteSitemap(project).catch(() => undefined);

    if (row.suggestion_id) {
      await db()
        .from("suggestions")
        .update({ status: "done", completed_at: now, started_at: null })
        .eq("id", row.suggestion_id)
        .eq("project_id", row.project_id);
    }

    await db()
      .from("article_drafts")
      .update({ status: "published", published_at: now, published_url: url, updated_at: now })
      .eq("id", draftId);
    // The owner's "your first article is up" email (first-article-email.ts).
    await notifyFirstArticleLive(project, { draftId, url, title: row.title });
    // The dashboard's preview of it (page-screenshot.ts).
    warmScreenshotsLater(row.project_id, [url], 1);
    return;
  }

  // Nothing answered. A static site can take a while to build and a CDN a
  // while to purge, so keep asking for two days after the merge - after that
  // the honest reading is that the URL is not one we guessed, and the draft
  // stays `finished` with its pull request linked, which is true.
  const mergedAt = new Date(row.pr_merged_at ?? pr.merged_at).getTime();
  // A store publish gets two hours, not two days: its address is the blog's
  // own pattern rather than a guess, so not live by then means the entry did
  // not reach the site. Its files are put back and the article goes hosted.
  if (job.payload.store && nowDate.getTime() >= mergedAt + STORE_LIVE_WINDOW_MS) {
    const { abandonStorePublish } = await import("./publish-repo");
    await abandonStorePublish(project, draftId, prNumber, { merged: true, reason: "merged but was not live two hours later", title: row.title });
    return;
  }
  if (nowDate.getTime() < mergedAt + LIVE_WINDOW_MS && round < MAX_ROUNDS) {
    await rearm(job, draftId, round, new Date(nowDate.getTime() + AFTER_MERGE_RETRY_MS));
  }
}

/** Queue this job's own successor and finish cleanly.
 *
 *  The round suffix is load-bearing: the plain `verify:<draft>` key is still
 *  held by THIS job (it is not finished until the handler returns), so the
 *  partial unique index would reject the successor and the chain would end
 *  silently on its first hop. */
async function rearm(
  job: Job,
  draftId: string,
  round: number,
  runAfter: Date,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await enqueue({
    projectId: job.project_id,
    kind: "verify",
    payload: { ...job.payload, ...patch, round: round + 1 },
    runAfter,
    idempotencyKey: `verify:${draftId}:r${round + 1}`,
  });
}

/** Does this response's HTML carry the article: its title (entities decoded,
 *  typographic punctuation, whitespace and case folded) or its slug (raw,
 *  percent-encoded or percent-decoded - a non-Latin slug is printed either
 *  way)? Bounded read - an article page is never megabytes, and a runaway
 *  body must not sit in a job's memory.
 *
 *  A client-rendered site ships neither in its HTML. For those, `probe`
 *  (the page's own URL and fetch scope) lets a 200 count when the body
 *  differs from what a random path on the same origin returns - the
 *  servesOwnBlog trick in hosted-rewrite.ts: a catch-all shell answers both
 *  alike, a real route does not. */
export async function pageCarriesArticle(res: Response, title: string, slug: string, probe?: { url: string; scopeHost: string }): Promise<boolean> {
  let html: string;
  try {
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return false;
  }
  const fold = (t: string) =>
    t
      // Numeric entities first, so &#8217; and &#x2014; reach the folds below.
      .replace(/&#(\d+);/g, (m, d: string) => codePoint(Number(d)) ?? m)
      .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => codePoint(parseInt(h, 16)) ?? m)
      .replace(/&amp;/gi, "&")
      .replace(/&(#39|#x27|apos|rsquo|lsquo);/gi, "'")
      .replace(/&(quot|ldquo|rdquo|#34);/gi, '"')
      .replace(/&(ndash|mdash);/gi, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\s+/g, " ")
      .toLowerCase();
  const page = fold(html);
  const t = fold(title).trim();
  if (t.length >= 8 && page.includes(t)) return true;
  // Themes truncate long titles in <title>; the first 40 characters of the
  // headline are still unmistakable.
  if (t.length > 40 && page.includes(t.slice(0, 40))) return true;
  if (slug && slug.length >= 4) {
    const s = slug.toLowerCase();
    if (page.includes(s) || page.includes(encodeURIComponent(slug).toLowerCase())) return true;
    let decoded = page;
    try {
      decoded = decodeURI(page);
    } catch {
      // A stray "%" that is not an escape: the raw comparisons above stand.
    }
    if (decoded !== page && decoded.includes(s)) return true;
  }
  if (!probe) return false;
  const other = await fetchProjectUrl(`${new URL(probe.url).origin}/dispatchseo-probe-${randomBytes(6).toString("hex")}`, probe.scopeHost, {
    timeoutMs: 8_000,
    userAgent: "Mozilla/5.0 (compatible; DispatchSEO/1.0; +https://dispatchseo.com)",
  });
  if (other && other.status === 200) {
    const otherBody = await other.text().catch(() => "");
    // Same status and a body within 10% of the same length is a catch-all
    // shell, not this article's route (hosted-rewrite.ts servesOwnBlog).
    const a = html.length;
    const b = otherBody.length;
    if (Math.abs(a - b) <= Math.max(a, b) * 0.1) return false;
  }
  // The pages row has no note column, so the log carries how this one was
  // judged live.
  console.warn(`[verify] liveness: probe-compared for ${probe.url} (neither title nor slug in the HTML)`);
  return true;
}

function codePoint(n: number): string | null {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null;
}

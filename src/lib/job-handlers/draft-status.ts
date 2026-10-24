import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { publishTarget, type Project } from "@/lib/projects";
import { isCloudMode } from "@/lib/cloud";
import { instanceTokenAllowedFor } from "@/lib/github";

// The `blocked_setup` draft status, and the one rule that decides when a draft
// earns it.
//
// STATUS VOCABULARY (migration 0055 documents the rest):
//   submitted     their AI handed it in and it passed the gate
//   rejected      it failed the gate; the reasons are in `validation`
//   accepted      we rendered it; it is queued to go out
//   blocked_setup we rendered it, but this site has nowhere to publish it yet
//   finished      posted to WordPress, or pull request opened in the repo, not
//                 yet confirmed live (the hosted route skips this: our own
//                 page is live the moment it is written)
//   published     confirmed live by the verify job
//   discarded     the owner threw it away
//
// WHY THIS EXISTS. Onboarding deliberately leaves a project half-set-up: the
// owner can have their agent write an article before they have connected
// anywhere to publish it. If the finish or publish handler threw for that, a
// normal state in the middle of setup would burn five retries, turn the jobs
// cron red, put a banner on the dashboard and email the owner - for something
// that is not broken and that only they can complete. So a draft that has
// nowhere to go stops here quietly and shows up as a setup card instead.
//
// The line this must never cross: a connection that HAS worked and now fails
// is a regression and stays loud. That split is made by the callers, and it
// hangs on one fact - whether a credential was ever stored - not on whether
// the current attempt worked.
//
// NO REASON IS STORED WITH THE ROW, on purpose. The reason is always derivable
// from the project's connection state, and a stored one goes stale the moment
// the owner fixes it: a draft blocked yesterday for "no WordPress" would still
// say so today, after they connected. `blockedReason` recomputes it instead.

/** Park a draft that has nowhere to publish. The job that called this must
 *  then complete normally - this is a state, not a failure. */
export async function markBlockedSetup(draftId: string, extra: Record<string, unknown> = {}) {
  await db()
    .from("article_drafts")
    .update({ status: "blocked_setup", updated_at: new Date().toISOString(), ...extra })
    .eq("id", draftId);
}

/**
 * Where a finished article for this project should go, or why it cannot go
 * anywhere yet. Shared by the finish and publish handlers so the two can never
 * disagree about whether a project is set up.
 */
export function publishRoute(project: Project): "wordpress" | "repo" | "manual" | "hosted" | "blocked" {
  const target = publishTarget(project);
  // Deliberate terminal state, not a gap: this owner asked us to finish the
  // article and hand it over, and has nowhere for us to post it.
  if (target === "manual") return "manual";
  // We serve the blog ourselves (src/lib/hosted-blog.ts); nothing to connect,
  // so this route can never be blocked. Whether the site's /blog forwards to
  // us yet is a setup card, not a publishing precondition - the pages exist
  // on our side either way.
  if (target === "hosted") return "hosted";
  if (target === "wordpress") {
    // A target of wordpress with no credential ever stored means the owner
    // pointed us at WordPress and has not connected it yet (or disconnected).
    return project.wp_app_password ? "wordpress" : "blocked";
  }
  // Not WordPress. A repo project publishes through pull requests our server
  // opens (publish-repo.ts) - but only with a credential that is verifiably
  // THIS tenant's. On cloud that means the GitHub App installation bound to
  // the project (whose token GitHub itself scopes to the installed repos); the
  // instance PAT is reserved for the operator's own allowlisted projects. A
  // repo named with neither is not connected yet, whatever the column says.
  if (project.github_repo) {
    if (isCloudMode() && !project.github_installation_id && !instanceTokenAllowedFor(project)) {
      return "blocked";
    }
    return "repo";
  }
  // No repo, no WordPress, not manual: mid-setup, with nowhere to publish.
  return "blocked";
}

/** The owner-facing sentence for a blocked draft, computed fresh every time it
 *  is shown. Used by the drafts screen and the MCP read tools. */
export function blockedReason(project: Project): string {
  if (publishTarget(project) === "hosted") {
    // The hosted route cannot park a draft (nothing to connect); a blocked
    // draft here predates the switch and just needs its publish job.
    return "This article was parked before your blog moved to DispatchSEO hosting. Press Publish now and it goes out.";
  }
  if (publishTarget(project) === "wordpress") {
    if (!project.wp_app_password) {
      return "Connect your WordPress site on the Settings screen and this article goes out on its own.";
    }
    // Connected, and a draft still parked: the only setup state left on this
    // route is the connected user's role. WordPress said so at publish time
    // (rest_cannot_publish), whatever the capabilities we cached at connect
    // time claim - roles change after connect, so the live answer wins.
    return "Your WordPress site is connected, but the user you connected cannot publish posts. In WordPress, give that user the Editor role, then press Publish now here.";
  }
  if (publishTarget(project) === "github" && project.github_repo) {
    // A repo named but no GitHub App behind it (cloud): the connection is not
    // finished, and a pull request cannot be opened on a promise.
    if (isCloudMode() && !project.github_installation_id && !instanceTokenAllowedFor(project)) {
      return "Install the DispatchSEO GitHub App for this site from Settings so we can open pull requests in its repo, then press Publish now here.";
    }
    // Self-host cannot tell synchronously whether a merge token is stored, so
    // the sentence names both things that can still be missing. On cloud with
    // the App in place only the folder question is left: we have the repo and
    // the credential but could not work out which folder holds the articles,
    // and that is a question only the owner can answer.
    if (!isCloudMode()) {
      return "We couldn't publish to your repo yet. Check that a GitHub token with write access is connected (Settings), tell us the folder your articles live in (Settings - Where your articles live), then press Publish now here.";
    }
    return "We couldn't work out where your site keeps its articles. Tell us the folder (for example content/blog) under Settings - Where your articles live - then press Publish now here.";
  }
  return "This site has nowhere to publish yet. Connect WordPress on the Settings screen, or connect a GitHub repo, and this article goes out on its own.";
}

/**
 * "Publish now", made true. Shared by the dashboard button and the
 * approve_draft MCP tool so the two can never disagree.
 *
 * The subtlety this exists for: the finish handler already queued a publish
 * job for this draft at the site's usual publishing hour, under the same
 * idempotency key. A plain enqueue() then returns null - the dedupe doing its
 * job - and the scheduled job keeps its scheduled hour, which turns the one
 * button that says "now" into a silent no-op in its commonest case. So when
 * the key is already held by a pending job, that job is pulled forward
 * instead.
 */
export async function publishDraftNow(projectId: string, draftId: string): Promise<void> {
  const job = await enqueue({
    projectId,
    kind: "publish",
    payload: { draftId },
    idempotencyKey: `publish:${draftId}`,
  });
  if (!job) {
    await db()
      .from("jobs")
      .update({ run_after: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("kind", "publish")
      .eq("idempotency_key", `publish:${draftId}`)
      .is("finished_at", null);
  }
}

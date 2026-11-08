import { db } from "./db";
import { isCloudMode } from "./cloud";
import { getSubscription, isActive, polarConfigured, type Subscription } from "./billing";
import { listInstallationRepos } from "./github-app";

// The third-site GitHub Actions cost gate.
//
// WHY IT EXISTS. Every site's automations run as GitHub Actions inside the
// owner's own repo, billed to the owner's own GitHub account - never to us,
// and never visible to us. GitHub's free allowance covers about two sites'
// worth of minutes. From the third, a private-repo owner who has left the
// default $0 spending limit in place does not get an invoice; GitHub simply
// PAUSES their workflows when the free minutes run out. Nothing publishes,
// nothing builds, and from inside the dashboard that is indistinguishable
// from DispatchSEO being broken. `githubQuotaAlert` (cron-alerts.ts) exists
// purely to guess at this after the fact, and its own comment admits the
// limitation: "we cannot see another account's billing page".
//
// So the honest fix is to ask BEFORE the third site exists, at the one moment
// the answer is actionable.
//
// WHAT THIS IS NOT. It is not a verification. There is no GitHub API we can
// call with an installation token to read someone's spending limit, so this
// records an informed choice, not a confirmed fact. That is worth building
// anyway: the failure mode it prevents is an owner who never knew the question
// existed, and a decision made deliberately is the whole point.
//
// The one branch we CAN verify is public repos - GitHub gives public
// repositories unlimited free Actions minutes, so an owner whose repos are all
// public has no problem to be warned about, and gets no interruption.

/** Adding a site takes the owner from N to N+1; the gate opens at the third. */
const FREE_SITES = 2;

export type GithubCostGate =
  | { required: false }
  | { required: true; siteCount: number };

export type AckReason = "billing" | "public_repos";

/**
 * Must this owner acknowledge the GitHub Actions cost before another site?
 *
 * False for: self-host (no plans at all), billing unconfigured, an inactive
 * subscription (planGate refuses the site anyway - two refusals for one action
 * is just confusing), an owner still inside the free two, and anyone who has
 * already answered. `ownedCount` is passed in because every caller already
 * has it and a second count query here would be pure waste.
 */
export async function githubCostGate(
  userId: string,
  ownedCount: number,
  // The subscription when the caller already read it (the layout does, for
  // the plan banner), so this costs no query of its own.
  known?: Subscription | null,
): Promise<GithubCostGate> {
  if (!isCloudMode() || !polarConfigured()) return { required: false };
  if (ownedCount < FREE_SITES) return { required: false };
  const sub = known !== undefined ? known : await getSubscription(userId);
  if (!isActive(sub)) return { required: false };
  // Column ABSENT (0048 not applied) is not the same as column null. Migrations
  // here are applied by hand, so a deploy can land first - and gating on a
  // column that cannot be written would put every owner on a step whose answer
  // has nowhere to go, i.e. an unpassable one. Absent = don't gate.
  if (!("github_cost_ack_at" in (sub as object))) return { required: false };
  if (sub!.github_cost_ack_at) return { required: false };
  return { required: true, siteCount: ownedCount };
}

/**
 * Record the owner's answer. Returns false if it did not land.
 *
 * REPORTS failure rather than swallowing it, which is the opposite of what this
 * did first, and the first version created a soft-lock. The write was
 * best-effort on the theory that a lost ack only costs one repeated question.
 * It doesn't: createProjectCore re-checks the gate on submit, so a swallowed
 * failure sent the owner past the step, through the whole form, and into
 * "please read the note about GitHub Actions costs and pick how you want to
 * handle it" - about the note they had just answered, with no way forward and
 * nothing on screen admitting anything had failed.
 *
 * Failing at the click is recoverable and honest. Failing at submit is a
 * dead end that looks like a lie.
 */
export async function recordGithubCostAck(userId: string, reason: AckReason): Promise<boolean> {
  const { error } = await db()
    .from("subscriptions")
    .update({
      github_cost_ack_at: new Date().toISOString(),
      github_cost_ack_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) {
    console.error(
      `[github-cost-gate] ack write failed for ${userId} (apply migration 0048?): ${error.message}`,
    );
    return false;
  }
  return true;
}

/** Tri-state on purpose - see below for why a boolean was wrong. */
export type RepoVisibility = "all_public" | "has_private" | "unknown";

/**
 * Are ALL of this owner's connected repos public?
 *
 * Public repositories get unlimited free Actions minutes, so for these owners
 * the whole warning is noise. This is the one branch of the cost step we can
 * check instead of taking on trust.
 *
 * THREE outcomes, not two. This returned a boolean first, and that collapsed
 * "we checked and found a private repo" together with "we could not check" -
 * a GitHub outage, a timeout, a revoked installation, or an owner who has not
 * connected a repo yet. The caller then told all of them the same thing:
 * "at least one is private". That is a claim about the customer's account
 * made from evidence we never had, and it is unfalsifiable from their side -
 * they look at two public repos and read a flat contradiction. "Unknown" gets
 * its own answer so the message can be honest about which happened.
 *
 * Both non-public outcomes still keep the step up. Failing toward INFORMING is
 * right for a cost warning; the difference is only what we say.
 *
 * Distinct installations are de-duplicated first: several sites on one GitHub
 * account share an installation id, and calling GitHub once per project would
 * pay for the same answer repeatedly.
 */
export async function repoVisibility(userId: string): Promise<RepoVisibility> {
  const { data, error } = await db()
    .from("projects")
    .select("github_installation_id")
    .eq("owner_user_id", userId);
  if (error || !data) return "unknown";
  const ids = [
    ...new Set(
      (data as Array<{ github_installation_id: number | null }>)
        .map((r) => r.github_installation_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  // Nothing connected to inspect - cannot prove public, cannot claim private.
  if (ids.length === 0) return "unknown";
  try {
    const lists = await Promise.all(ids.map((id) => listInstallationRepos(id)));
    const repos = lists.flat();
    if (repos.length === 0) return "unknown";
    return repos.every((r) => !r.private) ? "all_public" : "has_private";
  } catch {
    return "unknown";
  }
}

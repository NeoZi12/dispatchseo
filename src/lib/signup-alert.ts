import { db } from "./db";
import { isCloudMode } from "./cloud";
import { operatorUserIds } from "./autopilot/operator";

// "Someone just joined the free plan" - one email to the owner's own inbox
// (owner, 2026-11-09). Server-only, cloud-only, best-effort: a missing
// SIGNUP_ALERT_EMAIL, a Resend hiccup or a failed count never touches the
// signup itself, which has already happened by the time this runs.
//
// Deliberately NOT on the ALERT_EMAIL rail: that one is the cron failure
// rail, switched off on the cloud by design (cron-banner-policy), and a new
// customer is good news, not an alarm. Its own variable means it can be on
// while failures stay quiet.

export type FreeSignup = {
  ownerId: string;
  email: string | null;
  domain: string;
  projectId: string;
};

/** People on the free plan right now: distinct owners who passed the free
 *  launch gate (a free_claims domain row, lib/free-gate.ts), whose site
 *  still exists, and who have no active or trialing subscription. Launched
 *  sites with a lapsed trial are NOT on the free plan - the engine gives them
 *  nothing without a claim - so they stay out of the number. The operator's
 *  own accounts are left out too. Null when the count cannot be read - the
 *  email then says so rather than printing 0. */
export async function freePlanHeadcount(): Promise<number | null> {
  try {
    const [claims, projects, subs] = await Promise.all([
      db().from("free_claims").select("owner_user_id, project_id").eq("kind", "domain"),
      db().from("projects").select("id"),
      db().from("subscriptions").select("user_id").in("status", ["active", "trialing"]),
    ]);
    if (claims.error) throw new Error(claims.error.message);
    if (projects.error) throw new Error(projects.error.message);
    if (subs.error) throw new Error(subs.error.message);
    const live = new Set(((projects.data ?? []) as { id: string }[]).map((p) => p.id));
    const paying = new Set(((subs.data ?? []) as { user_id: string }[]).map((s) => s.user_id));
    const ops = new Set(operatorUserIds());
    const free = new Set<string>();
    for (const c of (claims.data ?? []) as { owner_user_id: string; project_id: string | null }[]) {
      if (!c.project_id || !live.has(c.project_id)) continue;
      if (paying.has(c.owner_user_id) || ops.has(c.owner_user_id)) continue;
      free.add(c.owner_user_id);
    }
    return free.size;
  } catch (e) {
    console.warn(`[signup-alert] free-plan headcount failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Email the owner that a site just launched on the free plan, with the
 *  running headcount. Returns whether an email went out. */
export async function notifyOwnerOfFreeSignup(signup: FreeSignup): Promise<boolean> {
  const to = process.env.SIGNUP_ALERT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey || !isCloudMode()) return false;
  // `||`: the same present-and-empty guard as cron-alerts.ts.
  const from = process.env.ALERT_EMAIL_FROM || process.env.CUSTOMER_EMAIL_FROM || "DispatchSEO <onboarding@resend.dev>";
  try {
    const count = await freePlanHeadcount();
    const headcount = count === null ? "couldn't be counted" : `${count} ${count === 1 ? "person" : "people"}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        // 📟: the nearest emoji to the walkie-talkie logo (there is no walkie-talkie emoji).
        subject: count === null ? `📟 New free site: ${signup.domain}` : `📟 New free site: ${signup.domain} (${count} on free)`,
        text:
          `A site just launched on the free plan.\n\n` +
          `Site: ${signup.domain}\n` +
          `Email: ${signup.email ?? "unknown"}\n` +
          `User: ${signup.ownerId}\n` +
          `Project: ${signup.projectId}\n\n` +
          `On the free plan now: ${headcount}.\n\n` +
          `Details on /owner.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[signup-alert] Resend ${res.status} for ${signup.domain}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[signup-alert] not sent for ${signup.domain}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

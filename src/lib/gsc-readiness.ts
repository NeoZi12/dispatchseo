import { db } from "./db";
import { gscAccessProbe } from "./gsc";

// The cron-side setup gate for everything GSC. Rule: an automation may only
// run against a project whose prerequisite is verifiably ready - incomplete
// setup is an informational skip, never an error/500/alert email. The
// hourly-gsc GitHub Action failing twice per mid-setup project per day (plus
// the alert email) is exactly the failure mode this exists to end: onboarding
// GUESSES `sc-domain:<domain>` for every new project, so "property saved but
// service account not granted yet" is the NORMAL state of every project
// whose owner hasn't finished the Connect Search Console step on Home.
//
// The loudness model the readiness split encodes:
//   never-worked  -> probe first; not granted = quiet skip. The Home setup
//                    card (needsGsc / gscWaiting on dashboard/page.tsx) is
//                    the user-facing surface for what's missing.
//   worked-before -> no probe, run straight; a failure now is a REGRESSION
//                    (revoked access, broken creds, wrong property edit) and
//                    stays loud through the normal banner + email rails.
// "Worked before" = any gsc_stats row exists for the project, which is also
// the exact signal the Home card uses to hide itself - card showing and
// automations paused are the same predicate, so the two can never disagree.

export type GscReadiness = { ready: true } | { ready: false; skipped: string };

export async function gscCronReadiness(
  projectId: string,
  site: string | null,
): Promise<GscReadiness> {
  if (!site) return { ready: false, skipped: "no GSC property connected" };

  const { count, error } = await db()
    .from("gsc_stats")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (!error && (count ?? 0) > 0) return { ready: true };

  const probe = await gscAccessProbe(site);
  if (probe.state === "ok") return { ready: true };
  // A probe error on a never-worked project also skips (with the detail kept
  // visible in the run log) - first-boot noise helps nobody, and an
  // instance-wide credential problem still alarms through any project that
  // HAS worked before.
  return {
    ready: false,
    skipped:
      probe.state === "pending"
        ? `setup incomplete: ${probe.why} - finish the Connect Search Console step on Home; automations stay paused until then`
        : `GSC probe failed: ${probe.why}`,
  };
}

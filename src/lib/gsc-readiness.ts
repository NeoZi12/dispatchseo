import { db } from "./db";
import { gscAccessProbe } from "./gsc";
import { isCloudMode } from "./cloud";
import { oauthListSites, setTrackedProperty } from "./gsc-oauth";

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

export async function gscCronReadiness(project: {
  id: string;
  domain?: string | null;
  gsc_site_url: string | null;
  gsc_oauth_refresh_token: string | null;
  owner_user_id?: string | null;
}): Promise<GscReadiness> {
  const { count, error } = await db()
    .from("gsc_stats")
    .select("*", { count: "exact", head: true })
    .eq("project_id", project.id);
  const workedBefore = !error && (count ?? 0) > 0;

  // Cloud connects GSC through per-project OAuth. The service-account probe
  // below is blind to that grant (cloud never grants the shared service
  // account), so OAuth projects get their own check.
  if (isCloudMode() && project.gsc_oauth_refresh_token) {
    // Synced before: run straight, and a failure now is a regression that
    // stays loud (revoked consent, property removed).
    if (workedBefore && project.gsc_site_url) return { ready: true };
    return oauthPropertyReadiness(project, project.gsc_oauth_refresh_token);
  }

  const site = project.gsc_site_url;
  if (!site) return { ready: false, skipped: "no GSC property connected" };
  if (workedBefore) return { ready: true };

  // Cloud tenant that has never had GSC data and holds no OAuth token: stop
  // here. Falling through to the probe would test the property with the shared
  // PLATFORM service account - which is both the wrong credential (a cloud
  // customer never grants it) and an access oracle: gsc_site_url is
  // tenant-writable, so a customer could probe arbitrary properties and learn
  // which ones the operator's service account can read. Deliberately placed
  // AFTER the rows-exist check, so a project that HAS synced before and now
  // fails still counts as a regression and stays loud (CLAUDE.md's readiness
  // split), rather than being downgraded to a quiet skip.
  if (isCloudMode() && project.owner_user_id) {
    return {
      ready: false,
      skipped:
        "setup incomplete: connect Google Search Console for this project - automations stay paused until then",
    };
  }

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

// A Google login is not the same thing as access to the tracked property.
// The pre-November onboarding saved a GUESSED `sc-domain:<domain>` on every
// project, and the owner's Google account often holds the site as a
// URL-prefix property instead, or not at all. Trusting the login alone sent
// that never-worked project into the crons, where every run failed with
// "User does not have sufficient permission" and lit the red banner for six
// days (privatetutoringbali, 2026-11) - a failure no owner can act on, about
// a step the hosted Home already asks for with its Connect Search Console
// button. So before the first sync, ask Google which properties this login
// can read: keep the tracked one if it's there, adopt the site's real
// property if the guess was wrong, and otherwise skip quietly. Same idea as
// the launch job's property step; this one also repairs projects created
// before that job existed.
async function oauthPropertyReadiness(
  project: { id: string; domain?: string | null; gsc_site_url: string | null },
  refreshToken: string,
): Promise<GscReadiness> {
  let readable: string[];
  try {
    readable = (await oauthListSites(refreshToken))
      .filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser")
      .map((s) => s.siteUrl);
  } catch (e) {
    return {
      ready: false,
      skipped: `setup incomplete: could not read the connected Google account's Search Console properties (${e instanceof Error ? e.message : String(e)}) - reconnect Google on the dashboard; automations stay paused until then`,
    };
  }

  if (project.gsc_site_url && readable.includes(project.gsc_site_url)) return { ready: true };

  const found = propertyCandidates(project.domain).find((c) => readable.includes(c));
  if (found) {
    const err = await setTrackedProperty(project.id, found);
    if (!err) {
      // Callers read gsc_site_url off the same object right after this gate.
      project.gsc_site_url = found;
      return { ready: true };
    }
  }

  return {
    ready: false,
    skipped: `setup incomplete: the connected Google account can't read ${project.gsc_site_url ?? project.domain ?? "this site"} in Search Console - finish the Connect Search Console step on the dashboard; automations stay paused until then`,
  };
}

/** The forms Search Console names a site's property with, domain first. */
function propertyCandidates(domain: string | null | undefined): string[] {
  const host = (domain ?? "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
  if (!host) return [];
  return [`sc-domain:${host}`, `https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`];
}

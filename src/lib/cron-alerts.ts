import { db } from "./db";
import { isTransientErrorMessage } from "./dataforseo";
import { isCloudMode } from "./cloud";

// Cron failure alerts (LATER.md gap A4). Every cron route calls
// reportCronRun() with its result JSON right before responding; this module
// logs the run to cron_runs (migration 0020), and on a failed run emails the
// owner through Resend - debounced per job (24h for scheduled crons, so an
// hourly cron that stays broken sends one email, not twenty-four; none for
// deploy-check, where each run is a distinct human push). Failures that are
// purely transient vendor errors (see TRANSIENT_MARKER in dataforseo.ts)
// additionally need two consecutive failed runs before the first email. The post-deploy
// smoke test (deploy-check route + .github/workflows/deploy-check.yml) rides
// the same rails: same run log, same banner, same email.
//
// Email is optional: without RESEND_API_KEY + ALERT_EMAIL the run log still
// works and the dashboard banner / get_cron_health tool carry the alert.
// Everything here is best-effort - a logging failure must never fail the
// cron itself.

// The three backend crons plus deploy-check report from inside their route
// handlers; the SEO GitHub workflows and the secrets canary phone their
// outcomes home through the deploy-check route's report mode - the job
// column is free text, so any reporter gets banner + email coverage.
export type CronJob =
  | "daily-ranks"
  | "hourly-gsc"
  | "weekly-opportunities"
  | "deploy-check";

// How long after the last run a job counts as "not running" - generous
// enough that scheduler jitter (Vercel Hobby ~1h, GitHub Actions delays)
// never false-alarms. Jobs that run per push or per dispatch (deploy-check,
// trend scans, tool validations) have no schedule to be late against, so
// anything not listed here defaults to never-stale.
const STALE_HOURS: Record<string, number> = {
  "daily-ranks": 36,
  "hourly-gsc": 6,
  "seo-daily": 36,
  "seo-auto-merge": 6, // hourly backstop schedule
  "seo-tools": 9 * 24, // Wednesdays
  "seo-geo-scan": 9 * 24, // Wednesdays, same buffer as the other weeklies
  "seo-weekly-research": 9 * 24,
  "secrets-canary": 24, // every 6h - a silent canary is itself an alarm
  // Daily per-repo health check (04:30 UTC). Its silence IS the signal that
  // a repo's schedules stopped running (dead repo, GitHub's 60-day
  // inactivity disable) - the one failure mode a workflow can never report
  // itself, only the absence of its heartbeat can.
  "seo-token-check": 30,
  "seo-pipeline-version": 30,
};

// Jobs reported through a per-project MCP token arrive suffixed with the
// project slug ("seo-daily--acme"). Staleness thresholds are keyed by the
// bare job name; strip the suffix before the lookup or every tenant job
// would silently default to never-stale.
function baseJobName(job: string): string {
  const i = job.indexOf("--");
  return i === -1 ? job : job.slice(0, i);
}

// "Pipeline update available" is NEWS, not a failure. The repo-side health
// check has only one reporting channel (ok/fail), so it reports a stale pack
// version through fail= - but a pending update is the normal state every
// connected repo enters the moment the backend ships a new pack. Classify it
// here so it surfaces as a quiet update notice (no red banner, no email,
// no "agent needs attention"), while a real seo-pipeline-version failure
// (rejected key, curl death) stays loud. Loudness is for regressions.
export function isPipelineUpdateNotice(job: string, errors: string[]): boolean {
  return (
    baseJobName(job) === "seo-pipeline-version" &&
    errors.length > 0 &&
    errors.every((e) => e.includes("pipeline update available"))
  );
}

// Boot-aware staleness clock for self-hosted installs. A laptop that was
// asleep at 04:00 wakes up with jobs that are LATE, not broken - and even
// GitHub-side runs that fired while the backend slept had their reports
// lost, not never sent. On docker the app is one long-lived process, so
// "time since this process started" is exactly "time since the machine
// came back": staleness only accrues while the stack is actually up, and
// a job is flagged only when a full window passes with the app running
// and still no run - a real scheduler fault, worth being loud about.
// Cloud stays on wall clock: Vercel never sleeps, and its lambdas restart
// far too often for a process clock to mean anything there.
const PROCESS_STARTED_AT = Date.now();
const IS_DOCKER_STACK = Boolean(process.env.POSTGREST_URL);
function staleAgeHours(lastRunAtMs: number): number {
  const wallHours = (Date.now() - lastRunAtMs) / 3600000;
  if (!IS_DOCKER_STACK) return wallHours;
  return Math.min(wallHours, (Date.now() - PROCESS_STARTED_AT) / 3600000);
}

// The project slug a reported job belongs to, or null for instance-wide
// jobs (backend crons, deploy-check, the dogfood repo reporting with
// CRON_SECRET before it switched to its project key).
export function jobProjectSlug(job: string): string | null {
  const i = job.indexOf("--");
  return i === -1 ? null : job.slice(i + 2);
}

// Email debounce window per job. Scheduled jobs that stay broken retry on
// their own, so one email per day is enough; a deploy-check run only happens
// because a human pushed, so every failure is a distinct event and gets its
// own email. Everything else (reported workflows) defaults to 6h - frequent
// runners like seo-auto-merge must not send an email per failing run.
const DEBOUNCE_HOURS: Record<string, number> = {
  "daily-ranks": 24,
  "hourly-gsc": 24,
  "weekly-opportunities": 24,
  "deploy-check": 0,
};
const DEFAULT_DEBOUNCE_HOURS = 6;

export type CronHealth = {
  job: string;
  ok: boolean;
  stale: boolean;
  last_run_at: string;
  errors: string[];
  // A failed row that is really the "pipeline update available" report (see
  // isPipelineUpdateNotice): dashboards and MCP consumers render it as an
  // informational update notice instead of a job failure.
  update_available: boolean;
};

// Pull the human-readable error strings out of a cron's result JSON: any
// "error" string and any non-empty "failed" string array, prefixed with the
// path (usually the project slug) so multi-project runs stay attributable.
export function collectErrors(value: unknown, path = ""): string[] {
  if (value == null || typeof value !== "object") return [];
  const out: string[] = [];
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const at = path ? `${path}.${key}` : key;
    if (key === "error" && typeof val === "string") {
      out.push(path ? `${path}: ${val}` : val);
    } else if (key === "failed" && Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") out.push(path ? `${path}: ${item}` : item);
      }
    } else if (val && typeof val === "object") {
      out.push(...collectErrors(val, at));
    }
  }
  return out;
}

async function sendFailureEmail(job: string, errors: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return false;
  const from = process.env.ALERT_EMAIL_FROM ?? "DispatchSEO <onboarding@resend.dev>";
  const list = errors.slice(0, 20).map((e) => `- ${e}`).join("\n");
  const isDeploy = job === "deploy-check";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: isDeploy
        ? "DispatchSEO deploy check failed"
        : `DispatchSEO job failed: ${job}`,
      text:
        (isDeploy
          ? `The post-deploy smoke test just failed - the code that went live is broken.\n\n`
          : `The ${job} job just failed.\n\n`) +
        `${list || "(no error detail captured)"}\n\n` +
        `Latest runs show on the dashboard Home banner; full logs are in ` +
        `your Vercel function logs or the job's GitHub Actions run. While a ` +
        `job keeps failing its emails are debounced, so you may not get one ` +
        `per failure - the banner always shows the latest state.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// Cloud bundle: the project owner behind a per-tenant job (job names carry the
// slug, e.g. seo-daily--acme), resolved to their account email so a hands-off
// CUSTOMER is alerted when their own automation breaks - the cloud answer to
// self-host's BYO email. Cloud only: db() is the supabase-js service client
// there (auth.admin available); self-host's single owner IS the operator.
async function ownerContactForJob(
  job: string,
): Promise<{ email: string; domain: string | null } | null> {
  const slug = jobProjectSlug(job);
  if (!slug) return null;
  try {
    const { data: proj } = await db()
      .from("projects")
      .select("owner_user_id, domain")
      .eq("slug", slug)
      .maybeSingle();
    const ownerId = (proj as { owner_user_id?: string | null } | null)?.owner_user_id;
    if (!ownerId) return null;
    const { data } = await db().auth.admin.getUserById(ownerId);
    const email = data?.user?.email;
    return email
      ? { email, domain: (proj as { domain?: string | null }).domain ?? null }
      : null;
  } catch {
    return null;
  }
}

// The customer-facing failure alert: friendlier than the operator's ALERT_EMAIL
// copy (no Vercel/Actions internals), pointing at their own dashboard.
async function sendCustomerFailureEmail(
  to: string,
  domain: string | null,
  job: string,
  errors: string[],
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.ALERT_EMAIL_FROM ?? "DispatchSEO <onboarding@resend.dev>";
  const site = domain ?? "your site";
  // Strip the "slug: " prefix collectErrors adds, for a clean customer line.
  const list = errors
    .slice(0, 8)
    .map((e) => `- ${e.replace(/^[^:]+:\s*/, "")}`)
    .join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `DispatchSEO: a job needs attention on ${site}`,
      text:
        `Heads up - one of the automated jobs for ${site} (${baseJobName(job)}) just failed, ` +
        `so it may have paused.\n\n${list || "(no detail captured)"}\n\n` +
        `Most issues clear on their own on the next scheduled run. Open your DispatchSEO ` +
        `dashboard for the latest status - if it keeps failing, just reply to this email.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// The one call every cron route makes. Never throws.
export async function reportCronRun(
  job: string,
  result: Record<string, unknown>,
  hadError: boolean,
): Promise<void> {
  try {
    const errors = hadError ? collectErrors(result) : [];
    let emailedAt: string | null = null;

    // Update notices log as failed rows (so they surface and mark_cron_fixed
    // works) but never email - "a newer pack exists" is not worth waking the
    // owner, and it would fire for EVERY connected repo of EVERY user on the
    // morning after any backend deploy that touches the pack.
    if (hadError && !isPipelineUpdateNotice(job, errors)) {
      // Transient vendor blips (tagged by dataforseo.ts / serp.ts AFTER
      // their in-call retries already failed) get one grace run: the run
      // still logs as failed and the banner shows it immediately, but the
      // email only goes out if the previous run of this job also failed -
      // a sustained outage wakes the owner, a one-off SERP hiccup doesn't.
      // Any untagged error in the mix (creds, balance, our own bugs) keeps
      // emailing on the first failure, as before.
      let persistedAcrossRuns = true;
      if (errors.length > 0 && errors.every(isTransientErrorMessage)) {
        const { data: prev } = await db()
          .from("cron_runs")
          .select("ok")
          .eq("job", job)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        persistedAcrossRuns = prev != null && !prev.ok;
      }

      // Debounce: skip the email if this job already emailed inside its
      // window (a zero-hour window means every failure emails).
      const hours = DEBOUNCE_HOURS[job] ?? DEFAULT_DEBOUNCE_HOURS;
      let alreadyEmailed = false;
      if (hours > 0) {
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const { data: recent } = await db()
          .from("cron_runs")
          .select("id")
          .eq("job", job)
          .not("emailed_at", "is", null)
          .gte("emailed_at", since)
          .limit(1);
        alreadyEmailed = Boolean(recent && recent.length > 0);
      }
      if (!alreadyEmailed && persistedAcrossRuns) {
        let sent = false;
        try {
          if (await sendFailureEmail(job, errors)) sent = true;
        } catch (e) {
          console.error(`[cron-alerts] ${job} operator failure email failed:`, e);
        }
        // Cloud bundle: also alert the CUSTOMER (project owner's account email,
        // from our Resend) so a hands-off owner hears their own job broke
        // without setting up any email of their own. Per-tenant debounce comes
        // free - the job name carries the slug, so cron_runs.emailed_at is
        // already per-tenant.
        if (isCloudMode()) {
          try {
            const owner = await ownerContactForJob(job);
            if (owner && (await sendCustomerFailureEmail(owner.email, owner.domain, job, errors))) {
              sent = true;
            }
          } catch (e) {
            console.error(`[cron-alerts] ${job} customer failure email failed:`, e);
          }
        }
        if (sent) emailedAt = new Date().toISOString();
      }
    }

    const { error } = await db().from("cron_runs").insert({
      job,
      ok: !hadError,
      errors,
      emailed_at: emailedAt,
    });
    // Tolerate a missing table (migration 0020 not applied yet) - same
    // posture as projects.ts / site-profile.ts.
    if (error) console.error(`[cron-alerts] ${job} run log insert failed:`, error.message);
  } catch (e) {
    console.error(`[cron-alerts] ${job} reporting failed:`, e);
  }
}

// "Mark as fixed" - shared by the Home banner button and the mark_cron_fixed
// MCP tool. Logs a synthetic ok run for the job, which clears both alert
// shapes at once: a failed latest run (the ok row is now the latest) and an
// overdue job (last_run_at resets). Honest by construction: it only accepts
// a job that currently alerts for the caller's scope, and if the underlying
// problem wasn't really fixed the next failed run or missed window re-raises
// the banner on its own.
export async function markCronFixed(job: string, projectSlug?: string): Promise<void> {
  const health = await getCronHealth(projectSlug);
  const issue = health.find((h) => h.job === job && (!h.ok || h.stale));
  if (!issue) {
    throw new Error(
      `no active alert for "${job}" - use the exact job name shown by get_cron_health / the Home banner`,
    );
  }
  const { error } = await db().from("cron_runs").insert({
    job,
    ok: true,
    // Banner and emails only surface errors on failed rows, so this note is
    // pure audit trail: it distinguishes a manual clear from a real run.
    errors: ["marked as fixed manually - awaiting the next real run"],
  });
  if (error) throw new Error(`could not mark ${job} fixed: ${error.message}`);
}

// Latest run per job, for the dashboard banner and the get_cron_health MCP
// tool. A job that has never run is absent (a fresh install has nothing to
// alert about - the setup cards own "crons not installed yet"), EXCEPT the
// pipeline heartbeat below, which exists precisely to catch "installed but
// never managed to report".
//
// projectSlug scoping: pass a slug to see only that project's world -
// instance-wide jobs (backend crons cover every project) plus jobs suffixed
// --<that slug>. This is the MCP boundary's contract: a project token must
// never see a sibling project's job names or failure text. Omit the slug
// for the owner's all-projects dashboard view.
export async function getCronHealth(projectSlug?: string): Promise<CronHealth[]> {
  const { data, error } = await db()
    .from("cron_runs")
    .select("job, ok, errors, created_at")
    // 500 rows ≈ a week+ even with seo-auto-merge reporting every run -
    // wide enough that a sparse job's latest row (deploy-check only logs on
    // pushes) stays inside the window while frequent jobs pile rows on top.
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return []; // missing table = no alerts, not a crash
  // cron_runs is keyed by the SLUG-based job name, not project_id, so a deleted-
  // and-recreated project (or any slug reuse) would otherwise inherit the prior
  // project's stale history and show a false "job hasn't run since <old date>"
  // alert. Ignore any of THIS project's rows from before it was created - they
  // can't belong to it. Instance-wide jobs (owner null) are never filtered.
  let projectSince = 0;
  if (projectSlug) {
    const { data: proj } = await db()
      .from("projects")
      .select("created_at")
      .eq("slug", projectSlug)
      .maybeSingle();
    const c = (proj as { created_at?: string } | null)?.created_at;
    if (c) projectSince = new Date(c).getTime();
  }
  const latest = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    const owner = jobProjectSlug(row.job as string);
    if (
      projectSlug &&
      owner === projectSlug &&
      new Date(row.created_at as string).getTime() < projectSince
    ) {
      continue;
    }
    if (!latest.has(row.job as string)) latest.set(row.job as string, row);
  }
  const health = [...latest.values()]
    .filter((row) => {
      if (!projectSlug) return true;
      const owner = jobProjectSlug(row.job as string);
      return owner === null || owner === projectSlug;
    })
    // Legacy-identity suppression: a repo that switches its reporting auth
    // from CRON_SECRET to its project token (the install/update flow does
    // this) leaves its old BARE job name behind; that abandoned row would
    // sit "stale" on the banner for days until it ages out of the window
    // (bit us 2026-07-20 with seo-auto-merge vs seo-auto-merge--clockedcode).
    // If any suffixed sibling reported more recently, the bare identity is
    // retired, not late - drop it. Backend crons have no suffixed siblings
    // and are unaffected.
    .filter((row, _i, all) => {
      const job = row.job as string;
      if (jobProjectSlug(job) !== null) return true;
      return !all.some(
        (s) =>
          (s.job as string).startsWith(`${job}--`) &&
          (s.created_at as string) > (row.created_at as string),
      );
    })
    .map((row) => {
      const job = row.job as string;
      const errors = (row.errors as string[]) ?? [];
      const ageHours = staleAgeHours(new Date(row.created_at as string).getTime());
      return {
        job,
        ok: Boolean(row.ok),
        // Unlisted jobs run per push/dispatch - no schedule, never stale.
        stale: ageHours > (STALE_HOURS[baseJobName(job)] ?? Infinity),
        last_run_at: row.created_at as string,
        errors,
        update_available: !row.ok && isPipelineUpdateNotice(job, errors),
      };
    });
  const heartbeat = await pipelineHeartbeatAlerts(
    projectSlug,
    new Set(health.map((h) => h.job)),
  );
  return [...health, ...heartbeat];
}

// The window above can only alarm about jobs with a row INSIDE it - a
// connected repo whose reporting NEVER worked (rotted secret from day one)
// or died long ago is invisible to it. That exact hole hid clockedcode's
// dead reporting rail for days (2026-07-20 audit: workflows ran green on
// GitHub while phoning nothing home, so "silence IS the signal" never got
// a first row to go silent FROM). Fix: for every project wired to a repo,
// check the daily seo-token-check heartbeat with a targeted, window-
// independent query. No row ever -> "installed but never reported" (secrets
// are likely wrong); latest row past the staleness threshold but aged out
// of the window -> the stale alert the window would have shown. Best-effort
// like everything here - any query error just means no extra alerts.
async function pipelineHeartbeatAlerts(
  projectSlug: string | undefined,
  alreadyReported: Set<string>,
): Promise<CronHealth[]> {
  try {
    // Localhost installs: GitHub's runners can never reach this backend,
    // so repo workflows physically cannot report - their silence is
    // geometry, not rotted secrets, and the in-stack builder does the
    // building anyway. Telling those owners to "re-run the setup command"
    // forever would be a false alarm on every localhost install.
    if (IS_DOCKER_STACK) {
      const appUrl = process.env.APP_URL ?? "";
      if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) return [];
    }
    const { data: projects, error } = await db()
      .from("projects")
      .select("id, slug, github_repo, pipeline_installed_at");
    if (error || !projects) return [];
    const out: CronHealth[] = [];
    for (const p of projects) {
      if (projectSlug && p.slug !== projectSlug) continue;
      if (!p.github_repo) continue; // nothing installable, nothing to expect
      const job = `seo-token-check--${p.slug}`;
      if (alreadyReported.has(job)) continue; // window already covers it
      // Wired = the install stamp, or a conventions row for installs that
      // predate migration 0018 - the same signals the Home install card uses.
      // Track WHEN it was wired: the grace window below needs a clock even
      // while the install stamp is still null. Setup writes the conventions
      // row BEFORE mark_pipeline_installed stamps, so there's a normal
      // mid-setup window where a project is conventions-wired but unstamped -
      // without a grace clock there, the "never reported" alarm false-fires
      // during setup (exactly when we invite the owner to look around).
      let wiredAt: string | null = (p.pipeline_installed_at as string | null) ?? null;
      if (wiredAt == null) {
        const { data: conv, error: convErr } = await db()
          .from("conventions")
          .select("updated_at")
          .eq("project_id", p.id)
          .maybeSingle();
        if (convErr || conv == null) continue;
        wiredAt = (conv.updated_at as string | null) ?? null;
      }
      // A fresh install's first daily heartbeat can be up to ~28h away
      // (04:30 UTC schedule); give it 48h from whenever the pipeline was wired
      // (install stamp, else the conventions row) before "never reported"
      // alarms. A null wiredAt can't be aged - treat it as too fresh to alarm.
      if (wiredAt == null || Date.now() - new Date(wiredAt).getTime() < 48 * 3600_000) {
        continue;
      }
      const { data: hb, error: hbErr } = await db()
        .from("cron_runs")
        .select("ok, created_at")
        .eq("job", job)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hbErr) continue;
      if (!hb) {
        out.push({
          job,
          ok: false,
          stale: true,
          last_run_at: (p.pipeline_installed_at as string | null) ?? new Date(0).toISOString(),
          errors: [
            "pipeline is installed but its workflows have never reported to the dashboard - the repo's secrets are likely wrong; re-run the setup command from Home to fix them",
          ],
          update_available: false,
        });
      } else {
        const ageHours = staleAgeHours(new Date(hb.created_at as string).getTime());
        if (ageHours > (STALE_HOURS["seo-token-check"] ?? Infinity)) {
          out.push({
            job,
            ok: Boolean(hb.ok),
            stale: true,
            last_run_at: hb.created_at as string,
            errors: [],
            update_available: false,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

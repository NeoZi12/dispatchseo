import { db } from "./db";
import { isCloudMode, isLocalBackendUrl } from "./cloud";
import { listProjects, effectiveAutomations } from "./projects";
import { projectAgent } from "./agents";
import { planPausedProjectSlugs } from "./billing";

// Cron failure alerts (LATER.md gap A4). Every cron route calls
// reportCronRun() with its result JSON right before responding; this module
// logs the run to cron_runs (migration 0020), and on a failed run emails the
// owner through Resend - debounced per job (24h for scheduled crons, so an
// hourly cron that stays broken sends one email, not twenty-four; none for
// deploy-check, where each run is a distinct human push). Cloud's customer
// emails carry a second, cross-job debounce keyed on the CAUSE - see
// customerCauseEmailedRecently. Every non-URGENT failure (see
// isUrgentCronFailure) additionally needs two consecutive failed runs before
// the first email - the same persistence bar the Home banner applies through
// criticalCronIssues, so the two rails always tell one story. The post-deploy
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
  | "serp-collect"
  | "jobs"
  | "weekly-opportunities"
  | "deploy-check";

// How long after the last run a job counts as "not running" - generous
// enough that scheduler jitter (Vercel Hobby ~1h, GitHub Actions delays)
// never false-alarms. Jobs that run per push or per dispatch (deploy-check,
// trend scans, tool validations) have no schedule to be late against, so
// anything not listed here defaults to never-stale. (weekly-opportunities has
// no entry here on purpose - see RETIRED_JOBS below.)
const STALE_HOURS: Record<string, number> = {
  "daily-ranks": 36,
  // The article queue drain, scheduled every 10 minutes in both
  // .github/workflows/jobs.yml and docker/cron/crontab. Idle ticks report as
  // claim-only, so this clock is only ever advanced by a tick that actually
  // processed something - which means the threshold has to tolerate a genuinely
  // quiet queue. 6h is far longer than any real gap between a crawl, a finish
  // and a publish on an active project, and short enough that a wedged drain
  // is noticed the same working day.
  jobs: 6,
  // The backend's own SEO scheduler (api/cron/seo-dispatch), every 3h. It is
  // now the thing that WAKES every connected repo's builders, so its silence is
  // the highest-leverage failure in the pipeline: no dispatcher, no builds
  // anywhere, on any project. 10h is ~3x its cadence, the same margin
  // hourly-gsc gets. The per-project claim rows catch the narrower case of a
  // dispatch that went out and woke nothing.
  "seo-dispatch": 10,
  // Named "hourly" but scheduled every 3 HOURS (`7 */3 * * *` in both
  // .github/workflows/hourly-gsc.yml and docker/cron/crontab). At 6h that was
  // only 2x the cadence, and GitHub Actions routinely defers scheduled runs and
  // sometimes drops one outright - a single skipped tick plus normal jitter was
  // enough to show "hourly-gsc is overdue" on Home and flip the agent pill red
  // with nothing actually wrong. 10h is ~3x the real cadence, matching the
  // safety margin serp-collect gets over its hourly schedule.
  "hourly-gsc": 10,
  // Hourly (GH Actions). If it stalls, queued SERP tasks pile up uncollected
  // and rank charts silently freeze - 4h catches that the same morning.
  "serp-collect": 4,
  "seo-daily": 36,
  // Backstop schedule is every 6h (`17 */6 * * *`), cut back from hourly
  // because that job bills a full GitHub-Actions minute per sweep and spent
  // ~300 min/month of an installed repo's quota finding nothing to merge.
  // 20h is ~3.3x the cadence - the same safety margin hourly-gsc gets, and in
  // the range secrets-canary uses for its identical 6h schedule (24h) - so a
  // deferred or dropped tick doesn't flip Home red with nothing actually wrong.
  // Merging itself is event-driven and does not depend on this schedule.
  "seo-auto-merge": 20,
  "seo-tools": 8 * 24, // Wednesdays, 1-day buffer over the weekly cadence
  "seo-geo-scan": 8 * 24, // Wednesdays, same buffer as the other weeklies
  "seo-weekly-research": 8 * 24, // Mondays, same buffer as the other weeklies
  "secrets-canary": 24, // every 6h - a silent canary is itself an alarm
  // Daily per-repo health check (04:30 UTC). Its silence IS the signal that
  // a repo's schedules stopped running (dead repo, GitHub's 60-day
  // inactivity disable) - the one failure mode a workflow can never report
  // itself, only the absence of its heartbeat can.
  "seo-token-check": 30,
  "seo-pipeline-version": 30,
  // The self-hosted in-stack builder's own jobs (/api/builder/jobs) never had
  // ANY staleness coverage - a permanently stuck builder-research/geo-scan job
  // (the exact class of the 2026-07-27 incident) read as "ok: true, stale:
  // false" on the Home banner and get_cron_health forever. research/geo-scan
  // run unconditionally on every due() cycle (no automation flag gates them,
  // see builder/jobs/route.ts), so unlike build-guide/build-tool/merge below
  // a flat threshold here can never false-alarm on a deliberately-disabled
  // automation - only on an actually-stuck job. 24h buffer over their 156h
  // CADENCE_HOURS, matching the weeklies' buffer above.
  "builder-research": 180,
  "builder-geo-scan": 180,
};

// Retired jobs kept callable for manual/debug use (see weekly-opportunities'
// own route comment) but no longer on any schedule. Without this, a job's
// LAST historical cron_runs row (from before retirement) stays the permanent
// "latest" row forever - if that row happened to be a failure, `!ok` would
// alarm on the Home banner and get_cron_health with no real job left to fix
// it and re-run (2026-07-27 audit). Excluded from health entirely, not just
// staleness: a retired job showing "broken" from a run nobody is watching is
// as misleading as it showing "stale".
const RETIRED_JOBS = new Set(["weekly-opportunities"]);

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
  // Every 10 minutes, so a broken queue would otherwise send 144 emails a day.
  // One per day is the right amount of "your articles are not going out".
  jobs: 24,
  "daily-ranks": 24,
  "hourly-gsc": 24,
  "serp-collect": 24, // hourly like hourly-gsc - one email per broken day, not one per run
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
  // 0039: this is a builder handout marker, not a real completion - see
  // reportCronRun's claimedOnly param. Only /api/builder/jobs's due() check
  // reads this; every other consumer (banner, get_cron_health) can ignore it.
  claimed_only: boolean;
  // The failure has been seen on at least two consecutive real runs - the
  // previous real outcome was also a failure. This is what separates weather
  // (one flaky run that the next scheduled run cures by itself) from a job
  // that is actually broken, and criticalCronIssues keys on it. Manual
  // "mark as fixed" rows are invisible to this scan on purpose: declaring a
  // job fixed without fixing it must not reset its persistence.
  repeat_failure: boolean;
};

// A quota failure is "come back later", not a broken job: the agent account it
// names is the customer's own Claude/Codex plan hitting its usage window, a
// normal state of a bring-your-own-credential product. Matching on message
// text is deliberately a HINT, not a verdict - a false negative just means the
// failure is treated as ordinary, a false positive means it waits in the amber
// box instead of the red one. (Lives here rather than build-schedule.ts so the
// banner policy below can use it without an import cycle; build-schedule
// re-imports it for its retry-backoff decision.)
const QUOTA_HINT = /session limit|usage limit|rate.?limit|quota|too many requests|\b429\b/i;

export function looksLikeQuotaFailure(errors: readonly string[] | null | undefined): boolean {
  return (errors ?? []).some((e) => QUOTA_HINT.test(e));
}

// Failure classes worth interrupting the owner for on their FIRST occurrence,
// because waiting a cadence changes nothing and costs a day:
//   - deploy-check: a human just pushed and the deploy is broken - every run
//     is a distinct event, and "wait and see" is never the answer;
//   - dead credentials / permissions / an empty balance: these never heal on
//     their own, and every scheduled run until they're fixed is a no-op.
// Everything else gets one grace run (see criticalCronIssues / reportCronRun):
// scheduled jobs retry on their own, so a real breakage announces itself again
// within one cadence, while a GitHub blip or vendor hiccup never gets to paint
// the dashboard red at all.
// "gave up after N attempts" is the jobs queue's terminal-failure phrasing
// (api/cron/jobs): the retries are already spent, so waiting a grace run
// changes nothing and an owner's article sits unpublished meanwhile.
const URGENT_FAILURE =
  /secret|credential|token|api.?key|unauthorized|forbidden|revoked|permission|\b401\b|\b403\b|payment|billing|balance|oauth_org_not_allowed|disabled claude subscription|gave up after \d+ attempts/i;

// A run that ended with "this needs a human" is a to-do, not a breakage: the
// tool validator giving up on a PR after three verdict-less runs, or a green
// PR that auto-merge couldn't land. The workflow has one channel (ok/fail) so
// it reports through fail=, but nothing is broken and nothing will heal by
// retrying - the owner reviews the PR when they get to it. Red-boxing it put
// "one of my background jobs is failing" on the dispatcher for a week over a
// single PR waiting on a look (usagecut, 2026-09-05). Home shows these as a
// quiet review line instead; get_cron_health keeps the full row.
const MANUAL_REVIEW =
  /stranded|review it manually|left open for manual merge|merge or validate .* manually/i;

export function isManualReviewNotice(job: string, errors: readonly string[]): boolean {
  if (baseJobName(job) === "deploy-check") return false;
  return errors.length > 0 && errors.every((e) => MANUAL_REVIEW.test(e));
}

export function isUrgentCronFailure(job: string, errors: string[]): boolean {
  if (baseJobName(job) === "deploy-check") return true;
  return errors.some((e) => URGENT_FAILURE.test(e));
}

// THE BANNER POLICY, in one place - Home's red panel and the briefing's alert
// tone both call this, so they can never drift apart. A failed run-log row is
// not automatically worth interrupting the owner: most one-off failures are
// weather, and the run log already keeps them. The red surface is reserved for
// failures that are:
//   - stale: a full schedule window passed with the app up - persistent by
//     definition, whatever the error text said;
//   - repeated: failed on at least two consecutive real runs;
//   - urgent: see isUrgentCronFailure - first occurrence is already the alarm.
// Quota waits, pipeline-update notices and "needs a manual review" outcomes are excluded because they have their
// own calmer surfaces on Home. Everything filtered out here stays visible in
// get_cron_health: the agent-facing view keeps full fidelity, and this filter
// is presentation policy, not truth.
export function criticalCronIssues(health: CronHealth[]): CronHealth[] {
  return health.filter((h) => {
    if (h.ok && !h.stale) return false;
    if (h.update_available) return false;
    if (!h.ok && !h.stale && looksLikeQuotaFailure(h.errors)) return false;
    if (!h.ok && !h.stale && isManualReviewNotice(h.job, h.errors)) return false;
    if (h.stale) return true;
    return h.repeat_failure || isUrgentCronFailure(h.job, h.errors);
  });
}

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
    } else if (key === "failed" && typeof val === "string") {
      // Not every producer of `failed` uses an array: RefillOutcome
      // (queue-refill.ts) reports a single string. Unwrapping only the array
      // shape meant a refill failure nested inside a cron's result JSON
      // vanished from the errors list entirely - visible only because refill
      // also reports under its own marker row.
      out.push(path ? `${path}: ${val}` : val);
    } else if (val && typeof val === "object") {
      out.push(...collectErrors(val, at));
    }
  }
  return out;
}

// Pseudo-job for the run-log alarm below. Deliberately never written to
// cron_runs - writing there is precisely what is broken when it fires - so it
// only ever names an email, and can never collide with a real job's history.
const RUN_LOG_JOB = "cron-run-log";

async function sendFailureEmail(job: string, errors: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return false;
  // `||`, not `??`: docker-compose passes ALERT_EMAIL_FROM through as
  // `${ALERT_EMAIL_FROM:-}`, so on every Docker install the variable is PRESENT
  // and EMPTY rather than undefined. `??` only catches null/undefined, so the
  // default never fired there and Resend got a request with an empty required
  // `from` - a 422 on every alert, swallowed into console.error. The result was
  // the worst possible shape for an alerting system: a self-hoster follows the
  // documented two-line setup (RESEND_API_KEY + ALERT_EMAIL), no email ever
  // arrives, and the docs tell them "no email means everything is working".
  const from = process.env.ALERT_EMAIL_FROM || "DispatchSEO <onboarding@resend.dev>";
  const list = errors.slice(0, 20).map((e) => `- ${e}`).join("\n");
  const isDeploy = job === "deploy-check";
  // The stock body points at the Home banner for detail. When the run log is
  // the thing that's down, that advice is actively wrong - the banner is
  // frozen on the last state that was written - so this branch says so.
  const isRunLog = job === RUN_LOG_JOB;
  // A deploy check fails for two very different reasons, and the email used to
  // assert the louder one either way: "the code that went live is broken" when
  // in fact the newest commit never went live AT ALL and the previous one is
  // serving perfectly (2026-08-02 - Vercel never picked up a push, and the
  // email sent the reader hunting a build failure that did not exist). One
  // means roll back, the other means re-trigger; saying the wrong one costs
  // exactly the time an alert is supposed to save.
  const neverWentLive =
    isDeploy && errors.length > 0 && errors.every((e) => /never went live|not live after/i.test(e));
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: isRunLog
        ? "DispatchSEO cron alerting is blind - run log is not writable"
        : neverWentLive
          ? "DispatchSEO deploy never went live"
          : isDeploy
            ? "DispatchSEO deploy check failed"
            : `DispatchSEO job failed: ${job}`,
      text:
        (isRunLog
          ? `Cron outcomes cannot be written to the database, so every job's ` +
            `result is being thrown away as it finishes.\n\n`
          : neverWentLive
            ? `The newest commit has not gone live. Whatever deployed before it ` +
              `is still serving, so the product is UP - it is running one commit ` +
              `behind, and nothing here says the new code is broken.\n\n`
            : isDeploy
              ? `The post-deploy smoke test just failed - the code that went live is broken.\n\n`
              : `The ${job} job just failed.\n\n`) +
        `${list || "(no error detail captured)"}\n\n` +
        (isRunLog
          ? `Until this is fixed the Home banner and get_cron_health are BLIND: ` +
            `they show the last state that was successfully written, so a job ` +
            `that is failing right now can still look healthy there. This email ` +
            `is the only signal you will get.\n\n` +
            `The usual cause is an unapplied migration (the insert writes every ` +
            `cron_runs column, so one missing column fails all of them). Run ` +
            `supabase/migrations/setup.sql - idempotent, safe to re-run - then ` +
            `hit /api/cron/deploy-check to confirm schema_migrations reads ok.`
          : `Latest runs show on the dashboard Home banner; full logs are in ` +
            `your Vercel function logs or the job's GitHub Actions run. While a ` +
            `job keeps failing its emails are debounced, so you may not get one ` +
            `per failure - the banner always shows the latest state.`),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// The run log itself failed to write. This is the one failure that cannot ride
// the normal rails, because the normal rails ARE what is down: the banner,
// get_cron_health, the per-job email debounce and mark_cron_fixed all read
// cron_runs. It used to be a bare console.error in a log nobody tails, which
// on 2026-07-27 meant ~5.5h of every cron returning HTTP 200 while its outcome
// was silently discarded (migration 0039 unapplied - the insert sends
// claimed_only, so one missing column failed every write).
//
// So: email directly, and debounce in memory, since the per-job debounce lives
// in the table we cannot write to. Module-level state resets on cold start, so
// the worst case is one email per warm instance per hour - noisier than the
// DB-backed debounce on purpose, and still bounded. Best-effort throughout:
// reporting must never fail the cron that called it.
const RUN_LOG_ALARM_DEBOUNCE_MS = 60 * 60 * 1000;
let lastRunLogAlarmAt = 0;

async function alertRunLogBroken(
  job: string,
  err: { message?: string; code?: string },
): Promise<void> {
  const message = err.message ?? "unknown error";
  console.error(`[cron-alerts] ${job} run log insert failed:`, message);
  // A missing cron_runs TABLE is "migrations were never applied" - an install
  // that has not finished yet, which the /setup wizard already owns as a
  // user-facing card. Per CLAUDE.md, unmet setup is informational and never
  // emails; loudness is for regressions. A missing COLUMN is the opposite: the
  // table exists, this instance has been logging runs successfully, and a
  // deploy just moved past its schema - exactly the 0039 case, and worth
  // waking the owner. Anything else (permissions, connection) is loud too.
  const code = err.code ?? "";
  const tableMissing =
    code === "42P01" || code === "PGRST205" || /could not find the table/i.test(message);
  if (tableMissing) return;
  if (Date.now() - lastRunLogAlarmAt < RUN_LOG_ALARM_DEBOUNCE_MS) return;
  lastRunLogAlarmAt = Date.now();
  try {
    await sendFailureEmail(RUN_LOG_JOB, [
      `cron_runs insert failed while logging "${job}": ${message}`,
    ]);
  } catch (e) {
    console.error(`[cron-alerts] run-log alarm could not be emailed either:`, e);
  }
}

// Cloud bundle: the project owner behind a per-tenant job (job names carry the
// slug, e.g. seo-daily--acme), resolved to their account email so a hands-off
// CUSTOMER is alerted when their own automation breaks - the cloud answer to
// self-host's BYO email. Cloud only: db() is the supabase-js service client
// there (auth.admin available); self-host's single owner IS the operator.
// WHICH FAILURES A CUSTOMER SHOULD BE EMAILED ABOUT.
//
// The operator gets every failure - that never changes. The customer gets only
// the ones they can actually DO something about, because an email that names a
// problem the reader cannot fix is worse than no email: it is alarming, it
// invites a support message we answer with "ignore that", and it trains them to
// ignore the next one that mattered.
//
// The bar this failed before: on 2026-08-02 one paying customer got three
// failure emails in a day, two of which said, in full, "workflow failed -
// https://github.com/.../runs/30740655773". They cannot read that log (it is
// their repo, but the message names nothing), and the actual cause was their
// own agent account running out of quota - which the email never mentioned.
//
// Everything not matched here stays operator-only and still shows on the
// customer's dashboard banner, which is the right surface for "something is off
// but there is nothing for you to do".
const CUSTOMER_ACTIONABLE: Array<{ test: RegExp; lead: string }> = [
  {
    test: /session limit|usage limit|limit reached|limit .*resets|rate.?limit|quota|too many requests|\b429\b/i,
    lead: "Your coding agent's account has hit its usage limit, so builds are paused until it resets. Upgrading that account, or switching this site to a different agent in Settings, gives the builders more room.",
  },
  {
    // Anthropic's oauth_org_not_allowed: a server-side flag on the Claude
    // ACCOUNT, not the token. MUST stay above the generic credential rule -
    // the message contains "token", and that rule's "re-paste it" advice is
    // exactly the thing that provably does nothing here (Maxpertise,
    // 2026-08-04).
    test: /disabled claude subscription access|oauth_org_not_allowed/i,
    lead: "Anthropic is refusing your Claude subscription for Claude Code builds (their oauth_org_not_allowed flag) - a fresh token will not fix it. If your Claude account is on a company plan, ask its admin to enable Claude Code access; on a personal plan, check your claude.ai billing for a lapsed or duplicate subscription, or contact Anthropic support. You can also switch the builders to metered API billing (add an ANTHROPIC_API_KEY secret to your repo, then delete CLAUDE_CODE_OAUTH_TOKEN), or switch this site to a different agent in Settings.",
  },
  {
    test: /secret|credential|token|unauthorized|forbidden|revoked|\b401\b|\b403\b/i,
    lead: "Your coding agent's credential looks missing, expired or revoked, so the builders cannot run. Re-paste it on the dashboard and they resume on the next scheduled run.",
  },
  {
    test: /search console|gsc|google.*(permission|access|denied)/i,
    lead: "We lost access to your Search Console property, so traffic stats have stopped updating. Re-granting access on the Google page restores them.",
  },
  {
    test: /github app|installation|repository not found|repo.*(access|permission)/i,
    lead: "Our GitHub App no longer has access to your repository, so nothing can be built or merged. Reconnecting it from the dashboard fixes this.",
  },
];

export function customerActionableLead(errors: string[]): string | null {
  for (const { test, lead } of CUSTOMER_ACTIONABLE) {
    if (errors.some((e) => test.test(e))) return lead;
  }
  return null;
}

// One customer email per CAUSE per project, not per job. The per-job debounce
// above is the wrong unit for the customer: a dead agent credential fails
// seo-daily, seo-tools, seo-token-check and seo-geo-scan separately, each on
// its own 6h window, so an owner whose account broke once got the identical
// "here is what to do" email several times a day, every day, until they fixed
// it (Maxpertise, 2026-08-04..06). They were told; repeating it daily only
// trains them to ignore the address. While the same actionable cause keeps
// failing anywhere in the project, re-send at most every 72h; a DIFFERENT
// cause (a different CUSTOMER_ACTIONABLE lead) still emails immediately.
// The operator's per-job emails are untouched. Best-effort like everything
// here: a query error means "not emailed recently", never a swallowed alert.
const CUSTOMER_CAUSE_DEBOUNCE_HOURS = 72;

async function customerCauseEmailedRecently(job: string, lead: string): Promise<boolean> {
  const slug = jobProjectSlug(job);
  if (!slug) return false;
  try {
    const since = new Date(
      Date.now() - CUSTOMER_CAUSE_DEBOUNCE_HOURS * 3600 * 1000,
    ).toISOString();
    const { data } = await db()
      .from("cron_runs")
      .select("errors")
      .like("job", `%--${slug}`)
      .not("emailed_at", "is", null)
      .gte("emailed_at", since)
      .limit(50);
    return Boolean(
      data?.some((r) => customerActionableLead((r.errors as string[]) ?? []) === lead),
    );
  } catch {
    return false;
  }
}

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
  lead: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  // `||`, not `??`: docker-compose passes ALERT_EMAIL_FROM through as
  // `${ALERT_EMAIL_FROM:-}`, so on every Docker install the variable is PRESENT
  // and EMPTY rather than undefined. `??` only catches null/undefined, so the
  // default never fired there and Resend got a request with an empty required
  // `from` - a 422 on every alert, swallowed into console.error. The result was
  // the worst possible shape for an alerting system: a self-hoster follows the
  // documented two-line setup (RESEND_API_KEY + ALERT_EMAIL), no email ever
  // arrives, and the docs tell them "no email means everything is working".
  const from = process.env.ALERT_EMAIL_FROM || "DispatchSEO <onboarding@resend.dev>";
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
      // Lead with the CAUSE and the fix, not the job name. This email is only
      // ever sent for a failure we can name a customer action for (see
      // customerActionableLead), so it should read as "here is what to do",
      // never as "a job called seo-tools failed, good luck".
      subject: `DispatchSEO: ${site} needs something from you`,
      text:
        `${lead}\n\nWhat we saw on ${site}:\n${list || "(no detail captured)"}\n\n` +
        `Nothing is lost - the work stays queued and picks up again by itself once this ` +
        `is sorted. Your DispatchSEO dashboard shows the current status, and you can ` +
        `reply to this email if you want a hand.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// The one call every cron route makes. Never throws.
// claimedOnly (0039): true only for /api/builder/jobs's handout marker - a
// row that says "the builder was given this job", not "this job finished".
// getCronHealth's due-ness check treats a stale claim as if it never ran.
export async function reportCronRun(
  job: string,
  result: Record<string, unknown>,
  hadError: boolean,
  claimedOnly = false,
): Promise<void> {
  try {
    // A lapsed plan drops out of the run log entirely - no row, no banner, no
    // email to anyone. This is the door the noise actually comes through: the
    // work stopped the moment planGate denied (crons skip, nothing is
    // dispatched), but the ex-customer's repo keeps its own GitHub-side
    // schedules and keeps reporting their outcomes here, so "stopped paying"
    // used to mean "keeps alerting, forever, about a pipeline nobody is
    // entitled to". Dropping the row rather than only the email is the point:
    // a failed row that lives on goes stale and re-alarms by itself.
    //
    // Scoped to per-tenant jobs by construction - a bare job name is an
    // instance-wide backend cron, which belongs to the operator and is never
    // gated. planPausedProjectSlugs fails open, so this can only ever go quiet
    // for an account whose plan really is inactive.
    const reportingSlug = jobProjectSlug(job);
    if (reportingSlug && (await planPausedProjectSlugs()).has(reportingSlug)) {
      console.log(`[cron-alerts] ${job} ignored - the project's plan is inactive`);
      return;
    }

    const errors = hadError ? collectErrors(result) : [];
    let emailedAt: string | null = null;

    // Update notices log as failed rows (so they surface and mark_cron_fixed
    // works) but never email - "a newer pack exists" is not worth waking the
    // owner, and it would fire for EVERY connected repo of EVERY user on the
    // morning after any backend deploy that touches the pack.
    if (hadError && !isPipelineUpdateNotice(job, errors) && !isManualReviewNotice(job, errors)) {
      // One grace run before the first email, same policy as the Home banner
      // (criticalCronIssues): the run still logs as failed and get_cron_health
      // shows it immediately, but the email only goes out if the previous real
      // run of this job also failed - a sustained breakage wakes the owner, a
      // one-off blip (GitHub hiccup, cancelled runner, vendor 5xx) doesn't.
      // This used to apply only to transient-TAGGED vendor errors; it now
      // covers every non-urgent failure, because scheduled jobs retry on their
      // own and a real breakage re-announces itself within one cadence.
      // Urgent classes (isUrgentCronFailure: a broken deploy just pushed, dead
      // credentials, an empty balance) still email on the first failure -
      // those never heal by waiting.
      let persistedAcrossRuns = true;
      if (!isUrgentCronFailure(job, errors)) {
        const { data: prev } = await db()
          .from("cron_runs")
          .select("ok")
          .eq("job", job)
          // Claim rows are handouts, not outcomes - they must not count as
          // "the previous run recovered" (nor as a failure).
          .eq("claimed_only", false)
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
        // already per-tenant - plus the cross-job cause debounce above, so a
        // single broken credential does not email once per workflow it kills.
        const lead = isCloudMode() ? customerActionableLead(errors) : null;
        if (lead && !(await customerCauseEmailedRecently(job, lead))) {
          try {
            const owner = await ownerContactForJob(job);
            if (
              owner &&
              (await sendCustomerFailureEmail(owner.email, owner.domain, job, errors, lead))
            ) {
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
      claimed_only: claimedOnly,
    });
    // The insert still never fails the cron (migration 0020 not applied yet is
    // a legitimate state - same posture as projects.ts / site-profile.ts), but
    // it no longer fails QUIETLY: see alertRunLogBroken.
    if (error) await alertRunLogBroken(job, error);
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
  // Lapsed plans have no health, because they have no pipeline: planGate has
  // already turned every cron into a skip for them. Their last rows are frozen
  // history, and history left in here doesn't sit still - it ages past its
  // staleness threshold and starts alarming on its own, which is how a
  // cancelled account keeps a red banner (and, through markCronFixed's
  // allowlist, a clearable one) forever. The lapsed owner is told the one true
  // thing instead, by PlanLapsedBanner: the plan stopped, so the work did.
  const paused = await planPausedProjectSlugs();
  if (projectSlug && paused.has(projectSlug)) return [];

  const { data, error } = await db()
    .from("cron_runs")
    .select("job, ok, errors, created_at, claimed_only")
    // The window has to be WIDER THAN THE WIDEST STALENESS THRESHOLD, or a job
    // ages out before it can ever be flagged late - it simply vanishes from
    // health, no row, no ok:false, no stale, nothing on the banner.
    //
    // 500 was "a week+" when written and is not any more: this table is shared
    // by every tenant, and measured on 2026-08-02 the 500-row window reached
    // back 74.5h against the 192h threshold the three weekly jobs carry - 2.6x
    // too short. seo-auto-merge alone was 35% of the rows. It also silently
    // cost money: dueBuildWork reads a missing row as "due", so research
    // re-dispatched at roughly double cadence and double DataForSEO spend.
    //
    // 3000 restores ~18 days at today's rate. This is a ceiling that grows with
    // tenant count, not a fix - the real answer is one row per job
    // (`distinct on (job)`) via an RPC or view, which removes the window
    // entirely. Revisit before this deployment carries many more sites.
    .order("created_at", { ascending: false })
    .limit(3000);
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
  // The staleness clock's anchors, per job. A claimed/deferred row means
  // "handed out (or ran and produced nothing), not finished" - so when the
  // LATEST row is one of those, staleness must run from the last REAL outcome
  // instead. Without this a builder deferring every ~3 hours refreshed
  // created_at forever: "goes stale and alarms if deferrals never stop" was
  // documented on the deferred path but implemented nowhere, and a chronically
  // rate-limited Codex account deferred quietly for weeks behind a green
  // dashboard. oldestClaim covers the never-completed-even-once case.
  const lastRealAt = new Map<string, string>();
  const oldestClaimAt = new Map<string, string>();
  // Persistence scan for repeat_failure: the newest two real outcomes per job,
  // skipping manual "mark as fixed" rows - so declaring a job fixed without
  // fixing it never resets its persistence, and the next real failure still
  // reads as a repeat (banner comes straight back).
  const realOks = new Map<string, boolean[]>();
  for (const row of data) {
    const owner = jobProjectSlug(row.job as string);
    if (
      projectSlug &&
      owner === projectSlug &&
      new Date(row.created_at as string).getTime() < projectSince
    ) {
      continue;
    }
    const job = row.job as string;
    if (!latest.has(job)) latest.set(job, row);
    if (row.claimed_only) {
      oldestClaimAt.set(job, row.created_at as string); // desc order: last write wins = oldest
    } else {
      if (!lastRealAt.has(job)) lastRealAt.set(job, row.created_at as string);
      const isManualFix =
        Boolean(row.ok) &&
        ((((row.errors as string[]) ?? [])[0] ?? "")).startsWith("marked as fixed manually");
      const oks = realOks.get(job) ?? [];
      if (oks.length < 2 && !isManualFix) {
        oks.push(Boolean(row.ok));
        realOks.set(job, oks);
      }
    }
  }
  const health = [...latest.values()]
    .filter((row) => !RETIRED_JOBS.has(baseJobName(row.job as string)))
    // ...and the same suppression for the operator's all-projects view, which
    // is not scoped by the early return above. Rows written before the plan
    // lapsed stay in the table; they just stop being anybody's alert.
    .filter((row) => {
      const owner = jobProjectSlug(row.job as string);
      return !(owner && paused.has(owner));
    })
    .filter((row) => {
      if (!projectSlug) return true;
      const owner = jobProjectSlug(row.job as string);
      if (owner === projectSlug) return true;
      // Bare job names (daily-ranks, hourly-gsc, deploy-check, build-recovery)
      // are INSTANCE-WIDE runs that loop every project. On self-host that is
      // the single owner's own infrastructure and they should see it.
      //
      // On cloud it is the OPERATOR's, and passing it to a scoped tenant leaked
      // two ways: the row's `errors` array is built from the whole loop, so it
      // carries other tenants' slugs, domains, tracked keywords and raw failure
      // text; and because markCronFixed() takes its allowlist from exactly this
      // list, any tenant could also insert an ok-row against daily-ranks and
      // silence the operator's banner and alert emails for EVERYONE. Scoping
      // the read closes both doors at once (2026-07-27).
      return owner === null && !isCloudMode();
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
      const claimed = Boolean(row.claimed_only);
      // Claimed latest row -> clock from the last real outcome (or the oldest
      // claim in the window when nothing real ever landed); real latest row ->
      // exactly the old behavior. And a job stuck claimed/deferred gets a
      // 36h backstop even without a STALE_HOURS entry - jobs like the tool
      // builder legitimately go quiet for weeks when nothing is approved, so
      // they cannot carry a blanket schedule, but "work was handed out and
      // never once finished for a day and a half" is overdue for any of them.
      const clockFrom = claimed
        ? (lastRealAt.get(job) ?? oldestClaimAt.get(job) ?? (row.created_at as string))
        : (row.created_at as string);
      const ageHours = staleAgeHours(new Date(clockFrom).getTime());
      const staleLimit = STALE_HOURS[baseJobName(job)] ?? (claimed ? 36 : Infinity);
      // A claim/deferral says "handed out" or "ran and produced nothing" - it is
      // the ABSENCE of an outcome, so it must never be able to CLEAR a red one.
      // Reading ok straight off the latest row meant the next dispatch of a job
      // whose last real outcome was a failure flipped the customer's banner
      // green with nothing fixed - and get_cron_health told the agent the same
      // lie, so it stopped investigating. The staleness clock above already
      // does this correctly via lastRealAt; ok was the half that was missed
      // (seen live on seo-daily--maxpertise, 2026-08-02: FAIL at 08:53:41,
      // green again by the next tick).
      const okRow = claimed
        ? (data.find((r) => (r.job as string) === job && !r.claimed_only) ?? null)
        : row;
      return {
        job,
        // No real row anywhere in the window: nothing has ever finished, so
        // there is no failure to report - staleness is the signal that covers
        // this, not a red banner with no error text behind it.
        ok: okRow ? Boolean(okRow.ok) : true,
        // Unlisted jobs run per push/dispatch - no schedule, never stale
        // (unless stuck claimed, per above).
        stale: ageHours > staleLimit,
        last_run_at: row.created_at as string,
        // Carried from the SAME row ok came from. Taking ok from the last real
        // outcome but errors from the claim on top of it produced "failed on
        // its last run" with no message after it - a red banner that names no
        // cause is one nobody can act on.
        errors: okRow ? ((okRow.errors as string[]) ?? []) : errors,
        update_available:
          okRow != null &&
          !okRow.ok &&
          isPipelineUpdateNotice(job, (okRow.errors as string[]) ?? []),
        claimed_only: claimed,
        repeat_failure: (() => {
          const oks = realOks.get(job) ?? [];
          return oks.length >= 2 && !oks[0] && !oks[1];
        })(),
      };
    });
  // Independent of each other - both only read the reported-job set - so they
  // run together. Serially they put two per-project sweeps in front of Home.
  const reported = new Set(health.map((h) => h.job));
  const [heartbeat, builderHeartbeat] = await Promise.all([
    pipelineHeartbeatAlerts(projectSlug, reported, paused),
    builderJobHeartbeatAlerts(projectSlug, reported),
  ]);
  // Twin-rail first: it is pure in-memory, so every row it clears is a
  // suggestions-count query the idle gate below never has to make.
  const all = await unstaleIdleBuilders(
    unstaleTwinRailBuilders([...health, ...heartbeat, ...builderHeartbeat]),
  );
  return [...all, ...(await githubQuotaAlert(projectSlug, all))];
}

// The guide/tool builders run on TWO rails - the GitHub Actions workflow
// (seo-daily/seo-tools) and the in-stack builder (builder-build-guide/
// build-tool) - and whichever rail gets there first anchors built_today, so
// the other rail's guard skips silently every day from then on. Correct
// behaviour, but its staleness clock keeps aging: on a builder-active project
// seo-daily last posts a real row the day the builder takes over, goes
// "overdue" 36h later, and stays on the banner forever while a guide ships
// every single day (seo-daily--mia-tax, 2026-08-09). The empty-queue gate
// below cannot catch this - the queue HAS approved work; the other rail is
// doing it.
//
// So: a stale build job whose twin rail completed a real, healthy run inside
// this job's own staleness window is not late, it is superseded - clear the
// flag. Same contract as the idle gate: only ever CLEARS, never sets. The
// recency bound is what keeps it honest - a twin whose last real outcome is
// old fails it, so "nothing has built anywhere for days" stays exactly as
// loud as it was, and a twin that is failing or itself stale (the stuck-claim
// 36h backstop) never vouches for anyone.
const TWIN_RAIL: Record<string, string> = {
  "seo-daily": "builder-build-guide",
  "seo-tools": "builder-build-tool",
  "builder-build-guide": "seo-daily",
  "builder-build-tool": "seo-tools",
  // Research and the GEO scan run on the same two rails. Without these pairs a
  // docker install whose in-stack builder took over research showed
  // "seo-weekly-research is overdue" in red from the day the workflow last
  // ran, while builder-research shipped fresh keywords every week
  // (seo-weekly-research--usagecut, 2026-09-05).
  "seo-weekly-research": "builder-research",
  "seo-geo-scan": "builder-geo-scan",
  "builder-research": "seo-weekly-research",
  "builder-geo-scan": "seo-geo-scan",
};

function unstaleTwinRailBuilders(health: CronHealth[]): CronHealth[] {
  const byJob = new Map(health.map((h) => [h.job, h]));
  return health.map((h) => {
    const base = baseJobName(h.job);
    const twinBase = TWIN_RAIL[base];
    const slug = jobProjectSlug(h.job);
    if (!h.stale || !h.ok || !twinBase || !slug) return h;
    const twin = byJob.get(`${twinBase}--${slug}`);
    if (!twin || !twin.ok || twin.stale) return h;
    // The twin's latest row can be a claim (build in flight right now); its
    // ok already reflects the last real outcome (see okRow above), and a
    // claim that never completes trips the 36h stuck-claim backstop, so the
    // stale check above covers it. Judged on the boot-aware clock, same as
    // the staleness it is clearing.
    const twinAge = staleAgeHours(new Date(twin.last_run_at).getTime());
    return twinAge <= (STALE_HOURS[base] ?? 36) ? { ...h, stale: false } : h;
  });
}

// A build workflow that hasn't run because there is NOTHING TO BUILD is not
// stale, it is idle - and idle is the normal resting state of a semi-mode
// project whose owner simply hasn't approved anything this week.
//
// This became reachable the moment the build workflows stopped posting ok=1
// for runs their own guard skipped (2026-08-02). That heartbeat was wrong -
// it told due() a build had completed and cost the next 20h of dispatch - but
// while it existed it also, accidentally, kept these rows fresh. Removing it
// without this gate would have turned "your queue is empty" into a red
// "seo-daily hasn't run in 36 hours" banner: the GitHub-rail twin of the
// build-guide false alarm fixed on the builder rail the same day.
//
// Only ever CLEARS a stale flag, never sets one, and only for the two
// approval-gated builders - a job that has real work waiting and still isn't
// running stays exactly as loud as it was.
const IDLE_GATED_JOBS: Record<string, "guide" | "tool"> = {
  "seo-daily": "guide",
  "seo-tools": "tool",
  "builder-build-guide": "guide",
  "builder-build-tool": "tool",
};

async function unstaleIdleBuilders(health: CronHealth[]): Promise<CronHealth[]> {
  const candidates = health.filter(
    (h) => h.stale && h.ok && IDLE_GATED_JOBS[baseJobName(h.job)] !== undefined,
  );
  if (candidates.length === 0) return health; // hot path: nothing to check
  try {
    const projects = await listProjects();
    const bySlug = new Map(projects.map((p) => [p.slug, p]));
    const idle = new Set<string>();
    for (const h of candidates) {
      const slug = jobProjectSlug(h.job);
      const project = slug ? bySlug.get(slug) : null;
      if (!project) continue; // unknown project: leave the row untouched
      const { count, error } = await db()
        .from("suggestions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("type", IDLE_GATED_JOBS[baseJobName(h.job)])
        .eq("status", "approved");
      // A failed count must never silence a real alarm - only a proven-empty
      // queue does.
      if (!error && (count ?? 0) === 0) idle.add(h.job);
    }
    if (idle.size === 0) return health;
    return health.map((h) => (idle.has(h.job) ? { ...h, stale: false } : h));
  } catch {
    return health; // best-effort, like every helper here
  }
}

// The GitHub Actions workflows a connected repo runs on a schedule. Used to
// recognise "all of this project's automation stopped at once", which is what
// an exhausted Actions quota looks like from here.
const GH_SCHEDULED_JOBS: string[] = [
  "seo-daily",
  "seo-tools",
  "seo-geo-scan",
  "seo-weekly-research",
  "seo-token-check",
];

// How many of them must be silent before we name the quota. Two is enough to
// separate "one workflow is broken" from "nothing is running any more", and
// low enough to fire before a whole week of publishing is lost.
const QUOTA_SILENT_JOBS = 2;

/**
 * NAMES THE MOST CONFUSING FAILURE IN THE PRODUCT.
 *
 * A customer's automations run as GitHub Actions billed to the customer's own
 * GitHub account. When that account's free minutes run out and its spending
 * limit is still $0 - which is GitHub's default - GitHub does not bill them and
 * does not email them. It stops running workflows. Every scheduled job simply
 * goes quiet, mid-month, and the repo looks fine.
 *
 * Without this, that arrives as several unrelated "job hasn't run since..."
 * rows and the owner goes hunting through workflow logs for a bug that does not
 * exist. The fix is a billing setting, so the alert has to say so - the
 * no-silent-failures rule: name what happened and link the way out.
 *
 * Deliberately a HINT, not a diagnosis: we cannot see another account's billing
 * page, so this fires on the signature (several scheduled jobs silent at once
 * on an account that plausibly exceeds the free tier) and says "likely". It is
 * additive - the individual stale rows still stand on their own - so being
 * wrong costs a sentence of explanation, never a hidden failure.
 */
async function githubQuotaAlert(
  projectSlug: string | undefined,
  health: CronHealth[],
): Promise<CronHealth[]> {
  try {
    // CHEAP EXIT FIRST, from rows already in memory. getCronHealth is a hot
    // path - it runs on every dashboard Home render, every get_cron_health
    // call, and once per project inside the schedulers - so this helper must
    // cost nothing in the overwhelmingly common case where nothing is stale.
    // Without this gate the listProjects() below fired on every one of those,
    // turning the scheduler loop into an N+1.
    //
    // Safe as a necessary condition: the alert needs QUOTA_SILENT_JOBS stale
    // jobs on ONE project, so fewer than that across ALL projects can never
    // produce one.
    const staleScheduled = health.filter(
      (h) => h.stale && GH_SCHEDULED_JOBS.includes(baseJobName(h.job)),
    );
    if (staleScheduled.length < QUOTA_SILENT_JOBS) return [];

    // If the dispatcher itself is down, THAT is the story - every project's
    // jobs would be silent for a reason we already know and already alarm on.
    // Blaming the customer's GitHub bill for our own outage would be worse
    // than saying nothing.
    if (health.some((h) => baseJobName(h.job) === "seo-dispatch" && (h.stale || !h.ok))) {
      return [];
    }

    const projects = await listProjects();
    const connected = projects.filter((p) => p.github_repo && p.pipeline_installed_at);
    if (connected.length === 0) return [];

    const out: CronHealth[] = [];
    for (const p of connected) {
      if (projectSlug && p.slug !== projectSlug) continue;

      // Quota is per GITHUB ACCOUNT, so that is the unit to count - every
      // project installed under the same App installation shares one pool of
      // minutes. Self-host installs have no installation id; there, every
      // connected repo is the same owner's by definition.
      const sameAccount = p.github_installation_id
        ? connected.filter((c) => c.github_installation_id === p.github_installation_id)
        : connected;
      // One site fits inside GitHub Free with room to spare, so silence there
      // is a real fault and naming the quota would send the owner to the wrong
      // page. From two sites up it is a live possibility in a heavy month.
      if (sameAccount.length < 2) continue;

      const silent = GH_SCHEDULED_JOBS.filter((job) => {
        const row = health.find((h) => h.job === `${job}--${p.slug}`);
        // No row at all is not evidence: a workflow that has never reported may
        // simply be disabled or newly installed, which the heartbeat sweeps
        // above already handle on their own terms.
        return row?.stale === true;
      });
      if (silent.length < QUOTA_SILENT_JOBS) continue;
      // A real row under this exact job name already exists once the owner has
      // used "mark as fixed" (which INSERTS a row keyed by the job name).
      // Synthesizing a second entry would show the same alert twice on Home
      // and hand get_cron_health two rows with one job name - and the newer
      // real row is the one carrying the owner's acknowledgement, so it wins.
      if (health.some((h) => h.job === `github-actions-quota--${p.slug}`)) continue;

      out.push({
        job: `github-actions-quota--${p.slug}`,
        ok: false,
        stale: false,
        last_run_at: new Date().toISOString(),
        errors: [
          `${silent.length} of this repo's scheduled automations stopped reporting at the same time (${silent.join(", ")}). ` +
            `With ${sameAccount.length} sites on one GitHub account, the likeliest cause is that account's monthly GitHub Actions minutes running out. ` +
            `GitHub does not bill you for this or email you about it - it just pauses workflows. At https://github.com/settings/billing, add a payment method, then open Budgets and alerts and create an Actions budget above $0. ` +
            `Builds resume on their own once you do, and the allowance resets on your GitHub billing date.`,
        ],
        update_available: false,
        claimed_only: false,
        // Synthesized from a whole missed window / multi-job silence - a
        // persistent condition by construction, so it must clear the
        // criticalCronIssues persistence bar.
        repeat_failure: true,
      });
    }
    return out;
  } catch {
    // Best-effort, like every other alert helper here: a hint that fails to
    // compute must never take the real health rows down with it.
    return [];
  }
}

// builder-build-guide/builder-build-tool never get a flat STALE_HOURS entry
// like builder-research/builder-geo-scan above, because they're gated on
// per-project state a global threshold can't see: auto_build_guides/
// auto_build_tools can be deliberately OFF (no row ever, correctly not an
// alarm), and both builders additionally only ever run when something is
// actually approved and waiting (an empty queue is a normal, common state,
// not a bug - semi mode leaves ideas pending until the owner approves them,
// so a quiet weekend is expected). A blind threshold would false-alarm. This
// checks the actual gating condition per project instead - only self-host
// (IS_DOCKER_STACK), since cloud has no in-stack builder at all.
// (builder-merge is deliberately NOT covered here: "no open PR to merge" is
// just as normal a silent state as the two above, but confirming there's
// nothing to merge means a live GitHub PR-list call, which no other
// staleness check in this file does - a real, smaller gap left open.)
const BUILDER_JOB_STALE_HOURS: Record<string, number> = {
  "build-guide": 30, // CADENCE_HOURS['build-guide'] (20h) + a 10h buffer
  "build-tool": 30,
};
async function builderJobHeartbeatAlerts(
  projectSlug: string | undefined,
  alreadyReported: Set<string>,
): Promise<CronHealth[]> {
  try {
    if (!IS_DOCKER_STACK) return [];
    const projects = await listProjects();
    const out: CronHealth[] = [];
    for (const p of projects) {
      if (projectSlug && p.slug !== projectSlug) continue;
      if (!p.github_repo || !p.pipeline_installed_at) continue;
      const flags = effectiveAutomations(p);
      const wanted: Array<"build-guide" | "build-tool"> = [];
      // Mirror dueWorkflows() exactly: BOTH builders are gated on the flag AND
      // on something actually being approved (build-schedule.ts). Checking the
      // flag alone says "has work waiting" when nothing is - a semi-mode owner
      // who simply hasn't approved anything for 30h got a red banner blaming
      // their builder's token, which no amount of token-fixing could clear.
      const approvedWaiting = async (type: "guide" | "tool") => {
        const { count } = await db()
          .from("suggestions")
          .select("id", { count: "exact", head: true })
          .eq("project_id", p.id)
          .eq("type", type)
          .eq("status", "approved");
        return (count ?? 0) > 0;
      };
      if (flags.auto_build_guides && (await approvedWaiting("guide"))) wanted.push("build-guide");
      if (flags.auto_build_tools && (await approvedWaiting("tool"))) wanted.push("build-tool");
      for (const wf of wanted) {
        const job = `builder-${wf}--${p.slug}`;
        if (alreadyReported.has(job)) continue; // the main window already covers it
        const { data: row, error } = await db()
          .from("cron_runs")
          .select("ok, created_at")
          .eq("job", job)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) continue;
        const threshold = BUILDER_JOB_STALE_HOURS[wf];
        if (!row) {
          // Grace period so a job that only just became due (flag flipped on,
          // or a tool was only just approved) isn't flagged before the
          // builder's ~10-minute poll has even had a chance to pick it up.
          if (Date.now() - new Date(p.pipeline_installed_at).getTime() < threshold * 3_600_000) continue;
          out.push({
            job,
            ok: false,
            stale: true,
            last_run_at: p.pipeline_installed_at,
            errors: [
              `${wf} is enabled and has work waiting, but the in-stack builder has never reported a run - check its GitHub connection and its ${projectAgent(p).displayName} credential (docker logs dispatchseo-builder-1)`,
            ],
            update_available: false,
            claimed_only: false,
            repeat_failure: true, // a whole missed window - persistent by construction
          });
          continue;
        }
        const ageHours = staleAgeHours(new Date(row.created_at as string).getTime());
        if (ageHours > threshold) {
          out.push({
            job,
            ok: Boolean(row.ok),
            stale: true,
            last_run_at: row.created_at as string,
            errors: [],
            update_available: false,
            claimed_only: false,
            repeat_failure: true, // a whole missed window - persistent by construction
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
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
  paused: Set<string>,
): Promise<CronHealth[]> {
  try {
    // Unreachable installs: GitHub's runners can never reach a backend on
    // localhost, a LAN or a tailnet, so repo workflows physically cannot
    // report - their silence is geometry, not rotted secrets, and the
    // in-stack builder does the building anyway. Telling those owners to
    // "re-run the setup command" forever is a false alarm they cannot clear.
    // isLocalBackendUrl covers private ranges too: the string test this
    // replaced saw 192.168.x / 100.x as public and alarmed on every homelab
    // and Tailscale install.
    if (IS_DOCKER_STACK && isLocalBackendUrl(process.env.APP_URL)) return [];
    const { data: projects, error } = await db()
      .from("projects")
      .select("id, slug, github_repo, pipeline_installed_at");
    if (error || !projects) return [];
    const out: CronHealth[] = [];
    for (const p of projects) {
      if (projectSlug && p.slug !== projectSlug) continue;
      if (!p.github_repo) continue; // nothing installable, nothing to expect
      // A lapsed plan's silence is the CORRECT state, not a rotted secret.
      // Without this the suppression above would invert into a new alarm: we
      // stop recording their reports, their last row eventually ages out of
      // the window, and this rail - which exists to catch a repo that never
      // reported - starts telling the operator to go fix the secrets of an
      // account that stopped paying.
      if (paused.has(p.slug as string)) continue;
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
          claimed_only: false,
          repeat_failure: true, // never-reported since install - persistent by construction
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
            claimed_only: false,
            repeat_failure: true, // a whole missed window - persistent by construction
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

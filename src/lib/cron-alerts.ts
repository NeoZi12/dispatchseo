import { db } from "./db";

// Cron failure alerts (LATER.md gap A4). Every cron route calls
// reportCronRun() with its result JSON right before responding; this module
// logs the run to cron_runs (migration 0020), and on a failed run emails the
// owner through Resend - debounced per job (24h for scheduled crons, so an
// hourly cron that stays broken sends one email, not twenty-four; none for
// deploy-check, where each run is a distinct human push). The post-deploy
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
  "weekly-opportunities": 8 * 24,
  "seo-daily": 36,
  "seo-auto-merge": 6, // hourly backstop schedule
  "seo-tools": 9 * 24, // Wednesdays
  "seo-weekly-research": 9 * 24,
  "secrets-canary": 24, // every 6h - a silent canary is itself an alarm
};

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

// The one call every cron route makes. Never throws.
export async function reportCronRun(
  job: string,
  result: Record<string, unknown>,
  hadError: boolean,
): Promise<void> {
  try {
    const errors = hadError ? collectErrors(result) : [];
    let emailedAt: string | null = null;

    if (hadError) {
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
      if (!alreadyEmailed) {
        try {
          if (await sendFailureEmail(job, errors)) emailedAt = new Date().toISOString();
        } catch (e) {
          console.error(`[cron-alerts] ${job} failure email failed:`, e);
        }
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

// Latest run per job, for the dashboard banner and the get_cron_health MCP
// tool. A job that has never run is absent (a fresh install has nothing to
// alert about - the setup cards own "crons not installed yet").
export async function getCronHealth(): Promise<CronHealth[]> {
  const { data, error } = await db()
    .from("cron_runs")
    .select("job, ok, errors, created_at")
    // 500 rows ≈ a week+ even with seo-auto-merge reporting every run -
    // wide enough that a sparse job's latest row (deploy-check only logs on
    // pushes) stays inside the window while frequent jobs pile rows on top.
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return []; // missing table = no alerts, not a crash
  const latest = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    if (!latest.has(row.job as string)) latest.set(row.job as string, row);
  }
  return [...latest.values()].map((row) => {
    const job = row.job as string;
    const ageHours = (Date.now() - new Date(row.created_at as string).getTime()) / 3600000;
    return {
      job,
      ok: Boolean(row.ok),
      // Unlisted jobs run per push/dispatch - no schedule, never stale.
      stale: ageHours > (STALE_HOURS[job] ?? Infinity),
      last_run_at: row.created_at as string,
      errors: (row.errors as string[]) ?? [],
    };
  });
}

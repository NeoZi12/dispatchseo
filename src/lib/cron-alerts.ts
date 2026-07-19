import { db } from "./db";

// Cron failure alerts (LATER.md gap A4). Every cron route calls
// reportCronRun() with its result JSON right before responding; this module
// logs the run to cron_runs (migration 0020), and on a failed run emails the
// owner through Resend - debounced to one email per job per 24h so an hourly
// cron that stays broken sends one email, not twenty-four.
//
// Email is optional: without RESEND_API_KEY + ALERT_EMAIL the run log still
// works and the dashboard banner / get_cron_health tool carry the alert.
// Everything here is best-effort - a logging failure must never fail the
// cron itself.

export type CronJob = "daily-ranks" | "hourly-gsc" | "weekly-opportunities";

// How long after the last run a job counts as "not running" - generous
// enough that scheduler jitter (Vercel Hobby ~1h, GitHub Actions delays)
// never false-alarms.
const STALE_HOURS: Record<CronJob, number> = {
  "daily-ranks": 36,
  "hourly-gsc": 6,
  "weekly-opportunities": 8 * 24,
};

export type CronHealth = {
  job: CronJob;
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

async function sendFailureEmail(job: CronJob, errors: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return false;
  const from = process.env.ALERT_EMAIL_FROM ?? "DispatchSEO <onboarding@resend.dev>";
  const list = errors.slice(0, 20).map((e) => `- ${e}`).join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `DispatchSEO cron failed: ${job}`,
      text:
        `The ${job} cron just failed.\n\n` +
        `${list || "(no error detail captured)"}\n\n` +
        `Latest runs show on the dashboard Home banner; full logs are in ` +
        `your Vercel deployment's function logs. You'll get at most one of ` +
        `these per job per 24h while it keeps failing.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// The one call every cron route makes. Never throws.
export async function reportCronRun(
  job: CronJob,
  result: Record<string, unknown>,
  hadError: boolean,
): Promise<void> {
  try {
    const errors = hadError ? collectErrors(result) : [];
    let emailedAt: string | null = null;

    if (hadError) {
      // Debounce: skip the email if this job already emailed in the last 24h.
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: recent } = await db()
        .from("cron_runs")
        .select("id")
        .eq("job", job)
        .not("emailed_at", "is", null)
        .gte("emailed_at", since)
        .limit(1);
      if (!recent || recent.length === 0) {
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
    .order("created_at", { ascending: false })
    .limit(60);
  if (error || !data) return []; // missing table = no alerts, not a crash
  const latest = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    if (!latest.has(row.job as string)) latest.set(row.job as string, row);
  }
  return [...latest.values()].map((row) => {
    const job = row.job as CronJob;
    const ageHours = (Date.now() - new Date(row.created_at as string).getTime()) / 3600000;
    return {
      job,
      ok: Boolean(row.ok),
      stale: ageHours > (STALE_HOURS[job] ?? 36),
      last_run_at: row.created_at as string,
      errors: (row.errors as string[]) ?? [],
    };
  });
}

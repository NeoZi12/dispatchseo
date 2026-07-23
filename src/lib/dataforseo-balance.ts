import type { DataforseoCreds } from "./dataforseo";

// Below this, the shared account funding bundled cloud DataForSEO can run
// dry before anyone notices - the per-tier usage budgets (dataforseo-usage.ts)
// cap what any one owner can spend, but the account itself still needs
// topping up like any project's own. Checked once per daily-ranks run, not
// per project.
const PLATFORM_BALANCE_ALERT_USD = 25;

// DataForSEO account balance for the dashboard nudge, per project's own
// credentials (free-tier DIY). The user_data endpoint is free to call, so a
// short cache is fine - 5 minutes keeps the "Fund DataForSEO" card from
// lingering for an hour after the user tops up (the data cache survives
// deploys, so a long TTL made the card look broken). Null creds = project not
// connected yet; the Connect card shows instead of a balance.
export async function dataforseoBalance(creds: DataforseoCreds | null): Promise<number | null> {
  if (!creds) return null;
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64"),
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      tasks?: Array<{ result?: Array<{ money?: { balance?: number } }> }>;
    };
    return json.tasks?.[0]?.result?.[0]?.money?.balance ?? null;
  } catch {
    return null;
  }
}

// Same check, for the shared platform account bundled cloud DataForSEO bills
// against. Not project-scoped - the daily-ranks cron calls this once per run,
// not once per project. Missing envs (not in CLOUD_MODE, or platform
// DataForSEO simply not configured yet) and a failed lookup both read as
// "nothing to alert on", same tolerance as dataforseoBalance itself.
export async function platformBalanceAlert(): Promise<string | null> {
  const login = process.env.DATAFORSEO_PLATFORM_LOGIN;
  const password = process.env.DATAFORSEO_PLATFORM_PASSWORD;
  if (!login || !password) return null;
  const balance = await dataforseoBalance({ login, password, billedTo: "platform" });
  if (balance == null || balance >= PLATFORM_BALANCE_ALERT_USD) return null;
  return (
    `Platform DataForSEO balance is $${balance.toFixed(2)} - below the $${PLATFORM_BALANCE_ALERT_USD} ` +
    "alert floor. Every bundled cloud project draws from this one account; top it up at " +
    "app.dataforseo.com before it runs dry."
  );
}

import type { DataforseoCreds } from "./dataforseo";

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

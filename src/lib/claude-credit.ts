import { db } from "@/lib/db";

// The operator's Claude Max plan comes with free Anthropic API credit every
// month (2026-11-08: $200/month on the Ultra plan). Up to that amount, Claude calls cost
// nothing in cash, so the Owner page's cost and margin count them as free.
//
// HOW IT IS SPLIT: each calendar month (UTC), the credit covers
// min(credit, that month's Claude spend). That covered share is spread over
// every Claude call of the month in proportion to its price, so each site's
// and each customer's Claude cost drops by the same fraction. Spreading it
// evenly keeps the per-customer numbers fair; the totals are exact either way.
//
// ONLY CLAUDE: providers 'anthropic' and 'anthropic-batch'. TypeSafe, OpenAI,
// Cloudflare and DataForSEO are billed elsewhere and stay at full cost.
//
// FAILS CLOSED: if the calls cannot be read, no credit is applied and the
// page shows the full cost. Overstating cost is the safe mistake.
//
// If the perk changes or ends: CLAUDE_MONTHLY_CREDIT_USD (0 turns it off) and
// CLAUDE_CREDIT_SINCE (first month it applies, YYYY-MM).

const DEFAULT_MONTHLY_USD = 200;
const DEFAULT_SINCE = "2026-11";
const CLAUDE_PROVIDERS = ["anthropic", "anthropic-batch"];
const PAGE = 1000;

export function claudeCreditConfig(): { monthlyUsd: number; since: string } {
  const raw = process.env.CLAUDE_MONTHLY_CREDIT_USD;
  const n = raw == null || raw === "" ? DEFAULT_MONTHLY_USD : Number(raw);
  const since = /^\d{4}-\d{2}$/.test(process.env.CLAUDE_CREDIT_SINCE ?? "") ? (process.env.CLAUDE_CREDIT_SINCE as string) : DEFAULT_SINCE;
  return { monthlyUsd: Number.isFinite(n) && n > 0 ? n : 0, since };
}

export type ClaudeCredit = {
  monthlyUsd: number;
  /** Credit applied per project, USD: calls since `recentFrom`, and all time. */
  recentByProject: Map<string, number>;
  allByProject: Map<string, number>;
  /** Credit applied per UTC day (YYYY-MM-DD), USD. */
  byDay: Map<string, number>;
  recentUsd: number;
  allUsd: number;
};

type Row = { project_id: string; cost_microusd: number; created_at: string };

export async function claudeCredit(recentFromIso: string): Promise<ClaudeCredit | null> {
  const { monthlyUsd, since } = claudeCreditConfig();
  if (!monthlyUsd) return null;
  const rows: Row[] = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db()
        .from("model_calls")
        .select("project_id, cost_microusd, created_at")
        .in("provider", CLAUDE_PROVIDERS)
        .gt("cost_microusd", 0)
        .gte("created_at", `${since}-01T00:00:00Z`)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return null;
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < PAGE) break;
    }
  } catch {
    return null;
  }

  const monthSpend = new Map<string, number>();
  for (const r of rows) {
    const m = r.created_at.slice(0, 7);
    monthSpend.set(m, (monthSpend.get(m) ?? 0) + r.cost_microusd / 1e6);
  }
  const share = new Map<string, number>();
  for (const [m, spend] of monthSpend) share.set(m, spend > 0 ? Math.min(monthlyUsd, spend) / spend : 0);

  const recentFrom = Date.parse(recentFromIso);
  const out: ClaudeCredit = { monthlyUsd, recentByProject: new Map(), allByProject: new Map(), byDay: new Map(), recentUsd: 0, allUsd: 0 };
  const add = (map: Map<string, number>, k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v);
  for (const r of rows) {
    const credit = (r.cost_microusd / 1e6) * (share.get(r.created_at.slice(0, 7)) ?? 0);
    if (!credit) continue;
    add(out.allByProject, r.project_id, credit);
    add(out.byDay, r.created_at.slice(0, 10), credit);
    out.allUsd += credit;
    if (Date.parse(r.created_at) >= recentFrom) {
      add(out.recentByProject, r.project_id, credit);
      out.recentUsd += credit;
    }
  }
  return out;
}

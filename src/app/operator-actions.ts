"use server";

import { revalidatePath } from "next/cache";
import { dashboardAuth } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { markCronFixed } from "@/lib/cron-alerts";

// "Dismiss" on the operator's All sites strip (hosted Home). Same mechanism as
// the agent Home's "mark fixed" (markCronFixed: a synthetic ok row), but
// UNSCOPED - the strip spans every tenant plus the bare instance-wide jobs, so
// the active-project scoping in markCronFixedAction would refuse most lines.
// That is why the operator check is repeated here: a server action is callable
// directly, and without it any signed-in customer could silence every tenant's
// alerts. Honest by construction - the next failed run or missed window brings
// the line back.
//
// Operator-only telemetry, so no MCP counterpart (see autopilot/operator.ts):
// an MCP token is one tenant, and mark_cron_fixed already covers that scope.
export async function dismissOperatorIssue(job: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await dashboardAuth();
  if (!auth || !isOperator(auth.user?.id)) return { ok: false, error: "Not allowed." };
  try {
    await markCronFixed(job);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

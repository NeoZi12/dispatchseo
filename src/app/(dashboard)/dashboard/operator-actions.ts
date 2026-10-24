"use server";

import { revalidatePath } from "next/cache";
import { dashboardAuth } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import type { ActionState } from "@/components/ui/action-state";

// The operator's one write on the "All sites" strip: publish a held article
// after reading it, on any site. Gated on OPERATOR_USER_IDS server-side (the
// strip being hidden is presentation, not authorisation). The run is looked
// up by id with no project scope ON PURPOSE - that is the operator's whole
// job here - so the gate above is the only thing standing between a tenant
// and every other tenant's held runs, and it fails closed.
//
// No MCP counterpart: operator-only, cross-tenant, and an MCP token is one
// tenant (the tenant's own door is release_writer_run).

export async function operatorReleaseArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await dashboardAuth();
  if (!auth || !isOperator(auth.user?.id)) throw new Error("Unauthorized");
  const runId = String(fd.get("run_id") ?? "").trim();
  const projectId = String(fd.get("project_id") ?? "").trim();
  const at = Date.now();
  if (!runId || !projectId) return { ok: false, message: "Missing the article.", at };
  const [{ getWriterRun }, { releaseWriterRun }] = await Promise.all([import("@/lib/writer/runs"), import("@/lib/writer/stages")]);
  const run = await getWriterRun(projectId, runId);
  if (!run) return { ok: false, message: "That run no longer exists.", at };
  if (run.status !== "held") return { ok: false, message: "Already released.", at };
  try {
    await releaseWriterRun(run);
  } catch (e) {
    return { ok: false, message: `Couldn't release it: ${e instanceof Error ? e.message : String(e)}`, at };
  }
  revalidatePath("/dashboard");
  return { ok: true, message: "Released. It publishes in the next few minutes.", at };
}

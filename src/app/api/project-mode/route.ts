import { effectiveAutomations, getProjectByToken } from "@/lib/projects";
import { db } from "@/lib/db";
import pack from "@/lib/pipeline-pack.json";

// Whether a guide/tool build already completed today (UTC). The build
// workflows now run several scheduled attempts per day (05:00/12:00/19:00)
// so a failed morning self-heals by lunch; each attempt asks this flag and
// exits cleanly when the day's build is already done. Tolerant: any query
// error reads as "not built" - the workflows' own PR-open guard still
// prevents double-building, so a wrong "false" costs one no-op run, while a
// wrong "true" would silently skip a day.
async function builtToday(projectId: string): Promise<{ guide: boolean; tool: boolean }> {
  try {
    const utcMidnight = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
    const { data, error } = await db()
      .from("suggestions")
      .select("type")
      .eq("project_id", projectId)
      .eq("status", "done")
      .gte("completed_at", utcMidnight);
    if (error || !data) return { guide: false, tool: false };
    return {
      guide: data.some((r) => r.type === "guide"),
      tool: data.some((r) => r.type === "tool"),
    };
  } catch {
    return { guide: false, tool: false };
  }
}

// Tiny read endpoint for the project repos' CI. Before acting, workflows ask
// which automations this project has enabled: auto-merge checks
// automations.auto_merge, the builders check auto_build_guides /
// auto_build_tools. `mode` is the display label (semi | auto | custom); the
// flags are what to obey. Bearer token is the same per-project MCP token the
// workflows already hold - the token IS the tenant, so a project can only
// ever read its own mode.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const project = token ? await getProjectByToken(token) : null;
  if (!project) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({
    slug: project.slug,
    mode: project.mode,
    automations: effectiveAutomations(project),
    // Current pipeline-pack version (content hash). Connected repos compare
    // it against their installed .dispatchseo/pipeline-version stamp in the
    // daily seo-token-check workflow and report when an update is available.
    pipeline_version: (pack as { version?: string }).version ?? null,
    built_today: await builtToday(project.id),
  });
}

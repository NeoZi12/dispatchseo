import { effectiveAutomations, getProjectByToken } from "@/lib/projects";

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
  });
}

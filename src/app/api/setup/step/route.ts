import { after } from "next/server";
import { headers } from "next/headers";
import { dashboardAuth } from "@/lib/auth-gate";
import { getProjectBySlug } from "@/lib/projects";
import { ownedProjectIds } from "@/lib/tenant-guard";
import { requestOrigin } from "@/lib/request-origin";
import { captureServer } from "@/lib/posthog-server";
import { getSetupStep } from "@/lib/setup-path";

// The setup path's poll: GET /api/setup/step?slug=<slug>&last_step=<id>
// returns the ONE SetupStep in front of this project (setup-path-core.ts).
// The step card polls it every 5 s while `step.polls` is true.
//
// `/api/` bypasses the proxy's login gate, so this route authenticates
// itself, exactly like /api/onboarding/status: a signed-in session, and on
// cloud the slug must name a project THIS user owns (same generic 404 as an
// unknown slug - never confirm a foreign project exists).
//
// The only call site with `live: true` besides the MCP tool and the
// /onboarding render: the GitHub / Google reads it triggers are memoised 60 s
// per project in setup-path.ts. Side effects are limited to the loader's
// evidence write-throughs (met deferrals dropped, agent_credential_at
// backfilled, a confirmed guess saved) and one PostHog event per step change.

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const auth = await dashboardAuth();
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const slug = params.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });
  const project = await getProjectBySlug(slug);
  if (!project) return Response.json({ error: "unknown project" }, { status: 404 });
  const owned = await ownedProjectIds();
  if (owned && !owned.has(project.id)) {
    return Response.json({ error: "unknown project" }, { status: 404 });
  }

  const origin = requestOrigin(await headers());
  // mcpToken left undefined: the loader fetches the key only when the step is
  // agent_connect / chat_connect, whose paste payload IS the key.
  const step = await getSetupStep(project, origin, { live: true });

  // T11: one event per step CHANGE, not per poll. The client sends back the
  // id it is showing; a first load (no last_step) counts as a view.
  if (step.id !== params.get("last_step")) {
    const distinctId = auth.user?.id ?? project.id;
    after(() =>
      captureServer(distinctId, "setup_step_viewed", {
        step: step.id,
        phase: step.phase,
        kind: step.kind,
      }),
    );
  }

  return Response.json(step, { headers: { "Cache-Control": "no-store" } });
}

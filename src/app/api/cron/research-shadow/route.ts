import { checkCron } from "@/lib/cron-auth";
import { DEFAULT_PROJECT_ID, getProjectBySlug } from "@/lib/projects";
import { runResearch, type RunResearchOptions } from "@/lib/autopilot/research";
import { isCloudMode } from "@/lib/cloud";
import type { DataforseoCreds } from "@/lib/dataforseo";

// Operator-only: run the autopilot's keyword research for one site and
// WRITE NOTHING - no ideas queued, no refusals stored, no dead seeds, no
// research state, no last_research_at stamp. What comes back is the full
// ResearchOutcome with `added` = what the run WOULD have queued, every
// rung's counts, and the real DataForSEO + model cost. Built 2026-11-10 to
// measure research-v2 (RESEARCH_V2) against the v1 ladder on real sites
// before any default moves, and kept as the way to answer "what would
// research find for this site, and at what price" without touching it.
//
// The DataForSEO calls are real and billed to the OPERATOR's default project
// (the env DATAFORSEO_LOGIN pair, metered under DEFAULT_PROJECT_ID), never
// to the site's owner: a free owner's $0.30 month must not be spent by a
// measurement. Model calls land in model_calls under the site's project id
// like any research call (a few cents, under the credit).
//
// Not a cron: it lives under /api/cron for the CRON_SECRET gate and the
// proxy allowlist. No MCP counterpart on purpose - this is operator
// telemetry with no per-tenant state, nothing an agent should set or read.
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     "https://dispatchseo.com/api/cron/research-shadow?slug=easyrender&v2=1[&fresh=1]"

export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) return Response.json({ error: "slug is required" }, { status: 400 });
  const project = await getProjectBySlug(slug);
  if (!project) return Response.json({ error: `no project "${slug}"` }, { status: 404 });
  const v2Param = url.searchParams.get("v2");
  const opts: RunResearchOptions = { shadow: true };
  if (v2Param !== null) opts.v2 = v2Param === "1" || v2Param === "true";
  // &fresh=1: ignore the site's dead seeds, so a refill measures like a
  // first fill (every profile seed on the table), which is the free tier's
  // month-one cost.
  if (url.searchParams.get("fresh") === "1") opts.ignoreDead = true;
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return Response.json({ error: "DATAFORSEO_LOGIN/PASSWORD not set on this deploy" }, { status: 500 });
  const creds: DataforseoCreds = {
    login,
    password,
    billedTo: "own",
    meterProjectId: isCloudMode() ? DEFAULT_PROJECT_ID : undefined,
  };
  const started = Date.now();
  try {
    const outcome = await runResearch(project, new Date(), { ...opts, creds });
    return Response.json({ slug, project_id: project.id, v2: opts.v2 ?? "default", ms: Date.now() - started, outcome });
  } catch (e) {
    return Response.json({ slug, v2: opts.v2 ?? "default", ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { checkCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { getCronHealth, reportCronRun } from "@/lib/cron-alerts";
import { credsForProject } from "@/lib/dataforseo";
import { mergeToken } from "@/lib/github";
import { listProjects, fetchProjectToken, effectiveAutomations } from "@/lib/projects";

export const dynamic = "force-dynamic";

// The self-hosted builder's work feed. The Docker stack's `builder`
// container polls this with CRON_SECRET every few minutes and executes
// whatever comes back with headless Claude Code - the in-stack replacement
// for the GitHub-Actions schedules, which cannot phone home to a localhost
// backend. The SPLIT is deliberate: this route owns all scheduling brains
// (cadence, automation flags, readiness, claim-marking), the container is a
// dumb executor - so cadence fixes ship as backend deploys, never as
// "rebuild your builder image".
//
// Due-ness reads the same cron_runs log everything else uses: a job is due
// when its `builder-<wf>--<slug>` key hasn't logged a run inside its
// cadence window. Handing a job out logs a claim row (so the next poll
// doesn't hand it out again); the container then reports the real outcome
// through /api/cron/deploy-check under the same key, landing on the normal
// banner + email rails.

// Prompts mirror the pipeline-pack workflows verbatim - the agent behavior
// must not depend on which runner (GitHub or in-stack) executes it. The
// instructions themselves come from get_instructions at run time either way.
const PROMPTS: Record<string, string> = {
  research:
    "FIRST call the seo-manager MCP tool get_instructions with workflow research, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. Also read .dispatchseo/conventions.md for this repo's product-surface files. Cover the whole product (no topic filter). In brief: derive keyword candidates from product knowledge, validate them via the dataforseo MCP (or the free path the instructions describe when it is not connected), track winners via track_keywords, queue suggestions with propose_suggestion, then approve every queued idea - guides AND tools - via update_suggestion. (On semi-automatic projects the backend records agent approvals as pending for the owner to decide; the tool response says so and that counts as success, do not retry.) Honor the weekly quota, report the quota status and the instructions version, and output the two summary tables at the end. If get_instructions is unavailable, fail loudly and exit without changes.",
  "build-guide":
    "FIRST call the seo-manager MCP tool get_instructions with workflow build-guide, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. Also read .dispatchseo/conventions.md for this repo's site facts. In brief: take the oldest approved guide suggestion, mark it in_progress, build the guide MDX through the full pipeline (template, thin-content gate, draft, mandatory visuals, humanizer), run the repo's build to verify, open a PR labeled seo via gh, then update_suggestion to done with the PR url and log_page, and state the instructions version in the run report. Never build tool suggestions - those belong to the build-tool workflow. If get_instructions is unavailable, fail loudly and exit without changes; if there are no approved guide suggestions, exit cleanly without any changes.",
  "build-tool":
    "FIRST call the seo-manager MCP tool get_instructions with workflow build-tool, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. Also read .dispatchseo/conventions.md for this repo's site facts (registry wiring, reference implementation, theme tokens). In brief: take the oldest approved tool suggestion, mark it in_progress, read the reference implementation completely, pass the live SERP gate, run the THEME step, write the mandatory EXECUTION PLAN and hold it against the VALUE BAR - a re-skinned template or canned-output widget is a failure, redesign or set the suggestion back to pending. Then build, humanize all registry copy, run the repo's build to verify plus the funnel composition check, open a PR labeled seo and seo-tool via gh with the execution plan in the body, then update_suggestion to done with the PR url and log_page, and state the instructions version in the run report. Never build guide suggestions - those belong to the build-guide workflow. If get_instructions is unavailable, fail loudly and exit without changes; if there are no approved tool suggestions, exit cleanly without any changes.",
  "geo-scan":
    "FIRST call the seo-manager MCP tool get_instructions with workflow geo-scan, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. In brief: build ~15 customer questions from the tracked keywords and conventions, answer each with REAL web search (never from memory), judge whether the site is among the cited sources, record every result via record_ai_citations with verbatim answer excerpts, then read get_ai_visibility and report the citation counts and gap domains. If get_instructions is unavailable, fail loudly and exit without changes.",
};

// Cadence windows, in hours. Dailies use 20h (not 24) so a run that fired
// at 05:10 yesterday is already due at 05:00 today; weeklies use 6.5 days
// for the same slack. The instructions' own gates (pacing, built-today,
// empty queue) make an extra attempt a cheap no-op, never a double build.
const CADENCE_HOURS: Record<string, number> = {
  research: 156,
  "build-guide": 20,
  "build-tool": 20,
  "geo-scan": 156,
};

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  type Job = {
    key: string;
    workflow: string;
    slug: string;
    repo: string;
    mcp_token: string;
    prompt: string;
    dataforseo: { login: string; password: string } | null;
  };
  const jobs: Job[] = [];
  const mergeSweeps: Array<{ slug: string; repo: string; mcp_token: string }> = [];

  const projects = await listProjects();
  for (const p of projects) {
    // Builder only serves installed pipelines - mid-wizard projects wait,
    // exactly like the crons' setup gates.
    if (!p.github_repo || !p.pipeline_installed_at) continue;
    const token = await fetchProjectToken(p.id);
    if (!token) continue;
    const flags = effectiveAutomations(p);

    // Health once per project; due-ness = no run row inside the window.
    const health = await getCronHealth(p.slug);
    const lastRun = (wf: string) => {
      const row = health.find((h) => h.job === `builder-${wf}--${p.slug}`);
      return row ? new Date(row.last_run_at).getTime() : 0;
    };
    const due = (wf: string) =>
      Date.now() - lastRun(wf) > CADENCE_HOURS[wf] * 3_600_000;

    const wanted: string[] = [];
    if (due("research")) wanted.push("research");
    if (flags.auto_build_guides && due("build-guide")) wanted.push("build-guide");
    if (flags.auto_build_tools && due("build-tool")) {
      // Tool runs only when there is something to build - a scheduled
      // no-op still costs a full Claude session, unlike the other gates.
      const { count } = await db()
        .from("suggestions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", p.id)
        .eq("type", "tool")
        .eq("status", "approved");
      if ((count ?? 0) > 0) wanted.push("build-tool");
    }
    if (due("geo-scan")) wanted.push("geo-scan");

    for (const wf of wanted) {
      const key = `builder-${wf}--${p.slug}`;
      // Claim: log the hand-out so the next poll skips it. The container
      // overwrites this with the real outcome via deploy-check reporting.
      await reportCronRun(key, { claimed: "builder", handed_out: true }, false);
      jobs.push({
        key,
        workflow: wf,
        slug: p.slug,
        repo: p.github_repo,
        mcp_token: token,
        prompt: PROMPTS[wf],
        dataforseo: await credsForProject(p),
      });
    }

    // Auto-mode publishing: the container sweeps green seo-labeled guide
    // PRs every tick (cheap gh calls, no Claude session), replacing
    // seo-auto-merge.yml's green-checks gate for instances GitHub cannot
    // call back into.
    if (flags.auto_merge) {
      mergeSweeps.push({ slug: p.slug, repo: p.github_repo, mcp_token: token });
    }
  }

  // The wizard's one-tap-merge token (repo scope) doubles as the builder's
  // git identity - clone, push, PR, merge. Served from here so the owner
  // never configures GitHub twice; a BUILDER_GH_TOKEN env on the container
  // overrides it.
  return Response.json({
    poll_seconds: 600,
    gh_token: (await mergeToken()) ?? null,
    jobs,
    merge_sweeps: mergeSweeps,
  });
}

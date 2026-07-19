// Centrally-served agent instructions - the "brain" every connected repo
// fetches at run time via the get_instructions MCP tool. The user's repo
// keeps only a thin shim (GitHub workflows + secrets + a .dispatchseo/
// conventions.md with site facts); the pipelines, quality bar, and policies
// live HERE, so improving them updates every project's next run with zero
// repo churn. Same serve-content-from-the-backend pattern as the backlink
// playbook (playbook-data.ts).
//
// Versioning: bump INSTRUCTIONS_VERSION on every meaningful edit (date.rev).
// Runs report the version they built under, so a weird page can be traced to
// the instruction set that produced it.

import type { Project } from "@/lib/projects";
import { getPacing, type Pacing } from "@/lib/pacing";
import {
  normalizeContentPrefs,
  renderGuidePrefsNote,
  renderToolPrefsNote,
} from "@/lib/content-prefs";
import { CORE } from "./core";
import { INSTALL, INSTALL_STEPS } from "./install";
import { SETUP, SETUP_STEPS } from "./setup";
import { RESEARCH, RESEARCH_STEPS } from "./research";
import { BUILD_GUIDE, BUILD_GUIDE_STEPS } from "./build-guide";
import { BUILD_TOOL, BUILD_TOOL_STEPS } from "./build-tool";
import { REPORT, REPORT_STEPS } from "./report";
import { BACKLINKS, BACKLINKS_STEPS } from "./backlinks";
import { TREND_SCAN, TREND_SCAN_STEPS } from "./trend-scan";
import { TREND_EXPAND, TREND_EXPAND_STEPS } from "./trend-expand";
import { GEO_SCAN, GEO_SCAN_STEPS } from "./geo-scan";

export const INSTRUCTIONS_VERSION = "2026-07-19.6";

export const WORKFLOWS = [
  "install",
  "setup",
  "research",
  "trend-scan",
  "trend-expand",
  "build-guide",
  "build-tool",
  "report",
  "backlinks",
  "geo-scan",
] as const;

export type WorkflowName = (typeof WORKFLOWS)[number];

export const WORKFLOW_SUMMARIES: Record<WorkflowName, string> = {
  install:
    "One-time, first: fetch the pipeline pack via get_pipeline_pack, adapt it to the repo's stack, set the Actions secrets, open the install PR, continue into setup, then kick off the first research run so the queue fills day one",
  setup:
    "One-time: find or create the site's content home, inspect the repo, write .dispatchseo/conventions.md (the site facts), personalize the site profile",
  research:
    "Weekly: derive keyword candidates from product knowledge, validate, fill the queue to quota",
  "trend-scan":
    "On demand (Scan now): sweep the niche for the subjects being talked about right now and put them on the radar - topics only, no guide ideas",
  "trend-expand":
    "On demand (Get takes): turn one owner-picked radar subject into 3-5 validated guide angles, queued as pending",
  "build-guide":
    "Daily: build the guide at the top of the owner's queue into a merge-ready PR",
  "build-tool":
    "On approval/weekly: build the tool at the top of the owner's queue into a merge-ready PR",
  report: "On demand: rank + traffic summary with next actions",
  backlinks: "On demand: prospect backlink targets for a keyword or competitor",
  "geo-scan":
    "Weekly: sample the questions customers ask AI assistants on the owner's own subscription, record which answers cite the site, surface the domains cited instead",
};

// Plain-English pipelines for the dashboard's Instructions page - each entry
// lives next to its workflow's markdown so they stay in sync.
export type WorkflowStep = { title: string; plain: string };
export const WORKFLOW_STEPS: Record<WorkflowName, WorkflowStep[]> = {
  install: INSTALL_STEPS,
  setup: SETUP_STEPS,
  research: RESEARCH_STEPS,
  "trend-scan": TREND_SCAN_STEPS,
  "trend-expand": TREND_EXPAND_STEPS,
  "build-guide": BUILD_GUIDE_STEPS,
  "build-tool": BUILD_TOOL_STEPS,
  report: REPORT_STEPS,
  backlinks: BACKLINKS_STEPS,
  "geo-scan": GEO_SCAN_STEPS,
};

const BODIES: Record<WorkflowName, string> = {
  install: INSTALL,
  setup: SETUP,
  research: RESEARCH,
  "trend-scan": TREND_SCAN,
  "trend-expand": TREND_EXPAND,
  "build-guide": BUILD_GUIDE,
  "build-tool": BUILD_TOOL,
  report: REPORT,
  backlinks: BACKLINKS,
  "geo-scan": GEO_SCAN,
};

// Workflows whose text embeds the live pacing verdict (one guide per day,
// pacing.ts). Only these pay the extra pages query at render time.
const PACED_WORKFLOWS: WorkflowName[] = ["build-guide", "research"];

// Every response is self-contained: shared core + the workflow body, with the
// project's own name/domain/repo - and, for paced workflows, the live pacing
// verdict - interpolated so the text needs no further templating on the
// agent side.
export async function renderInstructions(workflow: WorkflowName, project: Project) {
  const pacing: Pacing | null = PACED_WORKFLOWS.includes(workflow)
    ? await getPacing(project)
    : null;
  // The owner's onboarding answer to "does the site have a blog?", rendered
  // for the setup workflow's Part 1 (which reconciles it against the repo).
  const contentHint =
    project.content_mode === "existing"
      ? `"Yes, we have one"${project.content_path_hint ? ` (owner's hint: ${project.content_path_hint})` : ""}`
      : project.content_mode === "create"
        ? '"Not yet - create one for me"'
        : '"Not sure - inspect the repo and decide"';
  // Owner template controls from the Instructions page (content-prefs.ts) -
  // substituted here so the very next run obeys a just-saved preference.
  const prefs = normalizeContentPrefs(project.content_prefs);
  const raw = `${CORE}\n${BODIES[workflow]}`;
  let markdown = raw
    .replaceAll("{{SITE_NAME}}", project.name)
    .replaceAll("{{DOMAIN}}", project.domain)
    .replaceAll("{{REPO}}", project.github_repo ?? "the project repo")
    .replaceAll("{{CONTENT_HINT}}", contentHint)
    .replaceAll("{{OWNER_PREFS_GUIDE}}", renderGuidePrefsNote(prefs))
    .replaceAll("{{OWNER_PREFS_TOOL}}", renderToolPrefsNote(prefs));
  if (pacing) {
    markdown = markdown.replaceAll("{{PACING_NOTE}}", pacing.note);
  }
  return {
    version: INSTRUCTIONS_VERSION,
    workflow,
    summary: WORKFLOW_SUMMARIES[workflow],
    ...(pacing ? { pacing } : {}),
    markdown,
  };
}

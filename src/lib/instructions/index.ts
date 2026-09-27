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
import { hasDataforseo } from "@/lib/pipeline-pack";
import { isCloudMode } from "@/lib/cloud";
import { platformDataforseoEnv } from "@/lib/dataforseo-usage";
import { getPacing, type Pacing } from "@/lib/pacing";
import {
  normalizeContentPrefs,
  renderGuidePrefsNote,
  renderToolPrefsNote,
} from "@/lib/content-prefs";
import { CORE, CORE_TAIL, RESEARCH_QUALITY_BAR } from "./core";
import { internalLinkingEnabled } from "@/lib/projects";
import { marketLabel } from "@/lib/market";
import {
  INSTALL,
  INSTALL_STEPS,
  AGENT_CREDENTIAL_STEP,
  AGENT_CREDENTIAL_BRIEF,
  AGENT_SMOKE_NOTE,
} from "./install";
import { projectAgent, type AgentId } from "@/lib/agents";

// geo-scan attribution: what the agent passes as record_ai_citations' engine.
// Keyed by AgentId so a new agent must decide its engine at compile time. The
// values are INSTRUCTION TEXT spliced into the geo-scan playbook, not bare
// enum members - which is what lets Cursor's entry be honest: Cursor is
// model-agnostic (`--model gpt-5` and `--model sonnet-4-thinking` are both
// normal), so no fixed value can be right, and a hardcoded one would silently
// misattribute every Cursor project's AI-visibility data. Its entry tells the
// running agent to answer from the model it is actually using - the one fact
// only the run itself knows.
const AGENT_ENGINE: Record<AgentId, string> = {
  claude: "`claude`",
  codex: "`chatgpt`",
  cursor:
    "`claude`, `chatgpt`, or `gemini` - whichever family the model THIS run " +
    "is executing on belongs to (Cursor is model-agnostic, so answer from " +
    "your own model, not from the agent's name)",
};
import { SETUP, SETUP_STEPS } from "./setup";
import { RESEARCH, RESEARCH_STEPS } from "./research";
import {
  BUILD_GUIDE,
  BUILD_GUIDE_STEPS,
  BACKLINKS_STEP_ON,
  BACKLINKS_STEP_OFF,
  COVER_STEP_ON,
  COVER_STEP_OFF,
  COVER_SHIP_CHECK_ON,
  COVER_SHIP_CHECK_OFF,
} from "./build-guide";
import { BUILD_TOOL, BUILD_TOOL_STEPS } from "./build-tool";
import { REPORT, REPORT_STEPS } from "./report";
import { BACKLINKS, BACKLINKS_STEPS } from "./backlinks";
import { TREND_SCAN, TREND_SCAN_STEPS } from "./trend-scan";
import { TREND_EXPAND, TREND_EXPAND_STEPS } from "./trend-expand";
import { GEO_SCAN, GEO_SCAN_STEPS } from "./geo-scan";
import { CHAT_CORE } from "./chat-core";
import { WRITE_GUIDE_CHAT, WRITE_GUIDE_CHAT_STEPS } from "./write-guide-chat";
import { SETUP_CHAT, SETUP_CHAT_STEPS } from "./setup-chat";
import { RESEARCH_CHAT, RESEARCH_CHAT_STEPS } from "./research-chat";

export const INSTRUCTIONS_VERSION = "2026-09-27.1";

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
  // Chat playbooks: same job, written for Claude.ai or ChatGPT rather than a
  // coding agent. They carry CHAT_CORE instead of CORE - see CHAT_WORKFLOWS.
  "setup-chat",
  "research-chat",
  "write-guide-chat",
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
  "setup-chat":
    "One-time, with the owner present: read the site summary, ask three questions (who buys, what never to say, how it should sound), and save the answers as standing writing rules",
  "research-chat":
    "On demand: turn what the business actually does into a handful of defensible ideas, checked against real numbers where we have them, and queue them for approval",
  "write-guide-chat":
    "Per article: take the top approved idea, find what the current results miss, write it, self-check it, and hand it in with submit_article",
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
  "setup-chat": SETUP_CHAT_STEPS,
  "research-chat": RESEARCH_CHAT_STEPS,
  "write-guide-chat": WRITE_GUIDE_CHAT_STEPS,
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
  "setup-chat": SETUP_CHAT,
  "research-chat": RESEARCH_CHAT,
  "write-guide-chat": WRITE_GUIDE_CHAT,
};

// Workflows served to a chat app rather than a coding agent. They get
// CHAT_CORE in place of CORE + CORE_TAIL: the standard preamble is 21KB and
// opens by telling the reader to go and read a file at the repository root,
// which a chat model can neither afford nor do.
const CHAT_WORKFLOWS: WorkflowName[] = ["setup-chat", "research-chat", "write-guide-chat"];

// Workflows whose text embeds the live pacing verdict (one guide per day,
// pacing.ts). Only these pay the extra pages query at render time.
const PACED_WORKFLOWS: WorkflowName[] = ["build-guide", "research", "write-guide-chat"];

// Workflows that actually VET keywords, and therefore receive the keyword
// half of the quality bar (volume bands, dynamic KD ceiling, authority gate,
// SERP budget, topic remit, audience fit). See RESEARCH_QUALITY_BAR's comment
// in core.ts for why builders are excluded rather than merely trimmed.
//
// `install` and `setup` are here because both END by kicking off the first
// research run in the same session (install step: "then kick off the first
// research run so the queue fills day one") - that run vets keywords, so the
// session needs the bar. Getting this list wrong in the safe direction costs
// tokens; getting it wrong in the unsafe direction would let a run queue
// keywords without the gate, so anything that can reach propose_suggestion
// on a fresh candidate is included.
const KEYWORD_VETTING_WORKFLOWS: WorkflowName[] = [
  "research",
  "trend-scan",
  "trend-expand",
  "install",
  "setup",
  // research-chat deliberately absent: it carries its own short-form version
  // of this bar (see the file). The full one is ten pages of prose written
  // for an agent with a large window, and sending it to a chat client would
  // spend more of the session on the policy than on the research.
];

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
  // Whether THIS repo has its own DataForSEO MCP wired in (an account of its
  // own, or the default project's env fallback) - see get_project's
  // dataforseo_repo_mcp field. A cloud project on the bundled plan has
  // DataForSEO-backed data through the seo-manager MCP (check_serp,
  // get_domain_rank) but no repo-side DataForSEO server of its own.
  const dataforseoRepoMcp = hasDataforseo(project);
  // A bundled-plan cloud project has NO DataForSEO server in its own repo, but
  // the backend still has DataForSEO through the platform account - so the
  // seo-manager MCP's `keyword_ideas` tool serves it real volume/KD (metered
  // against the project's monthly budget).
  //
  // This is a CAPABILITY check (stable), deliberately NOT the live
  // credsForProject spend gate. Keying the note off credsForProject made a
  // single transient null - a plan/budget DB read blipping, the monthly budget
  // momentarily spent, or (as seen in testing) platform env still propagating
  // mid-deploy - silently flip the ENTIRE run to the data-less branch, so the
  // agent never called keyword_ideas and the queue came back with no
  // volume/KD. keyword_ideas itself returns empty-with-note at the cap and the
  // note already covers that fallback, so the instruction should always tell a
  // bundled project the tool is there. Pure env + mode reads - no DB, nothing
  // to blip.
  const platformDataforseo =
    !dataforseoRepoMcp && isCloudMode() && platformDataforseoEnv() != null;
  const researchSourceNote = dataforseoRepoMcp
    ? "- This project has its own DataForSEO account wired into the DataForSEO MCP - use it " +
      "(volume, KD, keyword ideas, live SERPs, backlinks endpoints)."
    : platformDataforseo
    ? "- This project is on the platform's BUNDLED DataForSEO plan: it has NO DataForSEO server " +
      "in its own repo, but the seo-manager MCP gives you the data server-side. For volume + KD " +
      "numbers call the seo-manager MCP's `keyword_ideas` tool (real DataForSEO search volume " +
      "and keyword difficulty; batch your seeds - each call is metered against the project's " +
      "monthly budget). Pair it with `check_serp` (live organic results) for the SERP-weakness " +
      "read, and `suggest_keywords` (free Google Autocomplete) to widen seeds. Pass the volume " +
      "and kd from `keyword_ideas` straight into `propose_suggestion` so the queue shows real " +
      "numbers. If `keyword_ideas` returns an empty list with a note (budget spent), fall back " +
      "to the SERP-weakness + best-answer tests and never invent numbers."
    : "- Use the seo-manager MCP's built-in `check_serp` (live organic results through the " +
      "project's configured provider) and `suggest_keywords` (Google Autocomplete expansion). " +
      "Without a directly-connected DataForSEO account there is no volume/KD data - the quality " +
      "bar's SERP-weakness test and the best-answer test carry the decision instead, and you " +
      "never invent numbers to fill the gap.\n" +
      "- FREE / GSC-only fallback (no SERP provider): if `check_serp` also returns nothing - a " +
      "GSC-only project with no SerpApi/DataForSEO - you have ONLY product knowledge + " +
      "`suggest_keywords` autocomplete. That is still enough: the volume floor and KD ceiling " +
      "are DATA-GATES and are simply inapplicable when the data does not exist (never treat " +
      "'no data' as 'failed the bar'). Derive your best candidates from the product surface and " +
      "autocomplete, and QUEUE them build-first (`propose_suggestion` then `update_suggestion` " +
      "approved) with a rationale naming the searcher's intent class and ICP fit - the owner " +
      "reviews the finished PR. A fresh free-mode site's queue legitimately comes from product " +
      "knowledge; NEVER report an empty week just because volume/SERP data was unavailable. " +
      "(Data-backed modes still apply every gate - this fallback is only for the genuinely " +
      "data-less case.)";
  // Keyword-vetting policy goes only to runs that vet keywords. A builder
  // works an already-approved idea it is forbidden to re-rank, so those
  // tables were never actionable in a build - just tokens re-sent on every
  // turn. Empty string (not a pointer) for builders: a dangling "see the
  // research instructions" would invite a wasted get_instructions call.
  const researchBar = KEYWORD_VETTING_WORKFLOWS.includes(workflow)
    ? RESEARCH_QUALITY_BAR
    : "";
  // The back-link step edits pages the owner ALREADY published, so it is
  // gated on an explicit per-project opt-in (internal_linking). When it is
  // off - the default, and the state of most projects - the playbook carries
  // a one-line note instead of ~60 lines of policy the run must not act on.
  // internalLinkingEnabled() resolves absence to OFF, matching the DB
  // fallback tiers, so a pre-0045 database renders the skip note rather than
  // throwing.
  const backlinksStep = internalLinkingEnabled(project)
    ? BACKLINKS_STEP_ON
    : BACKLINKS_STEP_OFF;
  // Covers are a disable-list entry, so ON is what every project gets until
  // the owner says otherwise (including every row written before the block
  // existed - absence means "on", which is the whole reason prefs are stored
  // as disable-lists). OFF swaps the ~45-line cover step for a five-line note,
  // so an owner who doesn't want covers stops paying for the instructions too.
  const coversOn = !prefs.disabled_blocks.includes("cover");
  const raw = CHAT_WORKFLOWS.includes(workflow)
    ? `${CHAT_CORE}\n${BODIES[workflow]}`
    : `${CORE}${CORE_TAIL}\n${BODIES[workflow]}`;
  let markdown = raw
    .replaceAll("{{RESEARCH_QUALITY_BAR}}", researchBar)
    .replaceAll("{{BACKLINKS_STEP}}", backlinksStep)
    .replaceAll("{{COVER_STEP}}", coversOn ? COVER_STEP_ON : COVER_STEP_OFF)
    .replaceAll("{{COVER_SHIP_CHECK}}", coversOn ? COVER_SHIP_CHECK_ON : COVER_SHIP_CHECK_OFF)
    .replaceAll("{{SITE_NAME}}", project.name)
    .replaceAll("{{DOMAIN}}", project.domain)
    .replaceAll("{{REPO}}", project.github_repo ?? "the project repo")
    .replaceAll("{{CONTENT_HINT}}", contentHint)
    .replaceAll("{{OWNER_PREFS_GUIDE}}", renderGuidePrefsNote(prefs))
    .replaceAll("{{OWNER_PREFS_TOOL}}", renderToolPrefsNote(prefs))
    .replaceAll("{{RESEARCH_SOURCE_NOTE}}", researchSourceNote)
    // "France · French" - the keyword tools follow the project's market on
    // their own, but a run that is never TOLD the market writes its queries
    // in English and validates them against another country's results.
    .replaceAll("{{MARKET}}", marketLabel(project.location_code, project.language_code));
  // Agent-conditional pieces, resolved from the PROJECT - the same run-time
  // resolution the workflows use. Before this, the install playbook had one
  // credential branch and it was Claude's: a Codex install (setup.sh codex is
  // a shipped invocation) was walked through minting a Claude token the
  // pipeline would never read. The rest of every playbook is agent-neutral by
  // design; keep it that way and route any new agent-specific instruction
  // through a placeholder here.
  {
    const agent = projectAgent(project);
    markdown = markdown
      .replaceAll("{{AGENT_NAME}}", agent.displayName)
      .replaceAll("{{AGENT_CLI}}", agent.cli)
      .replaceAll("{{AGENT_SECRET_NAME}}", agent.credential.repoSecretName)
      .replaceAll("{{AGENT_CREDENTIAL_STEP}}", AGENT_CREDENTIAL_STEP[agent.id])
      .replaceAll("{{AGENT_CREDENTIAL_BRIEF}}", AGENT_CREDENTIAL_BRIEF[agent.id])
      .replaceAll("{{AGENT_SMOKE_NOTE}}", AGENT_SMOKE_NOTE[agent.id])
      // geo-scan attribution: `chatgpt` is AGENT_ENGINES' name for the GPT
      // family, which is what a Codex run's answers actually are. Hardcoding
      // `claude` here silently attributed GPT answers to Claude in the
      // AI-visibility chart, with no backfill path. Cursor's value is a
      // decide-from-your-model instruction, not a fixed engine - see the map.
      .replaceAll("{{AGENT_ENGINE}}", AGENT_ENGINE[agent.id]);
    // The agent-conditional TEXT carries project tokens of its own - both
    // credential steps end with `gh secret set … --repo {{REPO}}` - and it is
    // spliced in AFTER the pass above already resolved those. So every install
    // playbook ever served handed the agent that command with a literal
    // "{{REPO}}" in it: the single most important secret in the pipeline, set
    // against a repo name that doesn't exist. Re-resolve the identity tokens
    // over the freshly-spliced text. Idempotent by construction - a second pass
    // over already-substituted markdown finds nothing left to match.
    markdown = markdown
      .replaceAll("{{SITE_NAME}}", project.name)
      .replaceAll("{{DOMAIN}}", project.domain)
      .replaceAll("{{REPO}}", project.github_repo ?? "the project repo");
  }
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

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { db } from "@/lib/db";
import { joinWaitlist } from "@/lib/waitlist";
import { getActivityReport } from "@/lib/activity";
import { getCronHealth, markCronFixed } from "@/lib/cron-alerts";
import { instanceSettings } from "@/lib/dashboard-auth";
import { buildsActive } from "@/lib/builder-status";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { getJourney } from "@/lib/journey";
import { getWeeklyProgress } from "@/lib/progress";
import { getBriefing } from "@/lib/briefing";
import { AUTOMATIONS, gatherEvidence } from "@/lib/automations";
import { credsForProject, keywordSuggestions, relatedKeywords, type KeywordIdea } from "@/lib/dataforseo";
import { MARKETS } from "@/lib/market";
import { setProjectMarket } from "@/lib/market-store";
import { isCloudMode } from "@/lib/cloud";
import { builderAgentToken, canMerge, dispatchToolBuild, mergePr, openSeoPrs, verifyPipelinePrereqs } from "@/lib/github";
import {
  indexingBrowserCommand,
  indexingQueue,
  type IndexingPageRow,
} from "@/lib/indexing";
import { CHANGELOG, LATEST } from "@/lib/changelog";
import {
  isFeedbackAdminUser,
  listFeedback,
  setFeedbackHidden,
  setFeedbackStatus,
  setVote,
  submitFeedback,
} from "@/lib/feedback";
import { browserCommand, resolveField } from "@/lib/playbook";
import { FREE_BACKLINKS, PAID_BACKLINKS, PLAYBOOK_RESEARCHED } from "@/lib/playbook-data";
import { loadConventions, saveConventions } from "@/lib/conventions";
import {
  GUIDE_ARCHETYPES,
  GUIDE_BLOCKS,
  HOUSE_RULES_MAX,
  normalizeContentPrefs,
} from "@/lib/content-prefs";
import { saveContentPrefs } from "@/lib/content-prefs-store";
import { renderInstructions, WORKFLOWS } from "@/lib/instructions";
import { getPipelinePack, hasDataforseo } from "@/lib/pipeline-pack";
import { effectiveAutomations, getProjectByToken, internalLinkingEnabled, publishTarget, type Project } from "@/lib/projects";
import { BUILDER_AGENT_IDS, builderAgents, projectAgent } from "@/lib/agents";
import { setProjectAgent } from "@/lib/agent-settings";
import { loadSiteProfile } from "@/lib/site-profile";
import { clientKindStore, currentClientKind, currentProject, projectStore } from "@/lib/mcp-context";
import { duplicateNote, findDuplicateSuggestion, isDuplicateKeyError } from "@/lib/suggestion-dedupe";
import { fetchProjectUrl, isProjectUrl } from "@/lib/url-guard";
import { isLive, refreshPageLiveness, type LivenessRow } from "@/lib/page-liveness";
import { AGENT_ENGINES, getAiVisibility, recordAiSnapshots } from "@/lib/ai-visibility";
import { sortByBestPosition, sortQueue } from "@/lib/metrics";
import { placeAtFront, writeQueueOrder } from "@/lib/queue";
import {
  compareToCorpus,
  CORPUS_SIZE,
  extractFromHtml,
  extractFromMarkdown,
  tokenize,
} from "@/lib/similarity";
import { buildBrief } from "@/lib/build-brief";
import { checkBuildPr } from "@/lib/build-pr-guard";
import { requestTrendExpand, requestTrendScan } from "@/lib/trends";
import { serpProviderForProject, providerOrganic } from "@/lib/serp";
import { gscAccessProbe } from "@/lib/gsc";
import { setTrackedProperty } from "@/lib/gsc-oauth";
import { expandKeyword } from "@/lib/suggest";
import {
  checkSerpDailyCapReached,
  KEYWORD_IDEAS_DAILY_CAP,
  keywordIdeasDailyCapReached,
  platformUsageStatus,
  recordCheckSerpCall,
  recordKeywordIdeasCall,
} from "@/lib/dataforseo-usage";
import { getDomainRating } from "@/lib/domain-rating";
import { getAuthority, needsLinkMove } from "@/lib/authority";
import { validateArticle } from "@/lib/article-validate";
import { enqueue } from "@/lib/jobs";
import { blockedReason, publishDraftNow, publishRoute } from "@/lib/job-handlers/draft-status";

// The seo-manager MCP server. It is mostly a door to the Supabase state - the
// suggestions queue, tracked keywords, published pages, GSC stats, and backlink
// prospects - plus two thin research primitives (check_serp, suggest_keywords)
// that route through the project's own keyword_source so free-mode projects
// work without DataForSEO. It does NOT generate content; the agent does the
// thinking, and DataForSEO-mode agents can still use DataForSEO's own MCP for
// deep research. Streamable HTTP transport (no SSE, no Redis) so it works in
// Claude Code, Codex, and Cursor.
//
// Dashboard parity: the MCP and the dashboard are the same product through two
// doors. Every screen has a read tool (get_overview, get_activity,
// get_automations, get_next_actions, get_playbook) that calls the SAME lib
// module the page renders from, and every dashboard action a user could ask
// their agent to do has a write tool (update_suggestion, merge_pr,
// set_playbook_status, update_backlink_prospect, mark_indexing_requested,
// reorder_queue, build_suggestion_now (tools only - guides always ship at
// the publishing pace), trigger_trend_scan, expand_trend_topic,
// set_content_prefs, set_market, mark_cron_fixed). Owner-gated
// moves (approve/reject/restore, tool build now,
// the trend buttons) share their logic with the dashboard actions via
// lib/queue.ts and lib/trends.ts, and are unlocked over MCP by
// decided_by:'owner' / the tool descriptions' "only when the owner asked in
// this conversation" contract - the same honor system as propose_suggestion's
// source:'manual'. The deliberate exceptions stay dashboard-only: credential
// entry (secrets don't belong in MCP traffic), project create/delete/switch
// (the bearer token IS the project, so there is nothing to switch), and
// mode/automation toggles (the same token drives autonomous CI runs, and a
// confused agent must not be able to switch off its own approval gate).
//
// Multi-project: the bearer token IS the tenant. authed() resolves it to a
// project row and every tool below scopes its queries to that project, so one
// server serves every site and a token can never touch another site's rows.
//
// The file lives at api/[transport] with basePath "/api", which resolves the
// connectable URL to /api/mcp (transport = "mcp"), matching the spec.

// Every tool returns its data as pretty-printed JSON text. MCP clients read the
// text block; keeping it JSON means the agent gets structured data to reason on.
function ok(data: unknown) {
  // Chat clients get it minified. Pretty-printing costs roughly 40% more
  // tokens for indentation nobody reads - which is free on a coding agent's
  // window and expensive on a $20 chat plan that has to fit the research, the
  // article and the tool traffic in one conversation.
  const text =
    currentClientKind() === "chat" ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

/** True when the caller is a chat app rather than a coding agent. Read at the
 *  point of use so a tool can trim its own answer. */
function chatMode(): boolean {
  return currentClientKind() === "chat";
}
function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}

// A failure that carries structured detail the caller is expected to act on -
// the article gate's per-check `fix` lines, mostly. Same shape as fail(), one
// object merged in, so a client that only reads `error` still sees a sentence.
// Minified for chat clients for the same reason ok() is - the rejection
// payload is the answer a chat model reads most often.
function failWith(message: string, detail: Record<string, unknown>) {
  const payload = { error: message, ...detail };
  const text =
    currentClientKind() === "chat" ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  return {
    isError: true,
    content: [{ type: "text" as const, text }],
  };
}

// How many articles one site may hand in per UTC day, and how many may be
// waiting to go out at once.
//
// Neither number is about our costs - the finisher calls no model, so an
// article costs us a fraction of a cent. They are about the owner. A chat
// client that loops, or an enthusiastic session that writes six articles in
// an afternoon, publishes a week of content in a day; that is the pattern
// search engines read as a scaled-content site, and it is the exact failure
// this product exists to avoid. Five a day is already far above the one-a-day
// pace the builders keep, so the cap only ever catches a runaway.
const SUBMIT_DAILY_CAP = 5;
const SUBMIT_IN_FLIGHT_CAP = 3;

/** Null when this site may accept another article, or the sentence explaining
 *  why not. Two counts, one round trip each, only on the accepted path. */
async function submissionCaps(projectId: string): Promise<string | null> {
  const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const LIVE = ["submitted", "accepted", "blocked_setup", "finished", "published"];
  const [{ count: todayCount }, { count: inFlight }] = await Promise.all([
    db()
      .from("article_drafts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("created_at", startOfDay)
      .in("status", LIVE),
    db()
      .from("article_drafts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", ["submitted", "accepted"]),
  ]);
  if ((todayCount ?? 0) >= SUBMIT_DAILY_CAP) {
    return (
      `This site has already taken ${SUBMIT_DAILY_CAP} articles today, which is its daily limit; it resets at UTC midnight. ` +
      "Publishing faster than this reads as bulk-generated content to search engines, which costs the site more than the extra articles are worth. Nothing was lost - hand this one in tomorrow."
    );
  }
  if ((inFlight ?? 0) >= SUBMIT_IN_FLIGHT_CAP) {
    return (
      `This site already has ${SUBMIT_IN_FLIGHT_CAP} articles waiting to be published, which is the limit. ` +
      "Call get_drafts to see them. Once one goes live there is room for another."
    );
  }
  return null;
}

// The last path segment of a published page's URL. The pages table stores full
// URLs, not slugs, and the article gate compares slugs - deriving one here
// beats adding a column that would need backfilling on every existing site.
function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  } catch {
    return "";
  }
}

// keyword_ideas (2026-07-30 rewrite): each expanded seed now costs 2 metered
// DataForSEO calls (keyword_suggestions + related_keywords) instead of the
// old 1-call-for-all-seeds shape, so cap how many seeds a single tool call
// actually expands rather than trusting every caller to self-limit.
const KEYWORD_IDEAS_SEED_CAP = 5;

// How much research one note may carry. 64KB is roughly 10,000 words: room for
// a real SERP analysis, an outline and a page of numbers, and not room for
// three competitor articles pasted in whole - which is the actual failure mode
// this bounds, because the next session pays to read whatever is stored here.
const MAX_RESEARCH_NOTES_CHARS = 64_000;

// WHAT A CHAT CLIENT SEES. Claude.ai and ChatGPT pay for every tool schema on
// every request: the full surface is ~64 tools and ~64KB of JSON schema, which
// is most of a $20 plan's context spent before the model has read a word of
// the site. These are the ones a chat session actually needs to research,
// write and hand in an article. Everything else (the repo pipeline, the
// backlink playbook, trends, feedback, install) belongs to a coding agent that
// has the window for it.
//
// Names not registered yet are simply skipped, so a name may be added here
// before its tool exists.
const CHAT_TOOLS = new Set([
  "get_instructions",
  "get_overview",
  "get_project",
  "get_site_profile",
  "set_site_profile",
  "get_conventions",
  "set_conventions",
  "get_site_digest",
  "get_build_brief",
  "check_serp",
  "keyword_ideas",
  "suggest_keywords",
  "check_sameness",
  "get_suggestions",
  "propose_suggestion",
  "save_research_notes",
  "get_research_notes",
  "submit_article",
  "get_drafts",
]);

// Tools whose effects a client should confirm before running. Purely a UX
// hint - nothing is gated on it, and a client that ignores annotations loses
// no safety, because every one of these is owner-gated in its own handler.
const DESTRUCTIVE_TOOLS = new Set(["merge_pr", "discard_draft", "disconnect_repo"]);

// Reads, by naming convention. The convention is load-bearing enough to
// derive from: a get_/check_ tool that mutated tenant state would already be
// misnamed. One honest exception rides along - check_serp and keyword_ideas
// read nothing of ours but do spend the project's DataForSEO credit, so
// "read-only" here means "changes nothing", not "costs nothing". The daily
// caps are what actually bound the spend.
const READ_ONLY_PREFIX = /^(get_|check_)/;

const mcpHandler = createMcpHandler(
  (mcpServer) => {
    // One place decides what this particular caller may see, so the 60-odd
    // registrations below stay untouched and a new tool cannot forget to be
    // curated or annotated. Safe as a per-request decision: mcp-handler builds
    // a fresh McpServer for every request and calls this callback on it.
    const chat = currentClientKind() === "chat";
    const server = {
      registerTool: ((name: string, config: Record<string, unknown>, cb: unknown) => {
        if (chat && !CHAT_TOOLS.has(name)) return;
        const annotations = {
          ...(READ_ONLY_PREFIX.test(name) ? { readOnlyHint: true } : {}),
          ...(DESTRUCTIVE_TOOLS.has(name) ? { destructiveHint: true } : {}),
          // A tool that states its own annotations wins over the convention.
          ...((config.annotations as Record<string, unknown> | undefined) ?? {}),
        };
        return mcpServer.registerTool(
          name,
          { ...config, annotations } as Parameters<typeof mcpServer.registerTool>[1],
          cb as Parameters<typeof mcpServer.registerTool>[2],
        );
      }) as unknown as typeof mcpServer.registerTool,
    };
    // ---- suggestions queue (the heart) ------------------------------------
    server.registerTool(
      "get_suggestions",
      {
        title: "Get suggestions",
        description:
          "List items from the suggestions queue. Defaults to status 'approved' - " +
          "the build workflow calls this to find what the user approved. Pass status " +
          "'pending' to see what awaits a decision, or 'in_progress'/'done'/'rejected'. " +
          "Optionally filter by type (guide|tool|backlink|update). Items come back in " +
          "BUILD ORDER - the owner's dashboard queue (front-placed ideas first, then " +
          "oldest first) - so build workflows simply take the FIRST item.",
        inputSchema: {
          status: z
            .enum(["pending", "approved", "rejected", "in_progress", "done"])
            .optional()
            .describe(
              "Which queue to list. Defaults to 'approved' - what the owner has greenlit and what builders take from.",
            ),
          type: z
            .enum(["guide", "tool", "backlink", "update"])
            .optional()
            .describe("Restrict to one item type. Omit to get every type."),
        },
      },
      async ({ status, type }) => {
        const p = currentProject();
        let q = db()
          .from("suggestions")
          .select("*")
          .eq("project_id", p.id)
          .order("created_at", { ascending: true });
        q = q.eq("status", status ?? "approved");
        if (type) q = q.eq("type", type);
        const { data, error } = await q;
        if (error) return fail(error.message);
        // Build order is computed here, not in SQL, so the tool keeps working
        // before migration 0014 adds queue_position (rows just stay FIFO).
        const queue = sortQueue(
          (data ?? []) as { created_at: string; queue_position?: number | null }[],
        );
        if (chatMode()) {
          // The full row carries a free-form `spec` brief that can run to
          // pages. A chat client is picking WHICH idea to write, and needs the
          // brief only for the one it picks - which get_build_brief hands it.
          return ok(
            (queue as unknown as Record<string, unknown>[]).map((r) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              status: r.status,
              primary_keyword: r.primary_keyword,
              rationale: typeof r.rationale === "string" ? r.rationale.slice(0, 240) : null,
            })),
          );
        }
        return ok(queue);
      },
    );

    server.registerTool(
      "propose_suggestion",
      {
        title: "Propose suggestion",
        description:
          "Add a new item to the suggestions queue with status 'pending' for the user " +
          "to approve or reject on the dashboard. Use after research: one call per idea. " +
          "type is guide|tool|backlink|update. rationale explains why it's worth doing " +
          "(volume, KD, intent, gap). spec is a free-form brief object: for guides an " +
          "outline/angle/serp_notes; for tools the functionality; for backlinks the target url. " +
          "A take grown from one specific viral post/video additionally carries spec.seed_url " +
          "(+ spec.seed_stats) - the guide builder writes FROM that source: credits it, pulls " +
          "real quotes, embeds a video, then covers what the original missed. " +
          "source marks who queued it: the trend workflows MUST pass 'trend-scan' " +
          "(their ideas get the dashboard's Trend radar, the owner-only approval " +
          "gate, and front-of-queue placement on approval), and the trend-expand " +
          "workflow additionally passes the trend_topic_id it was dispatched with " +
          "so each take is grouped under its subject on the radar; 'manual' is ONLY " +
          "for ideas the site owner dictated in the current conversation ('add a " +
          "guide about X') - never for autonomous workflow runs. Manual ideas may " +
          "additionally pass approved:true (lands straight in the build queue, skipping " +
          "the pending gate), position 'front' ('do this one next' - guides ship one per " +
          "morning, so front means tomorrow), and for tools build 'now' to fire the tool " +
          "builder immediately instead of queueing.",
        inputSchema: {
          type: z
            .enum(["guide", "tool", "backlink", "update"])
            .describe(
              "guide = an article; tool = a free interactive widget; backlink = an outreach target; update = a change to an existing page.",
            ),
          title: z.string().describe("The proposed page or tool title, as it would read on the site."),
          primary_keyword: z
            .string()
            .optional()
            .describe("The single keyword this item targets."),
          volume: z
            .number()
            .int()
            .optional()
            .describe(
              "Monthly search volume for primary_keyword, from the research source. Omit when the project has no volume data.",
            ),
          kd: z
            .number()
            .optional()
            .describe("Keyword difficulty (0-100) for primary_keyword, from the research source."),
          rationale: z
            .string()
            .optional()
            .describe(
              "Why this is worth doing: volume, KD, intent, SERP weakness - and who types the query and why that person overlaps the site's buyer.",
            ),
          spec: z
            .record(z.string(), z.any())
            .optional()
            .describe(
              "Free-form brief. Guides: outline, angle, serp_notes. Tools: the intended functionality. Backlinks: the target url. A take grown from one viral post also carries seed_url (+ seed_stats).",
            ),
          source: z
            .enum(["research", "trend-scan", "manual"])
            .optional()
            .describe(
              "Who queued it. Trend workflows MUST pass 'trend-scan'. 'manual' is ONLY for ideas the owner dictated in the current conversation - never from an autonomous run.",
            ),
          trend_topic_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "The trend topic this take belongs to - passed by trend-expand so each take groups under its subject on the radar.",
            ),
          approved: z
            .boolean()
            .optional()
            .describe(
              "Manual ideas only: skip the pending gate and land straight in the build queue.",
            ),
          position: z
            .enum(["front", "back"])
            .optional()
            .describe(
              "'front' means do this one next - guides ship one per morning, so front means tomorrow. Defaults to back.",
            ),
          build: z
            .enum(["now", "queue"])
            .optional()
            .describe(
              "Tools only: 'now' fires the tool builder immediately instead of waiting for the weekly build. Never pass 'now' from an autonomous run.",
            ),
        },
      },
      async ({ type, title, primary_keyword, volume, kd, rationale, spec, source, trend_topic_id, approved, position, build }) => {
        const p = currentProject();
        // One keyword, one queued idea. The instructions tell every research
        // run to pull the existing queue first, but advice is not a guarantee -
        // a run that checked only one status re-proposed an already-approved
        // keyword and the queue showed the same guide twice (2026-07-29). This
        // is the same check the dashboard's Add idea form runs.
        const dupe = await findDuplicateSuggestion(p.id, type, primary_keyword);
        if (dupe.active) {
          return ok({ duplicate: true, note: duplicateNote(dupe.active), existing: dupe.active });
        }
        // Only owner-dictated (manual) ideas can skip the pending gate - an
        // autonomous run passing approved:true without source 'manual' still
        // lands pending, same spirit as update_suggestion's approval coercion.
        const lands = source === "manual" && approved ? "approved" : "pending";
        const row = {
          project_id: p.id,
          type,
          title,
          primary_keyword,
          keyword_volume: volume,
          keyword_difficulty: kd,
          rationale,
          spec,
          status: lands,
          ...(lands === "approved" ? { decided_at: new Date().toISOString() } : {}),
        };
        // Migration-tolerance ladder (0013 added source, 0016 added
        // trend_topic_id): retry with progressively fewer new columns so
        // proposals keep landing until the migrations run.
        const attempts: Record<string, unknown>[] = [
          { ...row, source: source ?? "research", trend_topic_id },
          { ...row, source: source ?? "research" },
          row,
        ];
        let data: { id: string } | null = null;
        let error: { code?: string; message: string } | null = null;
        for (const attempt of attempts) {
          ({ data, error } = await db().from("suggestions").insert(attempt).select().single());
          // A unique violation is 0043's index catching a duplicate that
          // landed between the check above and this insert - retrying with
          // fewer columns cannot fix it, and it is not a failure worth
          // reporting as one.
          if (!error || isDuplicateKeyError(error)) break;
        }
        if (error && isDuplicateKeyError(error)) {
          const existing = await findDuplicateSuggestion(p.id, type, primary_keyword);
          return ok({
            duplicate: true,
            note: existing.active
              ? duplicateNote(existing.active)
              : "Already in the queue for this keyword - nothing added.",
            existing: existing.active,
          });
        }
        if (error) return fail(error.message);
        let note: string | undefined;
        if (lands === "approved" && data) {
          if (position === "front") {
            await placeAtFront(p.id, data.id, type);
            note =
              type === "guide"
                ? "Front of the queue - the daily builder ships it tomorrow morning."
                : "Front of the queue.";
          }
          if (type === "tool" && build === "now") {
            const dispatch = await dispatchToolBuild(p, data.id);
            note = dispatch.dispatched
              ? "Build dispatched - the PR opens in a few minutes."
              : dispatch.reason === "no-repo"
                ? "Approved, but no content pipeline is connected yet - nothing can build until the pipeline install step on Home is done."
                : "Approved, but the instant build trigger could not reach GitHub - the Wednesday tool sweep will pick it up.";
          }
        }
        return ok(note ? { note, suggestion: data } : data);
      },
    );

    server.registerTool(
      "update_suggestion",
      {
        title: "Update suggestion",
        description:
          "Update a suggestion's status and/or attach a PR url. The build workflow marks " +
          "an item 'in_progress' when it starts and 'done' with result_pr_url when the PR " +
          "is opened. Setting status to approved/rejected stamps decided_at; 'done' stamps " +
          "completed_at. On semi-automatic projects, agent approvals are recorded as " +
          "'pending' for the owner to decide - the response says so; treat it as success. " +
          "decided_by 'owner' is the dashboard's approve/reject/restore through this door: " +
          "the decision applies for real (no pending coercion), approving a trend-scan " +
          "take puts it at the front of the queue exactly like the dashboard's Approve, " +
          "and approving a rejected item restores it from History (re-enters its queue " +
          "unpositioned). Pass it ONLY when the site owner made the call in the current " +
          "conversation ('approve that one', 'reject it', 'restore the X idea') - never " +
          "from autonomous workflow runs.",
        inputSchema: {
          id: z.string().uuid().describe("The suggestion's id, as returned by get_suggestions."),
          status: z
            .enum(["pending", "approved", "rejected", "in_progress", "done"])
            .optional()
            .describe(
              "The new status. Builders set 'in_progress' when they start and 'done' when the PR is open.",
            ),
          result_pr_url: z
            .string()
            .optional()
            .describe("The pull request this item produced. Pass it alongside status 'done'."),
          decided_by: z
            .enum(["owner", "agent"])
            .optional()
            .describe(
              "Pass 'owner' ONLY when the site owner made the call in the current conversation ('approve that one'). Never from an autonomous workflow run.",
            ),
        },
      },
      async ({ id, status, result_pr_url, decided_by }) => {
        const p = currentProject();
        // The human approval gate: an agent asking for "approved" lands as
        // "pending" instead, and the owner decides on the dashboard. Research
        // ideas are gated per type - guides by auto_approve, tools by
        // auto_approve_tools (semi mode / custom with the flag off);
        // trend-scan ideas are approve-idea-first BY DESIGN - they always
        // wait for the owner, whatever the mode. Build lifecycle statuses
        // (in_progress/done) and rejections always pass through. decided_by
        // 'owner' means the owner just said so in chat - that IS the human
        // approval, so the gate steps aside (honor system, like
        // propose_suggestion's source 'manual'). A failed lookup (migration
        // 0013 pending) falls back to the approval flags alone.
        const owner = decided_by === "owner";
        let coerced = false;
        let existing: { source?: string; status?: string; type?: string } | null = null;
        if (status === "approved") {
          const { data: row } = await db()
            .from("suggestions")
            .select("*")
            .eq("id", id)
            .eq("project_id", p.id)
            .maybeSingle();
          existing = row as { source?: string; status?: string; type?: string } | null;
          const trendSourced = existing?.source === "trend-scan";
          const flags = effectiveAutomations(p);
          const autoApproved =
            existing?.type === "tool" ? flags.auto_approve_tools : flags.auto_approve;
          coerced = !owner && (trendSourced || !autoApproved);
        }
        const effective = coerced ? "pending" : status;

        // THE PR HAS TO CONTAIN THE WORK. An agent marking its own build done
        // is the one moment we can cheaply check its claim against the diff,
        // and on 2026-07-31 a run reported a full ship check - cover present,
        // three visuals imported, heading and FAQ counts - on a branch whose
        // MDX was zero bytes. Instructions cannot fix that; a self-report is
        // only ever evidence of what the agent believes. So read the diff.
        //
        // Owner-driven updates skip it: when the owner says done in chat they
        // are overriding on purpose, and second-guessing them with a GitHub
        // call would be both wrong and slow. Unreadable diffs pass (see
        // build-pr-guard) - this refuses damage it can SEE, never absence of
        // information.
        if (!owner && effective === "done" && result_pr_url) {
          const verdict = await checkBuildPr(p, result_pr_url);
          if (!verdict.ok) return fail(verdict.reason);
        }

        const patch: Record<string, unknown> = {};
        if (effective) patch.status = effective;
        if (result_pr_url) patch.result_pr_url = result_pr_url;
        if (effective === "approved" || effective === "rejected") {
          patch.decided_at = new Date().toISOString();
        }
        // started_at feeds the stuck-build recovery sweep (a build that dies
        // mid-run leaves in_progress forever; the sweep reverts rows stuck
        // past the workflow timeout). Cleared on any other transition so a
        // retried suggestion gets a fresh clock.
        if (effective === "in_progress") patch.started_at = new Date().toISOString();
        else if (effective) patch.started_at = null;
        if (effective === "done") patch.completed_at = new Date().toISOString();
        // Restore parity: approving a rejected item clears its stale
        // queue_position so it re-enters FIFO, same as the dashboard's
        // History restore.
        const restoring = effective === "approved" && existing?.status === "rejected";
        if (restoring) patch.queue_position = null;
        if (Object.keys(patch).length === 0) return fail("Nothing to update.");
        let { data, error } = await db()
          .from("suggestions")
          .update(patch)
          .eq("id", id)
          .eq("project_id", p.id)
          .select()
          .single();
        if (error && restoring) {
          // Pre-0014 tolerance: retry without queue_position, like the
          // dashboard's restore does.
          delete patch.queue_position;
          ({ data, error } = await db()
            .from("suggestions")
            .update(patch)
            .eq("id", id)
            .eq("project_id", p.id)
            .select()
            .single());
        }
        if (error && "started_at" in patch) {
          // Pre-0027 tolerance: same posture, without the recovery clock.
          delete patch.started_at;
          ({ data, error } = await db()
            .from("suggestions")
            .update(patch)
            .eq("id", id)
            .eq("project_id", p.id)
            .select()
            .single());
        }
        if (error) return fail(error.message);
        // OWNER-approving a TOOL idea wakes the project's tool-builder
        // workflow immediately; guides wait for the daily cron. Agent
        // approvals (the auto-approve path) deliberately do NOT dispatch -
        // they queue for the weekly tool sweep, so auto mode keeps the
        // one-tool-a-week cadence instead of bursting on research day.
        // A no-op dispatch (no pipeline yet) is said out loud instead of
        // letting the approval read like a build is coming.
        let buildNote: string | undefined;
        if (effective === "approved" && data?.type === "tool") {
          if (owner) {
            const dispatch = await dispatchToolBuild(p, id);
            if (!dispatch.dispatched) {
              buildNote =
                dispatch.reason === "no-repo"
                  ? "Approved, but no content pipeline is connected yet - nothing can build until the pipeline install step on Home is done."
                  : "Approved, but the instant build trigger could not reach GitHub - the Wednesday tool sweep will pick it up.";
            }
          } else {
            buildNote =
              "Approved into the tool queue - the weekly tool sweep builds it (one tool a week). No instant build fires for agent approvals.";
          }
        }
        // Owner-approving a trend take puts it at the FRONT of the queue -
        // the radar's whole point is shipping while the hype window is open.
        // Same move as the dashboard's Approve on a trend-scan idea.
        if (effective === "approved" && !restoring && existing?.source === "trend-scan" && data) {
          await placeAtFront(p.id, id, data.type);
        }
        if (coerced) {
          return ok({
            note:
              "This approval was recorded as 'pending' for the owner to decide " +
              "on the dashboard (trend-scan ideas always wait for the owner; " +
              "guide ideas wait when guide auto-approval is off, tool ideas " +
              "when tool auto-approval is off). This is expected - do not retry.",
            suggestion: data,
          });
        }
        return ok(buildNote ? { note: buildNote, suggestion: data } : data);
      },
    );

    server.registerTool(
      "reorder_queue",
      {
        title: "Reorder queue",
        description:
          "Rewrite the build order of one queue - the MCP side of the dashboard's " +
          "drag-to-reorder. Guides and tools are separate queues; pass the group and " +
          "the ids of its APPROVED suggestions in the exact order they should build " +
          "(first id builds next). Read the current order with get_suggestions " +
          "(status 'approved' comes back in build order). Ids omitted keep their " +
          "place after the ordered set. Only use when the site owner asked to " +
          "re-prioritize in the current conversation - never from autonomous runs.",
        inputSchema: {
          group: z.enum(["guide", "tool"]).describe("Which queue to reorder - guides and tools are ordered independently."),
          ordered_ids: z
            .array(z.string().uuid())
            .min(1)
            .describe("Every suggestion id in this group, in the new build order, first to last."),
        },
      },
      async ({ group, ordered_ids }) => {
        const p = currentProject();
        const result = await writeQueueOrder(p.id, group, ordered_ids);
        if (!result.ok) return fail(result.message);
        return ok({ reordered: true, group, order: ordered_ids });
      },
    );

    server.registerTool(
      "build_suggestion_now",
      {
        title: "Build suggestion now",
        description:
          "The dashboard's 'Build now', tools only: approve a TOOL suggestion (if it " +
          "isn't already) and wake the tool builder immediately. GUIDES have no " +
          "instant build BY DESIGN (owner decision): at most one guide ships per " +
          "day so the cadence stays steady instead of bursty - a guide id is " +
          "approved and placed at the FRONT of the queue instead, and the next " +
          "daily build picks it up, tomorrow at the latest. Only use when the site owner explicitly asked in the " +
          "current conversation - never from autonomous workflow runs; those " +
          "queue via propose_suggestion and wait.",
        inputSchema: {
          id: z.string().uuid().describe("The suggestion to build immediately, as returned by get_suggestions."),
        },
      },
      async ({ id }) => {
        const p = currentProject();
        const { data, error } = await db()
          .from("suggestions")
          .update({ status: "approved", decided_at: new Date().toISOString() })
          .eq("id", id)
          .eq("project_id", p.id)
          .select("type")
          .single();
        if (error) return fail(error.message);
        if (data.type === "tool") {
          // Tools already build on approval - reuse that path. Honest about
          // a no-op dispatch: "waking up" over a missing pipeline is a lie.
          const dispatch = await dispatchToolBuild(p, id);
          return ok({
            ok: true,
            message: dispatch.dispatched
              ? "Approved - the tool builder is waking up."
              : dispatch.reason === "no-repo"
                ? "Approved, but no content pipeline is connected yet - nothing can build until the pipeline install step on Home is done."
                : "Approved, but the instant build trigger could not reach GitHub - the Wednesday tool sweep will pick it up.",
          });
        }
        // No guide build-now (owner decision, 2026-07-15): the publishing pace
        // is the whole protection against scaled-content flags, so the closest
        // honest move is front-of-queue + the next PACED build.
        await placeAtFront(p.id, id, data.type);
        return ok({
          ok: true,
          note:
            "Approved and placed at the front of the queue. Guides have no instant " +
            "build: they ship on the next build the site's publishing pace allows, " +
            "so a young site never bursts content. This is expected - do not retry.",
        });
      },
    );

    // ---- the sameness gate -------------------------------------------------
    // The one check no commercial content tool runs for you: is this draft a
    // re-skin of what this site already published? Surfer/Clearscope/Semrush
    // all score a draft against COMPETITORS; template convergence across your
    // OWN corpus is the scaled-content fingerprint, and it is invisible when
    // reviewing one article at a time. The math lives in similarity.ts and
    // runs HERE (not in the agent's head) so the verdict is deterministic -
    // the builder cannot grade its own prose on vibes.
    // The guide builder's opening payload. Replaces the dozen serial calls a
    // build used to open with - and, more importantly, replaces READING two
    // or three published posts in full just to learn their structural shape,
    // which is the single most context-expensive habit in the old pipeline.
    // Everything here is derived from data the backend already holds or from
    // the same extractors the sameness gate uses.
    //
    // Every section fails open independently: the response's `degraded` array
    // names what is missing and the playbook falls back to the original
    // per-step method for exactly that section. This tool can never block a
    // build; the worst it can do is leave the run doing what it did before.
    server.registerTool(
      "get_build_brief",
      {
        title: "Get build brief",
        description:
          "Call this FIRST in a guide build. One response with everything the run needs to " +
          "start: the queue head (the approved guide to build, in the owner's exact build " +
          "order), the live pacing verdict, structural fingerprints of the recent guides " +
          "(opening word-runs, heading skeletons, cover hues) so the anti-sameness and " +
          "anti-rhyme checks need no re-reading of published posts, ranked internal-link " +
          "candidates when the project opted into back-linking, and the site's own GSC " +
          "numbers for the information-gain step. Pass the target keyword when you know it " +
          "so link candidates can be ranked against it. Fails OPEN section by section: " +
          "anything unavailable is listed in `degraded` with the fallback to use, and a " +
          "degraded brief is never a reason to stop a build.",
        inputSchema: {
          keyword: z
            .string()
            .optional()
            .describe(
              "The new guide's primary keyword, used to rank internal-link candidates by topical closeness. Omit on the first call if the queue head is what tells you the keyword.",
            ),
        },
      },
      async ({ keyword }) => {
        const p = currentProject();
        try {
          return ok(await buildBrief(p, { keyword }));
        } catch (e) {
          // Belt to the module's own per-section braces: even a total failure
          // returns a usable shape telling the agent to do it the old way.
          return ok({
            queue_head: null,
            queue_depth: 0,
            pacing: null,
            recent_guides: [],
            recent_covers: [],
            link_candidates: [],
            site_stats: null,
            internal_linking: p.internal_linking === true,
            degraded: [
              `brief unavailable (${e instanceof Error ? e.message : "unknown error"}) - gather what you need with the individual tools exactly as before; this is not a reason to stop the build`,
            ],
          });
        }
      },
    );

    server.registerTool(
      "check_sameness",
      {
        title: "Check sameness",
        description:
          "The pre-publish sameness gate: does this draft read like the guides this " +
          "site already published? Pass the FULL guide markdown (frontmatter and code " +
          "fences are ignored) plus its primary keyword. The backend fetches this " +
          "project's most recent published guides, strips each one's own keyword, and " +
          "compares three deterministic signals: an identical opening word-run, a " +
          "heading skeleton that is the same once the topic is removed, and stock " +
          "phrases shared across most of the catalogue. Returns pass/fail plus the " +
          "exact offending strings so the fix is mechanical. A fail means REWRITE the " +
          "flagged elements and call again - it never means loosen the check. Fails " +
          "OPEN (pass with a note) if the corpus cannot be read, so a network or DB " +
          "hiccup can never block a build.",
        inputSchema: {
          markdown: z.string().describe("The full draft to check, as markdown."),
          primary_keyword: z
            .string()
            .optional()
            .describe("The keyword this draft targets, so the check can weigh it against pages already covering it."),
          stage: z
            .enum(["outline", "final"])
            .optional()
            .describe(
              "'final' (the default) is the full pre-publish gate on the finished draft - unchanged. " +
                "'outline' is the cheap EARLY probe: pass just the planned opening line plus the H2 " +
                "headings as markdown, BEFORE drafting prose or building visuals, and it checks the " +
                "two signals an outline can carry (opening word-run, heading skeleton). Catching a " +
                "collision here costs a replanned outline instead of a discarded draft. It skips the " +
                "stock-phrase signal, which needs body prose, so an outline pass NEVER substitutes " +
                "for the final check - always run 'final' on the finished guide before the PR.",
            ),
        },
      },
      async ({ markdown, primary_keyword, stage }) => {
        const p = currentProject();
        const { data, error } = await db()
          .from("pages")
          .select("url, title, primary_keyword")
          .eq("project_id", p.id)
          .eq("type", "guide")
          .order("created_at", { ascending: false })
          .limit(CORPUS_SIZE);
        if (error) {
          return ok({
            pass: true,
            compared_against: 0,
            flags: [],
            note: `Could not read the published corpus (${error.message}) - gate passed open. Proceed.`,
          });
        }

        const rows = (data ?? []) as {
          url: string;
          title: string | null;
          primary_keyword: string | null;
        }[];

        // Each guide is stripped of ITS OWN keyword before comparison - that
        // is what makes "What is <kw>?" across two different topics collapse
        // to the same skeleton and show the template.
        const corpus = (
          await Promise.all(
            rows.map(async (r) => {
              // Belt to log_page's suspenders: never fetch a stored URL that is
              // not on this project's own domain (pre-guard rows, SSRF), and
              // re-check every redirect hop - the response body is read here,
              // so an off-domain 302 would turn this into a read primitive.
              try {
                const res = await fetchProjectUrl(r.url, p.domain, {
                  timeoutMs: 8000,
                  userAgent: "DispatchSEO-sameness-gate",
                });
                if (!res?.ok) return null;
                const html = await res.text();
                const kw = new Set(tokenize(r.primary_keyword ?? ""));
                return { ...extractFromHtml(html, kw), label: r.title ?? r.url };
              } catch {
                return null; // a page that will not load simply sits this out
              }
            }),
          )
        ).filter((c): c is NonNullable<typeof c> => c != null);

        const draft = extractFromMarkdown(markdown, new Set(tokenize(primary_keyword ?? "")));
        return ok(compareToCorpus(draft, corpus, stage ?? "final"));
      },
    );

    // ---- the article door --------------------------------------------------
    // Where an outside AI hands us a finished article. Everything past this
    // point is ours: validate, store, render, add internal links, publish.
    //
    // The gate runs HERE rather than inside the writing agent for the same
    // reason the sameness gate does - a model grading its own work grades it
    // generously, and the promise of this product is that the article a
    // customer gets does not depend on which AI they happen to pay for. A
    // rejection is not a dead end: every failed check carries a `fix` written
    // TO the submitting model, so the normal path is submit -> read the fixes
    // -> resubmit, without a human in the loop.
    server.registerTool(
      "submit_article",
      {
        title: "Submit article",
        description:
          "Hand in a finished article. We check it against the publishing gate, store it " +
          "as a draft, then format it, add internal links, build the schema and cover, and " +
          "publish it to the site on the owner's schedule - you do not publish it yourself. " +
          "Send the article as plain markdown: one H1, H2/H3 sections, no frontmatter and " +
          "no HTML. If it fails the gate the call comes back with the exact checks that " +
          "failed and a `fix` line for each one - apply them and call submit_article again " +
          "with the same suggestion_id, which updates the same draft rather than piling up " +
          "duplicates. Give up after 3 rejected attempts and tell the owner what is blocking " +
          "it. Pass suggestion_id whenever the article fulfils a queued idea; that is what " +
          "marks the idea in progress and keeps one article per idea.",
        inputSchema: {
          suggestion_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "The queued idea this article fulfils (from get_suggestions / get_build_brief). " +
                "Omit only for an article the owner asked for that was never in the queue.",
            ),
          title: z.string().min(1).describe("The article title as it should appear on the page."),
          slug: z
            .string()
            .min(1)
            .describe("URL slug, lowercase and hyphenated, no leading or trailing slash - e.g. 'how-to-price-a-service'."),
          meta_description: z
            .string()
            .optional()
            .describe("Meta description, roughly 120-160 characters. Omitted means we build one from the opening."),
          primary_keyword: z
            .string()
            .min(1)
            .describe("The single search term this article targets, exactly as someone would type it."),
          markdown: z
            .string()
            .min(1)
            .describe("The full article in markdown. No frontmatter, no raw HTML, no code fences wrapping the whole thing."),
          faq: z
            .array(
              z.object({
                question: z.string().describe("The question, phrased as a real question ending in '?'."),
                answer: z.string().describe("The answer in a couple of full sentences - at least 8 words, never a stub."),
              }),
            )
            .optional()
            .describe(
              "Real Q&A pairs for the FAQ block and its schema. Each question ends in '?' and each answer is a couple of sentences, not a stub.",
            ),
          sources: z
            .array(
              z.object({
                url: z.string().describe("The source's full URL, including https://."),
                title: z.string().optional().describe("The source page or publication's title."),
              }),
            )
            .optional()
            .describe(
              "External sources you actually used, as full URLs. Placeholder or example.com URLs fail the gate.",
            ),
          cover_brief: z
            .string()
            .optional()
            .describe("Optional one-line description of the cover image's subject. Never published as text."),
        },
      },
      async (input) => {
        const p = currentProject();

        const submission = {
          title: input.title,
          slug: input.slug,
          metaDescription: input.meta_description ?? "",
          primaryKeyword: input.primary_keyword,
          markdown: input.markdown,
          faq: input.faq ?? [],
          sources: input.sources ?? [],
          coverBrief: input.cover_brief,
        };

        // WHOSE IDEA IS IT. On Semi the owner's approval is the point of the
        // queue: an idea sitting pending has not been said yes to, and one
        // they rejected has been said no to - writing either anyway would make
        // the approve/reject buttons decorative. On Auto the owner has already
        // delegated that decision (auto_approve is what "fully automatic"
        // means here), so the same check would only refuse work they asked to
        // happen without them.
        //
        // in_progress passes on both: that is the status submit_article itself
        // sets, so a resubmission after a rejection must not trip over its own
        // first attempt.
        if (input.suggestion_id && !effectiveAutomations(p).auto_approve) {
          const { data: idea } = await db()
            .from("suggestions")
            .select("status, title")
            .eq("id", input.suggestion_id)
            .eq("project_id", p.id)
            .maybeSingle();
          const ideaRow = idea as { status: string; title: string } | null;
          if (ideaRow && !["approved", "in_progress"].includes(ideaRow.status)) {
            return fail(
              ideaRow.status === "rejected"
                ? `The owner rejected that idea ("${ideaRow.title}"), so it is not one to write. Call get_suggestions for the approved ones.`
                : `That idea ("${ideaRow.title}") is still waiting for the owner to approve it - this site approves ideas by hand, on the dashboard's Queue screen. Do not write it yet. Either write one that is already approved (get_suggestions lists them), or tell the owner to approve this one on the Queue screen; if you already wrote it, keep the article with save_research_notes and hand it in once they say it is approved.`,
            );
          }
        }

        // One live article per queued idea. A resubmission after a rejection
        // updates that same row; a resubmission after we already accepted one
        // is refused here rather than by a unique-index error, because "we are
        // already publishing that" is an answer and "23505" is not.
        let existingId: string | null = null;
        if (input.suggestion_id) {
          const { data: prior } = await db()
            .from("article_drafts")
            .select("id, status")
            .eq("project_id", p.id)
            .eq("suggestion_id", input.suggestion_id)
            .in("status", ["submitted", "rejected", "accepted", "blocked_setup", "finished", "published"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const row = prior as { id: string; status: string } | null;
          if (row && ["accepted", "blocked_setup", "finished", "published"].includes(row.status)) {
            return failWith(
              "We already accepted an article for that idea. Nothing was changed - read it with get_drafts.",
              { draft_id: row.id, status: row.status },
            );
          }
          existingId = row?.id ?? null;
        }

        // What this site already covers, so the gate can refuse a near-repeat.
        // Two sources: pages (what the repo route published) and the drafts
        // this door has already accepted. Both fail open - an unreadable
        // corpus must not refuse someone's article.
        const [pagesRes, draftsRes] = await Promise.all([
          db().from("pages").select("url, title").eq("project_id", p.id).limit(1000),
          db()
            .from("article_drafts")
            .select("slug, title")
            .eq("project_id", p.id)
            .in("status", ["accepted", "blocked_setup", "finished", "published"])
            .limit(1000),
        ]);
        const existingSlugs: string[] = [];
        const existingTitles: string[] = [];
        for (const row of (pagesRes.data ?? []) as { url: string; title: string | null }[]) {
          const slug = slugFromUrl(row.url);
          if (slug) existingSlugs.push(slug);
          if (row.title) existingTitles.push(row.title);
        }
        for (const row of (draftsRes.data ?? []) as { slug: string | null; title: string | null }[]) {
          if (row.slug) existingSlugs.push(row.slug);
          if (row.title) existingTitles.push(row.title);
        }

        // content_prefs is read raw here rather than through
        // normalizeContentPrefs, which drops keys it does not know about:
        // these two are gate settings, not template controls, and both have a
        // safe default (cite your sources; ban nothing).
        const prefs = (p.content_prefs ?? {}) as Record<string, unknown>;
        const bannedClaims = Array.isArray(prefs.banned_claims)
          ? (prefs.banned_claims as unknown[]).filter((c): c is string => typeof c === "string")
          : [];
        const requireSources =
          typeof prefs.require_sources === "boolean" ? prefs.require_sources : true;

        const report = validateArticle(submission, {
          existingSlugs,
          existingTitles,
          requireSources,
          bannedClaims,
          siteName: p.name,
        });

        // Caps, checked only for a NEW accepted article.
        //
        // Deliberately not checked earlier: a rejected submission consumes
        // nothing, so refusing one on a cap would punish an agent for the very
        // round trip the gate asked it to make. And a resubmission updates a
        // draft that already counted, so it must pass freely or a capped site
        // could never fix the article it already has in flight.
        if (report.ok && !existingId) {
          const capped = await submissionCaps(p.id);
          if (capped) return fail(capped);
        }

        const now = new Date().toISOString();
        const row = {
          project_id: p.id,
          suggestion_id: input.suggestion_id ?? null,
          title: submission.title,
          slug: submission.slug,
          meta_description: input.meta_description ?? null,
          primary_keyword: submission.primaryKeyword,
          markdown: submission.markdown,
          faq: submission.faq,
          sources: submission.sources,
          cover_brief: input.cover_brief ?? null,
          validation: report,
          // Which kind of AI handed it in. The whole promise of a server-side
          // gate is that quality does not depend on this value, which is only
          // checkable if it is recorded.
          client_kind: currentClientKind(),
          // A rejected draft is stored too, deliberately: "why was my article
          // refused" has to be answerable weeks later, and rejection rates per
          // client are the only measurement of whether the gate is fair.
          status: report.ok ? "submitted" : "rejected",
          updated_at: now,
        };

        let draftId = existingId;
        if (draftId) {
          const { error } = await db().from("article_drafts").update(row).eq("id", draftId);
          if (error) return fail(`Could not save the article: ${error.message}`);
        } else {
          const { data, error } = await db()
            .from("article_drafts")
            .insert(row)
            .select("id")
            .maybeSingle();
          if (error) {
            if (isDuplicateKeyError(error)) {
              return fail(
                "There is already an article in flight for that idea. Read it with get_drafts before submitting another.",
              );
            }
            return fail(`Could not save the article: ${error.message}`);
          }
          draftId = (data as { id: string } | null)?.id ?? null;
        }
        if (!draftId) return fail("Could not save the article: the database returned no row.");

        if (!report.ok) {
          const failed = report.blocking.filter((c) => !c.passed);
          return failWith(
            `Not published: ${failed.length} check(s) must pass first. Fix each one below and call submit_article again with the same suggestion_id.`,
            {
              draft_id: draftId,
              status: "rejected",
              score: report.score,
              blocking: failed.map((c) => ({ id: c.id, title: c.title, fix: c.fix })),
              advisory: report.advisory
                .filter((c) => !c.passed)
                .map((c) => ({ id: c.id, title: c.title, fix: c.fix })),
            },
          );
        }

        try {
          await enqueue({
            projectId: p.id,
            kind: "finish",
            payload: { draftId },
            idempotencyKey: `finish:${draftId}`,
          });
        } catch (e) {
          // The article is saved but nothing will pick it up. Say so - a
          // "submitted" that silently never publishes is the worst outcome
          // this tool has.
          return failWith(
            `Your article was saved but we could not queue it for publishing: ${
              e instanceof Error ? e.message : String(e)
            }. Call submit_article again with the same suggestion_id in a minute.`,
            { draft_id: draftId, status: "submitted" },
          );
        }

        if (input.suggestion_id) {
          // Best effort: the article is accepted either way, and a queue
          // status that lags is a smaller problem than refusing the work.
          await db()
            .from("suggestions")
            .update({ status: "in_progress" })
            .eq("id", input.suggestion_id)
            .eq("project_id", p.id);
        }

        return ok({
          draft_id: draftId,
          status: "submitted",
          score: report.score,
          advisory: report.advisory
            .filter((c) => !c.passed)
            .map((c) => ({ id: c.id, title: c.title, fix: c.fix })),
          note: "Accepted. We will format it, add internal links, build the cover and schema, and publish it on the owner's schedule. Nothing else for you to do.",
        });
      },
    );

    server.registerTool(
      "get_drafts",
      {
        title: "Get drafts",
        description:
          "The articles submitted through submit_article and what happened to each: " +
          "what passed, what was sent back and why, what is queued, and what is live. " +
          "The same list the owner's Drafts screen shows. Call it before submitting " +
          "again after a rejection - the blocking checks and their fixes are here. " +
          "Statuses: submitted (checking) | rejected (sent back, see problems) | " +
          "accepted (queued to publish) | blocked_setup (nowhere to publish yet - the " +
          "owner has not connected their site) | finished (posted to WordPress, or pull " +
          "request opened in the repo - not yet confirmed live; `pr_url` links it) | " +
          "published (confirmed live) | discarded.",
        inputSchema: {
          status: z
            .enum([
              "submitted",
              "rejected",
              "accepted",
              "blocked_setup",
              "finished",
              "published",
              "discarded",
            ])
            .optional()
            .describe("Only this status. Omit for everything, newest first."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("How many to return, newest first. Defaults to 20."),
        },
      },
      async ({ status, limit }) => {
        const p = currentProject();
        let q = db()
          .from("article_drafts")
          .select(
            "id, suggestion_id, title, slug, status, validation, published_url, pr_url, created_at, updated_at",
          )
          .eq("project_id", p.id)
          .order("created_at", { ascending: false })
          .limit(limit ?? 20);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return fail(error.message);

        const rows = (data ?? []) as {
          id: string;
          suggestion_id: string | null;
          title: string;
          slug: string;
          status: string;
          validation: {
            score?: number;
            blocking?: { id: string; title: string; fix: string; passed?: boolean }[];
          } | null;
          published_url: string | null;
          pr_url: string | null;
          created_at: string;
          updated_at: string;
        }[];

        // The full validation report is several KB per row and most of it is
        // checks that passed. Only the failures carry an instruction, and only
        // those are worth an agent's context.
        return ok(
          rows.map((r) => ({
            id: r.id,
            suggestion_id: r.suggestion_id,
            title: r.title,
            slug: r.slug,
            status: r.status,
            score: typeof r.validation?.score === "number" ? r.validation.score : null,
            problems: (r.validation?.blocking ?? [])
              .filter((c) => c.passed === false)
              .map((c) => ({ id: c.id, title: c.title, fix: c.fix })),
            published_url: r.published_url,
            // Only ever set on the repo route: the pull request this article
            // was committed into, so the agent can point the owner at it.
            pr_url: r.pr_url,
            created_at: r.created_at,
            updated_at: r.updated_at,
            ...(r.status === "blocked_setup" ? { blocked_reason: blockedReason(p) } : {}),
          })),
        );
      },
    );

    server.registerTool(
      "approve_draft",
      {
        title: "Publish a draft now",
        description:
          "Owner-gated: publish a finished article immediately instead of waiting for " +
          "the site's usual publishing hour. Use ONLY when the owner asked for it in " +
          "this conversation - an accepted article already publishes on its own, so an " +
          "autonomous run has no reason to call this. Also the way to release an article " +
          "that parked as blocked_setup, once the owner has connected their site.",
        inputSchema: {
          id: z.string().uuid().describe("The draft id from get_drafts or submit_article."),
        },
      },
      async ({ id }) => {
        const p = currentProject();
        const { data } = await db()
          .from("article_drafts")
          .select("id, status, rendered_html")
          .eq("id", id)
          .eq("project_id", p.id)
          .maybeSingle();
        const draft = data as { id: string; status: string; rendered_html: string | null } | null;
        if (!draft) return fail("No draft with that id on this site.");
        if (draft.status === "published") return fail("That article is already live.");
        // Only a draft that is actually waiting may be pushed out: a discarded
        // one stays discarded, and a submitted/rejected one has not been
        // prepared yet.
        if (!["accepted", "blocked_setup", "finished"].includes(draft.status)) {
          return fail(
            draft.status === "discarded"
              ? "That article was discarded. Ask the owner to resubmit it if they changed their mind."
              : "That article has not been prepared yet. Try again in a few minutes.",
          );
        }
        if (!draft.rendered_html) {
          return fail("That article has not been prepared yet. Try again in a few minutes.");
        }
        // Refuse rather than queue a job that would immediately park itself -
        // reporting "queued" for work that cannot run is the failure mode this
        // whole readiness split exists to prevent.
        const route = publishRoute(p);
        if (route !== "wordpress" && route !== "repo") return fail(blockedReason(p));

        // Pulls an already-scheduled publish forward instead of silently
        // deduping against it - see publishDraftNow.
        await publishDraftNow(p.id, draft.id);
        return ok({
          id: draft.id,
          queued: true,
          note:
            route === "repo"
              ? "The pull request opens within a few minutes."
              : "It goes out within a few minutes.",
        });
      },
    );

    server.registerTool(
      "discard_draft",
      {
        title: "Discard a draft",
        description:
          "Owner-gated: throw an article away so it is never published. Use ONLY when " +
          "the owner asked for it in this conversation. The row is kept as history " +
          "rather than deleted, so 'why did that article never appear' stays " +
          "answerable. A rejected draft does not need discarding - fix it and " +
          "resubmit instead.",
        inputSchema: {
          id: z.string().uuid().describe("The draft id from get_drafts or submit_article."),
        },
        annotations: { destructiveHint: true },
      },
      async ({ id }) => {
        const p = currentProject();
        const { data, error } = await db()
          .from("article_drafts")
          .update({ status: "discarded", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("project_id", p.id)
          .select("id, title")
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) return fail("No draft with that id on this site.");
        return ok({ discarded: true, ...(data as { id: string; title: string }) });
      },
    );

    // ---- research notes (one chat's findings, for the next chat) -----------
    // A coding agent researches and writes in one run and keeps the findings
    // in its context. A chat app has neither the window nor the continuity for
    // that, so the work splits: one conversation researches, another writes.
    // These two tools are the handover.
    server.registerTool(
      "save_research_notes",
      {
        title: "Save research notes",
        description:
          "Store what you learned researching an idea, so a LATER conversation can write " +
          "the article without redoing the research. Call it at the end of a research " +
          "session with whatever you found: the SERP picture, what the top results cover " +
          "and miss, the angle worth taking, an outline, real numbers with their sources. " +
          "Shape it however suits the work - nothing here parses it. Saving again for the " +
          "same suggestion_id REPLACES the previous notes, so the writing session never has " +
          "to guess which of two versions is current.",
        inputSchema: {
          suggestion_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "The queued idea this research is for. Omit for research the owner asked for that is not tied to a queued idea.",
            ),
          notes: z
            .record(z.string(), z.unknown())
            .describe(
              "Your findings as a JSON object - serp, gaps, angle, outline, sources, whatever the work produced. Up to 64KB.",
            ),
        },
      },
      async ({ suggestion_id, notes }) => {
        const p = currentProject();
        // A ceiling, because the failure mode without one is an agent pasting
        // three competitor pages in full and the next session paying for it.
        const size = JSON.stringify(notes ?? {}).length;
        if (size > MAX_RESEARCH_NOTES_CHARS) {
          return fail(
            `Those notes are ${size.toLocaleString()} characters, past the ${MAX_RESEARCH_NOTES_CHARS.toLocaleString()} we store. ` +
              "Save your conclusions - the angle, the gaps, the outline, the numbers with their sources - rather than the pages you read.",
          );
        }

        const now = new Date().toISOString();
        if (suggestion_id) {
          const { data, error } = await db()
            .from("research_notes")
            .upsert(
              { project_id: p.id, suggestion_id, notes, updated_at: now },
              { onConflict: "project_id,suggestion_id" },
            )
            .select("id")
            .maybeSingle();
          if (error) return fail(`Could not save those notes: ${error.message}`);
          return ok({ id: (data as { id: string } | null)?.id ?? null, saved: true, suggestion_id, chars: size });
        }
        const { data, error } = await db()
          .from("research_notes")
          .insert({ project_id: p.id, notes, updated_at: now })
          .select("id")
          .maybeSingle();
        if (error) return fail(`Could not save those notes: ${error.message}`);
        return ok({ id: (data as { id: string } | null)?.id ?? null, saved: true, chars: size });
      },
    );

    server.registerTool(
      "get_research_notes",
      {
        title: "Get research notes",
        description:
          "Read back research saved by an earlier conversation. Call this FIRST in a " +
          "writing session: if notes exist for the idea you are about to write, the " +
          "research is already done and repeating it costs the owner a second round of " +
          "their own plan. Pass suggestion_id for one idea's notes; omit it to list the " +
          "most recent unattached notes.",
        inputSchema: {
          suggestion_id: z
            .string()
            .uuid()
            .optional()
            .describe("The queued idea whose notes you want. Omit to list recent unattached notes."),
        },
      },
      async ({ suggestion_id }) => {
        const p = currentProject();
        if (suggestion_id) {
          const { data, error } = await db()
            .from("research_notes")
            .select("id, suggestion_id, notes, created_at, updated_at")
            .eq("project_id", p.id)
            .eq("suggestion_id", suggestion_id)
            .maybeSingle();
          if (error) return fail(error.message);
          // An absent note is an answer, not a failure: it means nobody has
          // researched this yet, and the writing session should go and do it.
          if (!data) {
            return ok({
              found: false,
              suggestion_id,
              note: "Nobody has researched this idea yet. Do the research, then save it with save_research_notes.",
            });
          }
          return ok({ found: true, ...(data as Record<string, unknown>) });
        }
        const { data, error } = await db()
          .from("research_notes")
          .select("id, suggestion_id, notes, created_at, updated_at")
          .eq("project_id", p.id)
          .is("suggestion_id", null)
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) return fail(error.message);
        return ok({ found: (data ?? []).length > 0, notes: data ?? [] });
      },
    );

    // ---- what we know about the site (the crawl, and where articles go) ----
    server.registerTool(
      "get_site_digest",
      {
        title: "Get site digest",
        description:
          "What this site already covers, read for you so you do not have to crawl it. " +
          "Our server reads the site on a schedule and keeps a compact summary: the " +
          "sections it has, how many pages, the newest and oldest, sample titles, the " +
          "most-linked pages, typical article length. Call this BEFORE researching or " +
          "writing - it is how you avoid proposing an article the site already has, and " +
          "how you match its voice and depth. Reading the site yourself instead would " +
          "cost far more of this conversation than the whole article is worth. " +
          "`notes` names anything the crawl could not see, so a partial picture says so.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const { data, error } = await db()
          .from("site_digests")
          .select("digest, notes, page_count, source, crawled_at")
          .eq("project_id", p.id)
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) {
          // Not an error: a site we have not read yet is a normal state on a
          // new project, and the answer is "ask for a read", not "give up".
          return ok({
            crawled: false,
            note: chatMode()
              ? "We have not read your site yet. It happens on its own once the site is connected, and again every week. Until then, ask the owner what the site covers rather than guessing."
              : "We have not read your site yet. Call rescan_site to queue a read; it usually finishes within a few minutes.",
          });
        }
        return ok({ crawled: true, ...(data as Record<string, unknown>) });
      },
    );

    server.registerTool(
      "rescan_site",
      {
        title: "Rescan the site",
        description:
          "Queue a fresh read of the site. It happens in the background and takes a few " +
          "minutes; call get_site_digest afterwards for the result. The site is re-read " +
          "automatically every week, so use this only when something changed that matters " +
          "now - pages published elsewhere, a restructure, a new section. Calling it " +
          "repeatedly in one day does nothing extra: the same read is queued once.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        if (!p.domain) return fail("This project has no website address yet, so there is nothing to read.");
        const day = new Date().toISOString().slice(0, 10);
        const job = await enqueue({
          projectId: p.id,
          kind: "crawl",
          payload: { isWordPress: publishTarget(p) === "wordpress", maxPages: 150 },
          idempotencyKey: `crawl:${p.id}:manual:${day}`,
        });
        return ok({
          queued: true,
          // enqueue returns null when an identical read is already pending.
          // That is a success - the work is going to happen - and saying so
          // beats reporting a second queue that does not exist.
          already_queued: job === null,
          note: "We will read the site in the background. Call get_site_digest in a few minutes.",
        });
      },
    );

    server.registerTool(
      "set_publish_target",
      {
        title: "Set where articles are published",
        description:
          "Owner-gated: choose where finished articles go. `wordpress` posts them straight " +
          "to the site's own WordPress; `github` commits the article to the connected repo " +
          "and opens a pull request (merged automatically in automatic mode); `manual` " +
          "finishes the article and leaves it for the owner to place. Use " +
          "ONLY when the owner asked for the change in this conversation. This does NOT " +
          "connect anything - the WordPress username and password are entered on the " +
          "Settings screen and never travel through here. Setting `wordpress` before that " +
          "connection exists is allowed, and articles simply wait until it does.",
        inputSchema: {
          target: z
            .enum(["github", "wordpress", "manual"])
            .describe("Where finished articles go from now on."),
        },
      },
      async ({ target }) => {
        const p = currentProject();
        const { error } = await db()
          .from("projects")
          .update({ publish_target: target })
          .eq("id", p.id);
        if (error) return fail(`Could not change where articles are published: ${error.message}`);

        // Say what this actually means right now rather than a bare "saved" -
        // choosing wordpress on a site with no WordPress connected looks like
        // it worked and then quietly parks every article.
        const notes: string[] = [];
        if (target === "wordpress" && !p.wp_app_password) {
          notes.push(
            "No WordPress site is connected yet, so articles will wait. Connect it on the Settings screen.",
          );
        }
        if (target === "github" && !p.github_repo) {
          notes.push("No repository is connected yet, so articles will wait.");
        }
        return ok({ publish_target: target, saved: true, ...(notes.length ? { note: notes.join(" ") } : {}) });
      },
    );

    server.registerTool(
      "set_content_path_hint",
      {
        title: "Set where the repo keeps its articles",
        description:
          "Owner-gated, repo route only: the folder in the connected GitHub repo that holds " +
          "the site's articles (for example content/blog). We work it out from the repo when " +
          "this is empty; set it when get_drafts reports a draft parked on \"where your " +
          "articles live\", or when the owner tells you the folder. Pass an empty string to " +
          "clear it. Same field as Settings - Where your articles live.",
        inputSchema: {
          path: z
            .string()
            .max(160)
            .describe("Repo-relative folder, e.g. content/blog. Empty string clears the hint."),
        },
      },
      async ({ path }) => {
        const p = currentProject();
        const { normalizeContentPathHint } = await import("@/lib/repo-publish");
        const raw = path.trim();
        const clean = raw ? normalizeContentPathHint(raw) : null;
        if (raw && clean === null) {
          return fail("Use a plain folder path, like content/blog - letters, digits, dots, dashes and slashes, no '..'.");
        }
        const { error } = await db()
          .from("projects")
          .update({ content_path_hint: clean })
          .eq("id", p.id);
        if (error) return fail(`Could not save the folder: ${error.message}`);
        return ok({
          content_path_hint: clean,
          saved: true,
          note: clean
            ? "Saved. A draft parked on this will publish the next time it runs - press Publish now (approve_draft) to run it now."
            : "Cleared. We will work the folder out from the repo again.",
        });
      },
    );

    // ---- keyword tracking --------------------------------------------------
    server.registerTool(
      "track_keywords",
      {
        title: "Track keywords",
        description:
          "Upsert keywords into the tracking set (matched by keyword text). The rank cron " +
          "checks every tracked keyword: daily while it ranks in the top 30, plus a weekly " +
          "full-depth sweep for everything. Pass the metrics you have from research; " +
          "omitted fields are left as-is on existing rows.",
        inputSchema: {
          keywords: z
            .array(
              z.object({
                keyword: z.string().describe("The search term to track, exactly as a user would type it."),
                volume: z
                  .number()
                  .int()
                  .optional()
                  .describe("Monthly search volume from the research source. Never estimate it."),
                kd: z.number().optional().describe("Keyword difficulty, 0-100, from the research source."),
                cpc: z.number().optional().describe("Cost per click in USD, from the research source."),
                intent: z
                  .string()
                  .optional()
                  .describe("Search intent for this term, e.g. informational, commercial, transactional."),
              }),
            )
            .min(1)
            .describe("One entry per keyword to start tracking. Send the whole batch in a single call."),
        },
      },
      async ({ keywords }) => {
        const p = currentProject();
        // No per-plan keyword cap. Plans are sold on SITES; a keyword ceiling
        // was removed on 2026-08-02 because it never bound in practice - the
        // DataForSEO budget gate (platformBudgetGate + the pacing ladder in
        // dataforseo-usage.ts) reaches its limit first on every realistic
        // usage curve, and it degrades gracefully (rank checks stretch to
        // every other day, then weekly) instead of refusing the write. Two
        // gates for one cost driver meant the one nobody could see fired
        // first and the one built to bend never got the chance.
        const rows = keywords.map((k) => ({
          project_id: p.id,
          keyword: k.keyword,
          search_volume: k.volume,
          keyword_difficulty: k.kd,
          cpc: k.cpc,
          intent: k.intent,
        }));
        const { data, error } = await db()
          .from("keywords")
          .upsert(rows, { onConflict: "project_id,keyword" })
          .select();
        if (error) return fail(error.message);
        return ok({ upserted: data?.length ?? 0, keywords: data });
      },
    );

    server.registerTool(
      "get_rankings",
      {
        title: "Get rankings",
        description:
          "Rank history for tracked keywords over the last N days (default 30). Returns each " +
          "keyword with its current position, the earliest position in the window, the change " +
          "(positive = improved, i.e. moved toward #1), and the full check series. Read " +
          "position null together with checked: checked true + position null means confirmed " +
          "not in the top 100; checked false means the keyword has never been successfully " +
          "checked in the window (rank tracking not set up yet, or the nightly cron hasn't " +
          "run) - unknown, NOT 'not ranking'. Pass a keyword to scope to one. Ordered best " +
          "position first; keywords outside the top 100 come last, ordered by search volume " +
          "(so the tail reads as an opportunity list).",
        inputSchema: {
          keyword: z.string().optional().describe("Restrict to one tracked keyword. Omit for every tracked keyword."),
          days: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("How far back to read rank history, in days."),
        },
      },
      async ({ keyword, days }) => {
        const p = currentProject();
        const windowDays = days ?? 30;
        const since = new Date(Date.now() - windowDays * 86400000).toISOString();
        let kq = db()
          .from("keywords")
          .select("id, keyword, search_volume, keyword_difficulty")
          .eq("project_id", p.id);
        if (keyword) kq = kq.eq("keyword", keyword);
        const { data: kws, error: kErr } = await kq;
        if (kErr) return fail(kErr.message);
        if (!kws || kws.length === 0) return ok([]);

        const results = [];
        for (const kw of kws) {
          const { data: checks, error: cErr } = await db()
            .from("rank_checks")
            .select("position, url, checked_at")
            .eq("keyword_id", kw.id)
            .gte("checked_at", since)
            .order("checked_at", { ascending: true });
          if (cErr) return fail(cErr.message);
          const series = checks ?? [];
          const current = series.length ? series[series.length - 1].position : null;
          const first = series.length ? series[0].position : null;
          // change: only meaningful when both endpoints are in the top 100.
          const change =
            current != null && first != null ? first - current : null;
          results.push({
            keyword: kw.keyword,
            search_volume: kw.search_volume,
            keyword_difficulty: kw.keyword_difficulty,
            // checked=false: zero successful checks in the window - "unknown",
            // never to be read as "not ranking" (see the tool description).
            checked: series.length > 0,
            current_position: current,
            window_start_position: first,
            change,
            current_url: series.length ? series[series.length - 1].url : null,
            checks: series,
          });
        }
        // Same order the Rankings page shows: best position first, then the
        // ones outside the top 100 by search volume.
        return ok(
          sortByBestPosition(results.map((r) => ({ ...r, position: r.current_position }))).map(
            ({ position: _position, ...r }) => r,
          ),
        );
      },
    );

    // ---- published pages ---------------------------------------------------
    server.registerTool(
      "log_page",
      {
        title: "Log page",
        description:
          "Record a published page (matched by url; re-logging updates it). Call after a PR " +
          "is opened so the system knows the page exists - used for internal-linking decisions " +
          "and to avoid duplicate coverage. A newly logged page counts as 'awaiting publish' " +
          "on the dashboard until its URL first serves HTTP 200 (verified automatically after " +
          "the PR merges and deploys) - so logging at PR-open time is correct, not premature. " +
          "type is guide|tool|landing. published_at (ISO " +
          "date/datetime) is when the page ACTUALLY went live - pass it when backfilling a " +
          "page published earlier, omit it for a page shipping right now. It matters: the " +
          "daily publishing pace reads this field, so a backfill stamped 'now' wrongly uses " +
          "today's build slot.",
        inputSchema: {
          url: z.string().describe("The page's full public URL on the site."),
          title: z.string().optional().describe("The page title as published."),
          type: z
            .enum(["guide", "tool", "landing"])
            .optional()
            .describe("What kind of page this is."),
          primary_keyword: z
            .string()
            .optional()
            .describe("The keyword this page targets - the same one its suggestion carried."),
          pr_url: z.string().optional().describe("The pull request that shipped this page."),
          published_at: z
            .string()
            .optional()
            .describe(
              "Publication date as YYYY-MM-DD. Take it from running `date -u +%F` in the shell, never from memory.",
            ),
        },
      },
      async ({ url, title, type, primary_keyword, pr_url, published_at }) => {
        const p = currentProject();
        if (!isProjectUrl(url, p.domain)) {
          return fail(
            `url must be an absolute http(s) URL on this project's domain (${p.domain}), got: ${url}`,
          );
        }
        const publishedMs = published_at ? Date.parse(published_at) : NaN;
        if (published_at && Number.isNaN(publishedMs)) {
          return fail(`published_at must be an ISO date/datetime, got: ${published_at}`);
        }
        if (published_at && publishedMs > Date.now()) {
          return fail(`published_at is in the future (${published_at}) - pass when the page actually went live.`);
        }
        const { data, error } = await db()
          .from("pages")
          .upsert(
            {
              project_id: p.id,
              url,
              title,
              type,
              primary_keyword,
              pr_url,
              published_at: published_at
                ? new Date(publishedMs).toISOString()
                : new Date().toISOString(),
            },
            { onConflict: "project_id,url" },
          )
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "get_pages",
      {
        title: "Get pages",
        description:
          "List every published page (url, title, type, primary_keyword). Call before writing " +
          "new content to pick 2-3 existing pages to link to and to avoid covering a topic twice. " +
          "Each row carries live=true|false: false means the page was logged (its PR opened) " +
          "but its URL has not served 200 yet - do not link to not-yet-live pages.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const { data, error } = await db()
          .from("pages")
          .select("*")
          .eq("project_id", p.id)
          .order("created_at", { ascending: false });
        if (error) return fail(error.message);
        // Same verification pass the Guides screen runs: bounded, best-effort,
        // flips freshly merged pages to live and keeps parked ones honest.
        const rows = (data ?? []) as (LivenessRow & Record<string, unknown>)[];
        await refreshPageLiveness(p, rows);
        return ok(rows.map((r) => ({ ...r, live: isLive(r) })));
      },
    );

    server.registerTool(
      "mark_indexing_requested",
      {
        title: "Mark indexing requested",
        description:
          "Report the outcome of a Search Console 'Request indexing' browser session so " +
          "the dashboard's Get-it-on-Google card clears itself. Pass the page urls you " +
          "clicked Request indexing for in requested_urls, and any the inspection showed " +
          "were already on Google in already_indexed_urls. Urls must match the logged " +
          "pages (get_pages). Pages left over (daily quota hit, login wall) stay on the " +
          "card - just omit them.",
        inputSchema: {
          requested_urls: z
            .array(z.string())
            .optional()
            .describe("URLs indexing was just requested for, so they aren't re-submitted on the next run."),
          already_indexed_urls: z
            .array(z.string())
            .optional()
            .describe("URLs found to be indexed already, so they drop out of the queue without a request being spent."),
        },
      },
      async ({ requested_urls, already_indexed_urls }) => {
        const p = currentProject();
        const requested = requested_urls ?? [];
        const alreadyIndexed = already_indexed_urls ?? [];
        if (requested.length + alreadyIndexed.length === 0) {
          return fail("Pass requested_urls and/or already_indexed_urls.");
        }
        const now = new Date().toISOString();
        const stamp = async (urls: string[]) => {
          if (urls.length === 0) return [] as string[];
          const res = await db()
            .from("pages")
            .update({ index_requested_at: now })
            .eq("project_id", p.id)
            .in("url", urls)
            .select("url");
          if (res.error) throw new Error(res.error.message);
          return (res.data ?? []).map((r) => r.url as string);
        };
        try {
          const requestedMarked = await stamp(requested);
          // Do NOT stamp indexed_at here: that column is the hourly-gsc cron's
          // read-only URL Inspection verdict, and an agent reading GSC's
          // inspection panel can misread it or hallucinate from an ambiguous
          // screenshot. Stamping indexed_at from an unverified self-report
          // would permanently remove the page from verifyIndexing's query
          // (.is("indexed_at", null)) with nothing ever re-checking it
          // (2026-07-27 audit). index_requested_at alone already clears the
          // dashboard card (indexingQueue treats either stamp as "handled");
          // the real indexed_at confirmation still comes from the cron.
          const indexedMarked = await stamp(alreadyIndexed);
          const marked = new Set([...requestedMarked, ...indexedMarked]);
          const unknown = [...requested, ...alreadyIndexed].filter((u) => !marked.has(u));
          return ok({
            requested_marked: requestedMarked,
            already_indexed_marked: indexedMarked,
            // Urls that matched no logged page - the agent should report
            // these instead of assuming they were cleared.
            unknown_urls: unknown,
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ---- site stats --------------------------------------------------------
    server.registerTool(
      "get_site_stats",
      {
        title: "Get site stats",
        description:
          "Google Search Console snapshots for the last N days (default 28), newest first, " +
          "plus a trend summary (totals and first-half vs second-half deltas for clicks and " +
          "impressions). Each snapshot includes top queries and top pages.",
        inputSchema: {
          days: z.number().int().positive().optional().describe("How many days of history to summarise."),
        },
      },
      async ({ days }) => {
        const p = currentProject();
        const windowDays = days ?? 28;
        const since = new Date(Date.now() - windowDays * 86400000)
          .toISOString()
          .slice(0, 10);
        const { data, error } = await db()
          .from("gsc_stats")
          .select("*")
          .eq("project_id", p.id)
          .gte("date", since)
          .order("date", { ascending: true });
        if (error) return fail(error.message);
        const rows = data ?? [];
        const sum = (arr: typeof rows, key: "clicks" | "impressions") =>
          arr.reduce((a, r) => a + (r[key] ?? 0), 0);
        const half = Math.floor(rows.length / 2);
        const firstHalf = rows.slice(0, half);
        const secondHalf = rows.slice(half);
        const summary = {
          days_with_data: rows.length,
          total_clicks: sum(rows, "clicks"),
          total_impressions: sum(rows, "impressions"),
          clicks_delta_halves: sum(secondHalf, "clicks") - sum(firstHalf, "clicks"),
          impressions_delta_halves:
            sum(secondHalf, "impressions") - sum(firstHalf, "impressions"),
        };
        // An empty window with a configured property is almost never "a quiet
        // week" - say WHY it's empty (access not granted vs waiting on the
        // first sync) so the agent points the owner at the right step instead
        // of reporting zeros as a real traffic story. Probe only in the empty
        // case: established projects never pay for it.
        let note: string | undefined;
        if (rows.length === 0) {
          if (!p.gsc_site_url) {
            note = "setup incomplete: no Search Console property connected for this project.";
          } else if (isCloudMode() && p.gsc_oauth_refresh_token) {
            // Cloud connects Search Console through per-project OAuth; the
            // service-account probe below is blind to it and would wrongly
            // report "access not granted". OAuth-connected = waiting on the
            // first sync, not a setup gap.
            note = `Search Console is connected for ${p.gsc_site_url} but no data has synced yet - GSC data lags 2-3 days, and the next hourly refresh picks it up.`;
          } else if (isCloudMode()) {
            // Cloud project with no OAuth token: the owner has not connected
            // Google yet. Do NOT fall through to the probe below - it runs on
            // the shared PLATFORM service account, and gsc_site_url is
            // tenant-writable (this tool's own project, set_gsc_property, the
            // wizard picker). Probing with the operator's credential would
            // answer "can the platform read the property you just named?" for
            // any property a tenant cares to name - an access oracle over the
            // operator's own Search Console, reachable with nothing but a valid
            // project token. Same reasoning as gsc-readiness.ts and
            // gscClientForProject (2026-07-27).
            note = `setup incomplete: Search Console is not connected for this project - the owner needs to connect Google on the dashboard before traffic data can exist.`;
          } else {
            const probe = await gscAccessProbe(p.gsc_site_url);
            note =
              probe.state === "ok"
                ? `Search Console access is granted for ${p.gsc_site_url} but no data has synced yet - GSC data lags 2-3 days, the next hourly refresh picks it up.`
                : probe.state === "pending"
                  ? `setup incomplete: ${probe.why} - the owner needs to finish the Connect Search Console step on Home before traffic data can exist.`
                  : `Search Console could not be reached (${probe.why}) - treat the empty window as unknown, not as zero traffic.`;
          }
        }
        return ok({ summary, snapshots: rows.slice().reverse(), ...(note ? { note } : {}) });
      },
    );

    // ---- backlink prospects ------------------------------------------------
    server.registerTool(
      "add_backlink_prospect",
      {
        title: "Add backlink prospect",
        description:
          "Add a backlink prospect (a domain worth pursuing a link from), status 'new'. " +
          "reason should say why it's relevant or where it was found.",
        inputSchema: {
          domain: z.string().describe("The prospect site's domain, without protocol or www."),
          url: z
            .string()
            .optional()
            .describe("The specific page to pitch - a submission form, a resource list, a relevant article."),
          reason: z
            .string()
            .optional()
            .describe("Why this site would plausibly link here: what it already covers, and the angle to pitch."),
          domain_rating: z
            .number()
            .optional()
            .describe("The prospect's domain rating (0-100) from the research source. Never estimate it."),
        },
      },
      async ({ domain, url, reason, domain_rating }) => {
        const p = currentProject();
        // No DB uniqueness constraint on (project_id, domain), and the
        // playbook doesn't call get_backlink_prospects before adding - repeated
        // /seo-backlinks runs (same keyword twice, or a competitor sharing a
        // source) silently piled up duplicate rows with nothing to flag it
        // (2026-07-27 audit). Dedup here instead: normalize and compare
        // in-process rather than an ilike pattern match, so a domain
        // containing SQL wildcard characters can't cause a false match.
        const norm = (d: string) => d.trim().toLowerCase().replace(/^www\./, "");
        const target = norm(domain);
        const { data: existingRows, error: existErr } = await db()
          .from("backlink_prospects")
          .select("*")
          .eq("project_id", p.id);
        if (existErr) return fail(existErr.message);
        const dup = (existingRows ?? []).find(
          (r) => norm(r.domain as string) === target,
        );
        if (dup) return ok({ ...dup, already_queued: true });
        const { data, error } = await db()
          .from("backlink_prospects")
          .insert({ project_id: p.id, domain, url, reason, domain_rating })
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "get_backlink_prospects",
      {
        title: "Get backlink prospects",
        description:
          "List backlink prospects, optionally filtered by status (new|contacted|acquired|rejected).",
        inputSchema: {
          status: z
            .enum(["new", "contacted", "acquired", "rejected"])
            .optional()
            .describe("Filter to one stage. Omit to get every prospect."),
        },
      },
      async ({ status }) => {
        const p = currentProject();
        let q = db()
          .from("backlink_prospects")
          .select("*")
          .eq("project_id", p.id)
          .order("created_at", { ascending: false });
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "update_backlink_prospect",
      {
        title: "Update backlink prospect",
        description:
          "Move a backlink prospect through its pipeline: new -> contacted -> " +
          "acquired (or rejected). Same transition the dashboard's Backlinks " +
          "screen does - use it after outreach happened or a link went live.",
        inputSchema: {
          id: z.string().uuid().describe("The prospect's id, as returned by get_backlink_prospects."),
          status: z
            .enum(["new", "contacted", "acquired", "rejected"])
            .describe("Where this prospect now stands: contacted after outreach, acquired once the link is live."),
        },
      },
      async ({ id, status }) => {
        const p = currentProject();
        const now = new Date().toISOString();
        // Stamp when the status actually changed (migration 0041) so a stuck
        // "contacted" prospect can eventually be told apart from one that just
        // moved yesterday - previously nothing recorded this at all. Fall back
        // to a plain status update on an unmigrated schema.
        let res = await db()
          .from("backlink_prospects")
          .update({ status, status_changed_at: now })
          .eq("id", id)
          .eq("project_id", p.id)
          .select()
          .single();
        if (res.error) {
          res = await db()
            .from("backlink_prospects")
            .update({ status })
            .eq("id", id)
            .eq("project_id", p.id)
            .select()
            .single();
        }
        if (res.error) return fail(res.error.message);
        return ok(res.data);
      },
    );

    // ---- research primitives (routed through the project's keyword_source) --
    server.registerTool(
      "check_serp",
      {
        title: "Check SERP",
        description:
          "Fetch the live Google organic results for a keyword through the project's " +
          "connected SERP provider (DataForSEO or SerpApi - billed to the project's own " +
          "account/quota). Use it to judge winnability before proposing content: if page 1 " +
          "is Reddit threads and thin posts the keyword is winnable, if it's all big brands " +
          "skip it. Returns position, title, url, domain per result (default top 10). " +
          "Unavailable in GSC-only mode. SerpApi's free tier is 250 searches/month - " +
          "spend them on shortlisted keywords, not broad sweeps.",
        inputSchema: {
          keyword: z.string().min(1).describe("The search term to fetch a live SERP for, exactly as a user would type it."),
          top: z
            .number()
            .int()
            .positive()
            .max(100)
            .optional()
            .describe("How many results to return, up to 100. Defaults to a shallow page-one read."),
        },
      },
      async ({ keyword, top }) => {
        const p = currentProject();
        const provider = await serpProviderForProject(p);
        if (!provider) {
          return fail(
            p.keyword_source === "gsc"
              ? "This project runs in GSC-only mode - no live SERP provider. Rankings come " +
                "from Search Console (get_rankings). Add a free SerpApi key or DataForSEO " +
                "account in Settings to enable live SERP checks."
              : `keyword_source is '${p.keyword_source}' but no credentials are connected - ` +
                "add them in Settings.",
          );
        }
        // Bundled cloud DataForSEO: check_serp is rate-limited per project,
        // not metered against the cost budget (a live SERP lookup is cheap
        // and interactive - the real spend guard is platformBudgetGate,
        // enforced up in credsForProject). Only applies when this call is
        // actually billed to the platform account; BYO and self-host projects
        // are unaffected.
        const billedToPlatform = provider.kind === "dataforseo" && provider.creds.billedTo === "platform";
        if (billedToPlatform && (await checkSerpDailyCapReached(p.id))) {
          return fail(
            "Daily check_serp cap reached (30/day on the shared DataForSEO plan) - resets at UTC " +
              "midnight. Use track_keywords for anything worth ongoing monitoring (the rank cron " +
              "checks those daily), or connect your own DataForSEO account in Settings for " +
              "unlimited checks.",
          );
        }
        try {
          // Fetch only what this call displays: DataForSEO live bills per 10
          // results returned, and the old fixed depth-100 fetch paid for up
          // to 10 pages to show one (2026-07-27 cost audit).
          const { results, ai } = await providerOrganic(
            provider,
            keyword,
            p.location_code,
            p.language_code,
            top ?? 10,
          );
          if (billedToPlatform) void recordCheckSerpCall(p.id);
          const trimmed = results.slice(0, top ?? 10);
          if (chatMode()) {
            // A chat client is reading this to decide what to write, not to
            // build a report: rank, title and URL are the whole decision, and
            // the citation list behind an AI Overview is a research errand of
            // its own (get_ai_visibility). Domain is dropped as derivable.
            return ok({
              keyword,
              source: provider.kind,
              results: trimmed.map((r) => ({ position: r.position, title: r.title, url: r.url })),
              ai_overview: ai
                ? { present: ai.present, cited_domains: ai.references.slice(0, 5).map((x) => x.domain) }
                : null,
            });
          }
          return ok({
            keyword,
            source: provider.kind,
            results: trimmed,
            // Google's AI Overview citations when this call carried them
            // (SerpApi mode). null = not measured here - DataForSEO mode
            // records AI Overviews via the weekly sweep; read get_ai_visibility.
            ai_overview: ai,
          });
        } catch (e) {
          // Raw provider errors ("task error 40101") point the agent nowhere;
          // name the likely fix alongside them.
          const raw = e instanceof Error ? e.message : String(e);
          return fail(
            `SERP provider call failed: ${raw} - if this persists, the project's ` +
              `DataForSEO/SerpApi credentials or balance need attention in Settings.`,
          );
        }
      },
    );

    server.registerTool(
      "get_domain_rank",
      {
        title: "Get domain rank",
        description:
          "The site's cached DataForSEO Domain Rating snapshot (0-100 DR-equivalent, " +
          "referring domains, backlinks, spam score) - refreshed weekly by the domain-rating " +
          "cron, never a live paid call. Use this for the research quality bar's dynamic KD " +
          "ceiling instead of calling a backlinks endpoint directly - it works the same " +
          "whether the project has its own DataForSEO account or runs on the platform's " +
          "bundled plan. A null dr means the domain isn't indexed yet, or the cron hasn't run " +
          "its first pass for this project.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        // null creds on purpose: this tool only ever serves the cached
        // snapshot, never triggers a live (paid) refresh - that stays the
        // daily domain-rating cron's job exclusively.
        return ok(await getDomainRating(p.id, p.domain, null));
      },
    );

    server.registerTool(
      "get_dataforseo_usage",
      {
        title: "Get DataForSEO usage",
        description:
          "This project's DataForSEO billing status: who it's billed to (own connected " +
          "account, the platform's bundled plan, or neither), month-to-date spend against the " +
          "plan's monthly budget when billed to the platform, the projected month-end spend " +
          "with the rank cron's pacing level (normal / slowed / weekly - pacing thins the " +
          "check cadence before the budget can run out, so tracking never stops mid-month), " +
          "and today's check_serp count against its daily cap. For a project on its own account (or self-host), usage " +
          "isn't metered here - billed_to reads 'own' or null and the spend/budget fields " +
          "stay zero.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const status = await platformUsageStatus(p.id);
        return ok(
          status.billed_to === "platform"
            ? status
            : {
                ...status,
                note:
                  status.billed_to === "own"
                    ? "This project uses its own connected DataForSEO account - usage isn't metered against a platform budget."
                    : "This project has no DataForSEO connected - usage isn't metered.",
              },
        );
      },
    );

    // ---- AI visibility (GEO) --------------------------------------------
    server.registerTool(
      "get_ai_visibility",
      {
        title: "Get AI visibility",
        description:
          "How AI answer engines see this site: per-engine summary (queries checked, AI " +
          "answers seen, citation rate), a per-day trend, the latest verbatim answers, and " +
          "the gap list - domains AI cites on queries where this site is NOT cited. Google " +
          "AI Overview data comes from the weekly rank sweep automatically; other engines fill " +
          "in when the geo-scan workflow runs. Use the gap list to pick what to write next.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        return ok(await getAiVisibility(p.id, p.domain));
      },
    );

    server.registerTool(
      "record_ai_citations",
      {
        title: "Record AI citations",
        description:
          "Write geo-scan results: for each query asked to an AI answer engine, whether an " +
          "answer was produced, whether it cited this site, and every source it cited. " +
          "Engines: claude | chatgpt | perplexity | gemini (google_ai_overview is cron-only - " +
          "it comes from real SERP data). Include a short verbatim answer_excerpt so the " +
          "owner can read the actual answer behind the number. Called by the geo-scan " +
          "workflow after sampling each query.",
        inputSchema: {
          results: z
            .array(
              z.object({
                engine: z.enum(AGENT_ENGINES).describe("Which AI engine produced this answer."),
                query: z
                  .string()
                  .min(1)
                  .max(300)
                  .describe("The customer question exactly as it was asked."),
                has_ai_answer: z
                  .boolean()
                  .describe("Whether the engine produced an AI answer at all, as opposed to plain links or nothing."),
                cited: z.boolean().describe("Whether this site was among the answer's cited sources."),
                cited_url: z
                  .string()
                  .max(600)
                  .optional()
                  .describe("Which URL of this site was cited. Pass it whenever cited is true."),
                answer_excerpt: z
                  .string()
                  .max(1500)
                  .optional()
                  .describe("A verbatim excerpt of the answer. Copy it exactly - never paraphrase or summarise."),
                citations: z
                  .array(
                    z.object({
                      domain: z.string().min(1).max(253).describe("The cited source's domain."),
                      url: z.string().max(600).optional().describe("The cited source's full URL."),
                      title: z.string().max(300).optional().describe("The cited source's title as the engine showed it."),
                    }),
                  )
                  .max(30)
                  .optional()
                  .describe("Every source the answer cited, in the order shown - including competitors, which is how gap domains are found."),
              }),
            )
            .min(1)
            .max(100)
            .describe("One entry per question asked. Send the whole scan in a single call, not one call per question."),
        },
      },
      async ({ results }) => {
        const p = currentProject();
        const rec = await recordAiSnapshots(p.id, results);
        if ("error" in rec) return fail(rec.error);
        return ok({ recorded: rec.inserted });
      },
    );

    server.registerTool(
      "suggest_keywords",
      {
        title: "Suggest keywords",
        description:
          "Expand a seed keyword into related searches via Google Autocomplete - free, " +
          "works in every mode, no credentials needed. Returns real queries people type " +
          "(no volume numbers). Combine with get_site_stats top queries for seeds, then " +
          "check_serp on the shortlist to judge winnability.",
        inputSchema: {
          seed: z.string().min(1).describe("The base term to build variations from."),
          modifiers: z
            .array(z.string())
            .max(8)
            .optional()
            .describe("Words to combine with the seed, e.g. 'free', 'vs', 'for teams', 'alternative'."),
        },
      },
      async ({ seed, modifiers }) => {
        const p = currentProject();
        try {
          const suggestions = await expandKeyword(seed, p.language_code, modifiers);
          return ok({ seed, suggestions });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "keyword_ideas",
      {
        title: "Keyword ideas with volume & difficulty",
        description:
          "Expand seed keywords into keywords that are actually RELATED to them WITH real " +
          "monthly search volume and keyword difficulty (KD), via DataForSEO. Fixed 2026-07-30: " +
          "this used to call Labs' keyword_ideas/live, which DataForSEO's own docs describe as " +
          "CATEGORY-based, not semantic - live seeds like \"ai seo agent\" came back with " +
          "\"audemars piguet marketing\" and \"agent provocateur sale\" (same rough market segment, " +
          "zero topical relation), and language_code never filtered the output language either, " +
          "so French/Italian keywords leaked into English-seed results unfiltered. This tool now " +
          "calls keyword_suggestions (results GUARANTEED to contain the seed phrase) + " +
          "related_keywords (Google's real \"searches related to\" graph) per seed, merges and " +
          `dedupes both, and drops anything with no search volume or a detected language other ` +
          `than the project's configured one (see set_market) before it ever reaches you. ` +
          `Queries the project's configured market. Works whenever the project has DataForSEO - its ` +
          "OWN account or the platform's BUNDLED plan (cloud). Returns " +
          "{ ideas: [{keyword, volume, kd, cpc}], note } sorted by volume, highest first. COST: " +
          `up to ${KEYWORD_IDEAS_SEED_CAP} seeds are actually expanded per call (send your ` +
          "highest-signal seeds first - extras beyond the cap are silently skipped, but named in " +
          "the note), and each expanded seed costs 2 metered DataForSEO calls (one " +
          "keyword_suggestions + one related_keywords), billed to the platform on the bundled " +
          "plan and counted against the project's monthly budget - so a full call can cost up to " +
          `${KEYWORD_IDEAS_SEED_CAP * 2} calls, not 1. The note always states how many seeds were ` +
          "expanded vs skipped so you are never silently handed partial data. Returns an empty " +
          "ideas list WITH a note (never an error) when the project has no DataForSEO access or " +
          "the monthly budget is spent - fall back to check_serp + product judgment then.",
        inputSchema: {
          seeds: z
            .array(z.string().min(1))
            .min(1)
            .max(20)
            .describe(
              `Seed keywords to expand from, BEST FIRST - only the first ${KEYWORD_IDEAS_SEED_CAP} are ` +
                "actually expanded (2 metered calls each), the rest are skipped and named in the response note.",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe("Maximum ideas to return, up to 200, after merging and deduping both endpoints across all expanded seeds."),
        },
      },
      async ({ seeds, limit }) => {
        const p = currentProject();
        // credsForProject already resolves BYO-vs-platform and enforces the
        // plan + monthly-budget gates - a null result means "no data source
        // right now", which the agent handles by falling back, so it's an
        // empty-with-note success, not a failure.
        const creds = await credsForProject(p);
        if (!creds) {
          return ok({
            seeds,
            ideas: [],
            note: "No DataForSEO access for this project (free/GSC-only mode, or the monthly bundled budget is spent). Use check_serp + product judgment - do not invent numbers.",
          });
        }

        // One call is worth up to 10 metered requests, which makes an
        // unattended loop here the most expensive mistake available through
        // this server. Named refusal, never a silent empty list: a caller told
        // "no ideas" retries, a caller told "tomorrow" stops.
        if (await keywordIdeasDailyCapReached(p.id)) {
          return fail(
            `You have used today's ${KEYWORD_IDEAS_DAILY_CAP} keyword_ideas calls for this site; it resets at UTC midnight. ` +
              "Work with the ideas you already have, or use check_serp and suggest_keywords, which are not capped this way.",
          );
        }
        void recordKeywordIdeasCall(p.id);

        // Cost control (2026-07-30): the old call was 1 metered call for up
        // to 20 seeds; two-endpoints-per-seed makes cost scale with seed
        // count, so cap how many are actually expanded rather than trusting
        // every caller to self-limit. Seeds arrive highest-signal-first (the
        // tool description says so), so a plain slice keeps the best ones.
        const expanded = seeds.slice(0, KEYWORD_IDEAS_SEED_CAP);
        const skipped = seeds.slice(KEYWORD_IDEAS_SEED_CAP);

        // Merge keyword_suggestions + related_keywords per seed, deduped by
        // lowercased keyword (keep the higher-volume duplicate when both
        // endpoints surface the same keyword). Never fabricate: a seed whose
        // calls both fail contributes nothing, not a guess.
        const merged = new Map<string, KeywordIdea>();
        const callErrors: string[] = [];
        for (const seed of expanded) {
          const settled = await Promise.allSettled([
            keywordSuggestions(seed, creds, limit ?? 100, p.location_code, p.language_code),
            relatedKeywords(seed, creds, limit ?? 100, p.location_code, p.language_code),
          ]);
          for (const result of settled) {
            if (result.status === "rejected") {
              callErrors.push(
                result.reason instanceof Error ? result.reason.message : String(result.reason),
              );
              continue;
            }
            for (const idea of result.value.ideas) {
              if (!idea.keyword) continue;
              if (!idea.search_volume) continue; // no/zero volume - never invent a number
              // Server-side filters already drop is_another_language=true rows,
              // but detected_language is the direct signal the incident above
              // was actually about - check it too as a belt-and-suspenders pass,
              // against the PROJECT's language: a hardcoded "en" here would
              // silently drop every result for a Hebrew or German site.
              if (idea.detected_language && idea.detected_language !== p.language_code) continue;
              const key = idea.keyword.toLowerCase();
              const existing = merged.get(key);
              if (!existing || (idea.search_volume ?? 0) > (existing.search_volume ?? 0)) {
                merged.set(key, idea);
              }
            }
          }
        }

        // Every call for every expanded seed failing is a real vendor/creds
        // problem, not "no related keywords" - report it as an error rather
        // than a suspiciously empty success.
        if (callErrors.length > 0 && merged.size === 0) {
          return fail(`DataForSEO calls failed for every seed: ${callErrors[0]}`);
        }

        const sorted = Array.from(merged.values())
          .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
          .slice(0, limit ?? 100)
          .map((i) => ({
            keyword: i.keyword,
            volume: i.search_volume,
            kd: i.keyword_difficulty,
            cpc: i.cpc,
          }));

        const noteParts = [
          `Expanded ${expanded.length} of ${seeds.length} seed(s) via keyword_suggestions + ` +
            `related_keywords (2 metered calls each, ${expanded.length * 2} total).`,
        ];
        if (skipped.length > 0) {
          noteParts.push(
            `Skipped ${skipped.length} seed(s) past the cap of ${KEYWORD_IDEAS_SEED_CAP}: ${skipped.join(", ")}.`,
          );
        }
        if (callErrors.length > 0) {
          noteParts.push(
            `${callErrors.length} of ${expanded.length * 2} calls failed (results below are partial): ${callErrors[0]}`,
          );
        }
        return ok({ seeds, ideas: sorted, note: noteParts.join(" ") });
      },
    );

    // ---- site profile (backlink playbook personalization) -----------------
    server.registerTool(
      "get_site_profile",
      {
        title: "Get site profile",
        description:
          "Read the site profile the backlink playbook personalizes from (name, " +
          "tagline, descriptions, categories, tags). Returns null if the setup " +
          "workflow (get_instructions workflow=setup) has not written it yet.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const { data, error } = await db()
          .from("site_profile")
          .select("*")
          .eq("project_id", p.id)
          .maybeSingle();
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "set_site_profile",
      {
        title: "Set site profile",
        description:
          "Write the site profile the backlink playbook prefills every directory " +
          "submission from. Called by the setup workflow (get_instructions " +
          "workflow=setup) after researching the product. Length contracts: tagline <= 60 chars, " +
          "short_description <= 160 chars, long_description 300-600 chars - " +
          "directories enforce these limits, so keep to them.",
        inputSchema: {
          name: z.string().min(1).describe("The site or product name as it should appear in a directory listing."),
          url: z.string().url().describe("The site's canonical homepage URL."),
          tagline: z
            .string()
            .min(1)
            .max(60)
            .describe("One short line summarising the product, 60 characters or fewer."),
          short_description: z
            .string()
            .min(1)
            .max(160)
            .describe("One or two sentences, 160 characters or fewer - the blurb most directories ask for."),
          long_description: z
            .string()
            .min(100)
            .max(700)
            .describe("A fuller description between 100 and 700 characters, for directories with a longer field."),
          categories: z
            .array(z.string())
            .min(1)
            .max(5)
            .describe("One to five categories the product belongs to."),
          tags: z
            .array(z.string())
            .min(1)
            .max(10)
            .describe("One to ten keywords describing the product."),
        },
      },
      async (profile) => {
        const p = currentProject();
        const { data, error } = await db()
          .from("site_profile")
          .upsert(
            { project_id: p.id, ...profile, updated_at: new Date().toISOString() },
            { onConflict: "project_id" },
          )
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "set_gsc_property",
      {
        title: "Set tracked Search Console property",
        description:
          "Correct which Google Search Console property this project tracks. " +
          "Onboarding guesses `sc-domain:<domain>`, but many real properties " +
          "are URL-prefix (`https://example.com/`) - if GSC data never arrives " +
          "and access checks keep failing, the guess is likely wrong. Pass the " +
          "property exactly as Search Console names it. Same write as the " +
          "dashboard's 'use this property' button on /google.",
        inputSchema: {
          site_url: z
            .string()
            .min(1)
            .describe("The Search Console property to track, exactly as Search Console lists it (e.g. 'sc-domain:example.com' or 'https://example.com/')."),
        },
      },
      async ({ site_url }) => {
        const p = currentProject();
        const err = await setTrackedProperty(p.id, site_url);
        if (err) return fail(err);
        return ok({ project: p.slug, gsc_site_url: site_url });
      },
    );

    // Parity for the Settings "Search market" row. Every project defaults to
    // US/English, which is wrong for any site whose audience googles in
    // another country or language - and until this is set, keyword_ideas and
    // rank checks measure a market the site isn't in.
    server.registerTool(
      "set_market",
      {
        title: "Set the project's search market",
        description:
          "Set which Google country and language this project's rank checks (daily ranks, " +
          "check_serp) and keyword research (keyword_ideas, suggest_keywords) query. Defaults " +
          "to United States / English; a site whose audience searches elsewhere - or in another " +
          "language - measures the wrong market until this is corrected. Same write as the " +
          "dashboard's Settings > Search market row. Supported markets: " +
          MARKETS.map((m) => `${m.location_code} = ${m.label} (${m.languages.map((l) => l.code).join("/")})`).join(", ") +
          ".",
        inputSchema: {
          location_code: z
            .number()
            .int()
            .describe("DataForSEO location code from the supported list, e.g. 2840 = United States, 2376 = Israel."),
          language_code: z
            .string()
            .min(2)
            .max(5)
            .describe("Language code the chosen market supports, e.g. 'en', 'he', 'de'."),
        },
      },
      async ({ location_code, language_code }) => {
        const p = currentProject();
        const err = await setProjectMarket(p.id, location_code, language_code);
        if (err) return fail(err);
        return ok({ project: p.slug, location_code, language_code });
      },
    );

    // Parity for the Settings launch-date row's Detect button. The launch
    // date drives the Journey stage, publishing pace and research difficulty
    // posture, and it defaults to "the day the project joined DispatchSEO" -
    // which poses an established site as a newborn whenever RDAP had nothing
    // for the domain (most ccTLDs).
    server.registerTool(
      "detect_site_launch",
      {
        title: "Detect the site's real launch date",
        description:
          "Find evidence of when this site actually went live - Search Console's earliest " +
          "impression date (Google keeps ~16 months of history, so for older sites this is " +
          "a floor, flagged at_least) and the Wayback Machine's first capture - and move " +
          "site_launched_at BACKWARD to the earlier of the two. Never moves the date " +
          "forward and never overrides an owner's earlier correction; run it when the " +
          "launch date looks like the DispatchSEO signup date. Same logic as the Settings " +
          "row's Detect button and the automatic backfill that runs when GSC data first lands.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const { applyDetectedLaunch } = await import("@/lib/site-launch");
        const result = await applyDetectedLaunch(p);
        if (!result) {
          return fail(
            "No evidence found: Search Console has no history for this property and the Wayback Machine has no capture of the domain. The owner can set the date by hand on Settings.",
          );
        }
        return ok({
          project: p.slug,
          detected: result.detected.date,
          source: result.detected.source,
          at_least: result.detected.at_least,
          updated: result.updated,
          note: result.updated
            ? "site_launched_at moved back to the detected date."
            : "Detected date is not meaningfully earlier than the current launch date - nothing changed.",
        });
      },
    );

    // Parity for the Settings danger zone's Disconnect button (CLAUDE.md's
    // rule that anything the dashboard can do, the agent can do too). Unlike
    // set_github_repo above this is NOT cloud-only: the gap it closes is
    // sharpest on self-host, where the home project cannot be deleted and this
    // is the only way to stop a pipeline at all.
    //
    // Deleting a project deliberately has no MCP tool - it cascades across
    // every table and ends in a redirect. Disconnecting is the reversible
    // half: the repo is released, the project and all of its history stay.
    server.registerTool(
      "disconnect_repo",
      {
        title: "Disconnect the GitHub repo",
        description:
          "Stop DispatchSEO running in this project's repo: disable and delete the seo-* " +
          "workflows, remove the .dispatchseo files and the SEO_MCP_API_KEY secret, and clear " +
          "the connection. Schedules stop, so it stops consuming the owner's GitHub Actions " +
          "minutes. Published guides, tools and pages are never touched, and the project keeps " +
          "its keywords, rankings and history - reconnecting later re-installs the pipeline. " +
          "If the repo cannot be reached the connection is KEPT, so the attempt can be retried.",
        inputSchema: {
          confirm: z
            .string()
            .describe(
              "The connected repo as owner/name, typed exactly. Guards against a disconnect nobody asked for.",
            ),
        },
      },
      async ({ confirm }) => {
        const p = currentProject();
        if (!p.github_repo) return fail("No repo is connected to this project.");
        if (confirm.trim().toLowerCase() !== p.github_repo.toLowerCase()) {
          return fail(`Pass confirm="${p.github_repo}" exactly to disconnect it.`);
        }
        const { disconnectRepoFromProject } = await import("@/lib/pipeline-uninstall");
        const result = await disconnectRepoFromProject(p);
        if (!result.ok) {
          return fail(
            `DispatchSEO could not be fully removed from ${result.repo}: ${result.warnings.join(" ")} ` +
              `The repo is still connected, so this can be retried.`,
          );
        }
        return ok({
          disconnected: result.repo,
          workflows_disabled: result.teardown?.workflows_disabled ?? 0,
          files_removed: result.teardown?.files_removed ?? 0,
          secret_removed: result.teardown?.secret_removed ?? false,
          note: "Schedules stopped. Published content and this project's history are unchanged.",
        });
      },
    );

    server.registerTool(
      "set_github_repo",
      {
        title: "Set the connected GitHub repo",
        description:
          "Point this project at the GitHub repository its content pipeline lives in. " +
          "Cloud: validated against the project's GitHub App installation's live repo " +
          "list - a repo outside the installation is refused. Self-host: validated " +
          "against the instance's stored GitHub token when one exists (it must be able " +
          "to see the repo and read its code), format-only before that token is saved. " +
          "Same write as the onboarding wizard's repo picker. Changing an already-" +
          "connected repo does NOT touch the old repo - if the pipeline was installed " +
          "there, run disconnect_repo first so its workflows stop.",
        inputSchema: {
          repo: z
            .string()
            .min(3)
            .describe("The repository as owner/name (a github.com URL is accepted too)."),
        },
      },
      async ({ repo }) => {
        const p = currentProject();
        if (!isCloudMode()) {
          const { setProjectRepoSelfHost } = await import("@/lib/repo-connect");
          const result = await setProjectRepoSelfHost(p, repo);
          if ("error" in result) return fail(result.error);
          return ok({ project: p.slug, github_repo: result.repo });
        }
        if (!p.github_installation_id) {
          return fail("The DispatchSEO GitHub App is not installed for this project yet.");
        }
        const { listInstallationRepos } = await import("@/lib/github-app");
        let repos: Array<{ full_name: string }>;
        try {
          repos = await listInstallationRepos(p.github_installation_id);
        } catch {
          return fail("Could not reach GitHub to validate the repo - try again.");
        }
        if (!repos.some((r) => r.full_name === repo)) {
          return fail(
            `"${repo}" is not part of this project's App installation. In scope: ${repos.map((r) => r.full_name).join(", ") || "none"}.`,
          );
        }
        const { error } = await db().from("projects").update({ github_repo: repo }).eq("id", p.id);
        if (error) return fail(error.message);
        return ok({ project: p.slug, github_repo: repo });
      },
    );

    // ---- dashboard parity (same lib functions the screens render from) -----
    // These tools answer "what's going on with my SEO" in Claude Code with the
    // exact numbers the dashboard shows - they call the same analytics/activity
    // /automations modules the pages do, so the two views can never drift.
    server.registerTool(
      "get_overview",
      {
        title: "Get overview",
        description:
          "The dashboard Home/Analytics view in one call: 28-day traffic totals " +
          "(clicks, impressions, CTR, avg position), live last-24h numbers, domain " +
          "rating, the keyword ranking table, top search queries, and per-page " +
          "traffic for every built guide and tool. Also carries the journey " +
          "(which SEO stage the site is in, milestones, what to expect next) and " +
          "this week's real movement. Start here when the user asks " +
          "'what's going on with my SEO' - it's the whole picture. For raw daily " +
          "GSC snapshots use get_site_stats; for rank history use get_rankings.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        try {
          const o = await getAnalyticsOverview(p);
          const [journey, week] = await Promise.all([
            getJourney(p, o),
            getWeeklyProgress(p, o),
          ]);
          const pageRow = (r: (typeof o.guides)[number]) => ({
            url: r.url,
            title: r.title,
            type: r.type,
            primary_keyword: r.primary_keyword,
            published_at: r.published_at,
            clicks: r.clicks,
            impressions: r.impressions,
            avg_position: r.avgPosition,
          });
          const rankings = o.rankings.map((r) => ({
            keyword: r.keyword.keyword,
            position: r.current,
            change_30d: r.change,
            volume: r.volume,
          }));
          if (chatMode()) {
            // Everything a writer needs to pick an angle, and nothing that is
            // only useful on a dashboard. The per-page traffic table is the
            // expensive part - a site with fifty guides sends fifty rows - so
            // chat gets counts plus the handful that are actually moving.
            return ok({
              domain: o.domain,
              stage: journey?.stage ?? null,
              totals_28d: o.totals,
              domain_rating: o.dr,
              tracked_keywords: rankings.length,
              keywords_in_top100: o.rankingCount,
              // Best-ranked first: the ones worth strengthening or defending.
              rankings: rankings
                .filter((r) => r.position != null)
                .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
                .slice(0, 15),
              top_queries: (o.topQueries ?? []).slice(0, 15),
              published: { guides: o.guides.length, tools: o.tools.length },
              top_pages: [...o.guides, ...o.tools]
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 10)
                .map((r) => ({ url: r.url, title: r.title, clicks: r.clicks, impressions: r.impressions })),
            });
          }
          return ok({
            domain: o.domain,
            journey,
            this_week: week,
            domain_rating: o.dr,
            totals_28d: o.totals,
            last_24h: o.fresh24,
            tracked_keywords: o.rankings.length,
            keywords_in_top100: o.rankingCount,
            rankings,
            top_queries: o.topQueries,
            guides: o.guides.map(pageRow),
            tools: o.tools.map(pageRow),
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "get_briefing",
      {
        title: "Get briefing",
        description:
          "The dispatcher's briefing - the card at the top of the dashboard " +
          "Home, in the agent's own first-person voice. Carries the day's " +
          "clicks and impressions, what the pipeline is working on right now, " +
          "and the QUICK WINS: the handful of things worth acting on today, " +
          "picked from Search Console using the same signals the big SEO tools " +
          "use (striking-distance queries at position 8-20, page-one queries " +
          "that rank but don't get clicked, high-impression zero-click " +
          "queries, rising queries, searches the site newly appears for, and " +
          "first-ever milestones with their real-world base rates). `action` " +
          "carries today's one hands-on move (usually the next backlink " +
          "playbook listing) when one is genuinely due, null otherwise. " +
          "Use this when the owner asks 'what should I " +
          "do about SEO today' or 'anything worth acting on' - it is the " +
          "shortlist. get_overview is the full picture behind it; " +
          "get_next_actions is the queue of decisions waiting on the owner. " +
          "An empty wins list is a real answer on a young site - the " +
          "'patience' field says why, and inventing a win to fill the gap " +
          "would defeat the whole point.",
        inputSchema: {},
      },
      async () => {
        try {
          return ok(await getBriefing(currentProject()));
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "get_activity",
      {
        title: "Get activity",
        description:
          "What the SEO manager has been doing, derived from the operational " +
          "tables - the dashboard's activity report. 'today' is a granular " +
          "checklist since UTC midnight (each publish/approval named); 'week' " +
          "aggregates the last 7 days into counts.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        try {
          const report = await getActivityReport(p.id);
          return ok({
            today: report.today.map((l) => l.label),
            week: report.week.map((l) => l.label),
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "get_automations",
      {
        title: "Get automations",
        description:
          "The automations registry - what runs on its own, on what schedule, and " +
          "an evidence line per automation (last run, last snapshot, last build) " +
          "derived from the data it writes. Use it to answer 'is the nightly rank " +
          "check running?' or 'when does the guide builder fire?'.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        try {
          const evidence = await gatherEvidence(db(), p.id);
          return ok(
            AUTOMATIONS.map((a) => ({
              id: a.id,
              name: a.name,
              status: a.status,
              what: a.what,
              schedule: a.schedule,
              flow: a.flow,
              evidence: evidence[a.id] ?? null,
            })),
          );
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "set_agent",
      {
        title: "Set the coding agent",
        description:
          "Choose which coding agent runs this project's UNATTENDED builders - " +
          "the scheduled GitHub Actions, or the in-stack container on a " +
          "self-hosted install. This does NOT change which agent you are: any " +
          "agent connected over MCP can drive everything interactively " +
          "regardless of this setting. It takes effect on the next scheduled " +
          "run with no repo change, because the workflow files carry every " +
          "agent and ask which to use at run time. The reply names anything " +
          "the owner still has to do - chiefly adding the new agent's API " +
          "credential where the builders run. Ask the owner before switching; " +
          "the agents bill differently (a Claude or Cursor subscription vs " +
          "metered OpenAI usage - see each option's note), so this is their " +
          "call, not yours.",
        inputSchema: {
          // BUILDER_AGENT_IDS, not AGENT_IDS: this writes projects.agent, which
          // decides who runs the scheduled builds. An agent that speaks MCP but
          // that no workflow can invoke has no business in this enum - offering
          // it would let the agent set a builder that silently never runs.
          agent: z
            .enum(BUILDER_AGENT_IDS)
            .describe(builderAgents().map((a) => `${a.id} = ${a.displayName} (${a.cost.note})`).join("; ")),
        },
      },
      async ({ agent }) => {
        try {
          const res = await setProjectAgent(currentProject(), agent);
          return ok({
            agent: res.agent.id,
            display_name: res.agent.displayName,
            cost_model: res.agent.cost.model,
            applies: "next scheduled run - no repo change needed",
            todo: res.todo,
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "set_internal_linking",
      {
        title: "Set internal back-linking",
        description:
          "Turn internal back-linking on or off for this project. When ON, the " +
          "guide builder edits 2-3 of the closest ALREADY-PUBLISHED posts in the " +
          "same PR so they link to each new guide - one sentence changed per " +
          "post, nothing else touched - which is what turns a set of posts into " +
          "a cluster that compounds. This is the only DispatchSEO behaviour that " +
          "modifies pages the owner already published, so it is OFF by default " +
          "and separate from the semi/auto automation flags; a PR that edits " +
          "published posts is never auto-merged regardless of auto_merge. Ask " +
          "the owner before turning this on - do not enable it on your own " +
          "initiative because it would make a run tidier.",
        inputSchema: {
          enabled: z.boolean().describe("true to allow editing published posts, false to stop"),
        },
      },
      async ({ enabled }) => {
        const p = currentProject();
        const { error } = await db()
          .from("projects")
          .update({ internal_linking: Boolean(enabled) })
          .eq("id", p.id);
        if (error) {
          if (error.message.includes("internal_linking")) {
            return fail(
              "This database hasn't run migration 0045 yet, so internal linking can't be changed. Apply supabase/migrations/0045_project_internal_linking.sql first.",
            );
          }
          return fail(error.message);
        }
        return ok({
          project: p.slug,
          internal_linking: Boolean(enabled),
          note: enabled
            ? "The guide builder may now edit up to 3 published posts per build to link back to the new guide. Those PRs always wait for a human review."
            : "The guide builder will no longer touch already-published posts.",
        });
      },
    );

    server.registerTool(
      "get_cron_health",
      {
        title: "Get cron health",
        description:
          "The latest run of this project's background jobs. On the hosted " +
          "version that means YOUR project's jobs only - the platform's own " +
          "instance-wide crons (daily-ranks, hourly-gsc, serp-collect, " +
          "deploy-check) belong to the operator and are deliberately not " +
          "listed, so an empty result here never means 'the backend is down'. " +
          "A self-hosted instance owns its crons and sees all of them. " +
          "Covered: deploy-check (the " +
          "post-deploy smoke test after every push), the SEO GitHub workflows " +
          "(seo-daily, seo-auto-merge, seo-tools, trend scans, weekly research - " +
          "they phone their outcomes home), and the secrets canary that " +
          "validates tokens/keys every 6h. Each entry: ok/failed, error strings, " +
          "and whether the job is stale (hasn't run inside its expected window). " +
          "This is a SUPERSET of the dashboard's red banner: the banner only " +
          "shows failures that repeated (repeat_failure=true), missed a whole " +
          "window, or are urgent (dead credentials, a broken deploy) - a " +
          "one-off failed run appears here and nowhere else, and usually cures " +
          "itself on the next scheduled run. Check this when rankings or GSC " +
          "stats look frozen, when a build seems missing, or to confirm the " +
          "latest deploy passed its " +
          "smoke test. Empty means no job has ever logged a run (fresh install). " +
          "An entry with update_available=true is NOT a failure: it means the " +
          "repo's installed pipeline pack is a version behind this backend " +
          "(informational - re-running the install workflow applies it). An entry with blocked_on_review=true is not a failure either: the builder has waited a full schedule window behind an unmerged guide/tool PR - merging or closing that PR is the only thing that lets it run again, so tell the owner which PR rather than re-running the job.",
        inputSchema: {},
      },
      async () => {
        try {
          // Scoped to the calling project: instance-wide jobs plus this
          // project's own --slug-suffixed reports. A project token must
          // never read a sibling project's job names or failure text.
          const health = await getCronHealth(currentProject().slug);
          // Docker installs: when the in-stack builder last polled for
          // work (null = never - token not set or container not started).
          // Parity with the wizard finale row and Home's setup card.
          if (process.env.POSTGREST_URL) {
            const inst = (await instanceSettings()) as unknown as {
              builder_last_seen_at?: string | null;
              builder_claude_token?: string | null;
            } | null;
            return ok({
              builder_last_seen_at: inst?.builder_last_seen_at ?? null,
              // Whether the builder's Claude token is CONFIGURED (env or the
              // wizard-stored value) - true the instant the owner pastes it,
              // independent of builder_last_seen_at (the heartbeat lags a full
              // poll, up to ~10 min). The install agent must treat "token
              // configured" - not "builder polled" - as the signal that the
              // builder will run research, or it falsely falls back to running
              // it inline (2026-07-24: the owner pasted the token and the agent
              // couldn't tell).
              // Per-PROJECT-agent, never hardcoded to Claude: this field is
              // load-bearing (the install playbook branches on it - false
              // sends the agent off to run research inline and tell the owner
              // to finish a step they finished), and a Codex self-host with
              // OPENAI_API_KEY set used to read back false here, re-creating
              // the exact 2026-07-24 regression along the Codex axis.
              builder_token_configured: Boolean(
                await builderAgentToken(projectAgent(currentProject()).id),
              ),
              // Parity with Home's builder card and the wizard finale row:
              // true when EITHER build path shows recent life (in-stack
              // builder heartbeat or GitHub Actions builds reporting home).
              builds_active: await buildsActive(),
              // Parity with Home's "get emailed when something breaks" card:
              // false = failures only surface on the dashboard banner.
              alert_email_configured: Boolean(
                process.env.RESEND_API_KEY && process.env.ALERT_EMAIL,
              ),
              jobs: health,
            });
          }
          return ok(health);
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "mark_cron_fixed",
      {
        title: "Mark cron issue fixed",
        description:
          "Clear a background-job alert (the dashboard's red banner) after " +
          "fixing the underlying problem. Logs a synthetic ok run for the " +
          "job, clearing both alert shapes - a failed last run and an " +
          "overdue job. Call this ONLY after you actually fixed AND " +
          "verified the job (re-ran the workflow / hit the endpoint and saw " +
          "it succeed) - if the problem persists, the next failed run or " +
          "missed window re-raises the alert. Use the exact job name from " +
          "get_cron_health, including any --<project> suffix; fails if that " +
          "job has no active alert.",
        inputSchema: {
          job: z.string().min(1).describe("The cron job key to clear, as reported by get_cron_health."),
        },
      },
      async ({ job }) => {
        // Scoped through getCronHealth(slug) inside markCronFixed: a project
        // token can only clear instance-wide alerts or its own --slug jobs -
        // a sibling project's job never appears in its health list.
        const p = currentProject();
        try {
          await markCronFixed(job, p.slug);
          return ok({
            marked_fixed: job,
            note: "alert cleared; the next real run keeps or re-raises it truthfully",
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "get_next_actions",
      {
        title: "Get next actions",
        description:
          "Everything waiting on a human decision - the dashboard's 'Next actions' " +
          "card: suggestions awaiting approval (decide with update_suggestion), " +
          "approved items waiting for their build, builds in progress, open SEO PRs " +
          "(merge with merge_pr once checks are green), and pages waiting for a " +
          "Search Console 'Request indexing' click (comes with a paste-ready " +
          "@browser command; report the outcome via mark_indexing_requested). " +
          "When the site's backlink profile is thin (under ~5 referring " +
          "domains) or measured-flat for a month, `backlink_move` carries the " +
          "one free playbook listing to action next - relay it to the owner " +
          "and mark it with set_playbook_status once actually submitted. " +
          "On a project with auto-approval ON for a type, pending items of that " +
          "type are NOT owner decisions - they come back under `held` instead of " +
          "`awaiting_approval`, because the owner delegated the call. Never ask " +
          "the owner to approve a held item; the research run releases it when " +
          "the site's authority grows into its difficulty zone.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const client = db();
        const [sugRes, pagesRes, prs, authority] = await Promise.all([
          client
            .from("suggestions")
            .select(
              "id, type, title, primary_keyword, keyword_volume, keyword_difficulty, rationale, status, result_pr_url, created_at",
            )
            .eq("project_id", p.id)
            .in("status", ["pending", "approved", "in_progress"])
            .order("created_at", { ascending: true }),
          client
            .from("pages")
            .select("*")
            .eq("project_id", p.id)
            .order("created_at", { ascending: false }),
          openSeoPrs(p),
          // Cache-row + history reads only; failure degrades to no nudge.
          getAuthority(p).catch(() => null),
        ]);
        if (sugRes.error) return fail(sugRes.error.message);
        const sugs = sugRes.data ?? [];
        const queue = indexingQueue((pagesRes.data ?? []) as IndexingPageRow[]);
        // Auto-approval ON for a type means the owner delegated that decision,
        // so a pending item of that type is HELD (the bar does not admit it
        // yet), never a chore. Reporting it as awaiting_approval is what made
        // hands-off projects ask for hands on the dashboard and over MCP alike.
        const autoFlags = effectiveAutomations(p);
        const isHeld = (s: { type: string; status: string }) =>
          s.status === "pending" &&
          (s.type === "tool" ? autoFlags.auto_approve_tools : autoFlags.auto_approve);
        return ok({
          awaiting_approval: sugs.filter((s) => s.status === "pending" && !isHeld(s)),
          held: sugs.filter(isHeld),
          approved_waiting_build: sugs.filter((s) => s.status === "approved"),
          building_now: sugs.filter((s) => s.status === "in_progress"),
          open_seo_prs: prs,
          indexing_queue: {
            pages: queue.map((q) => ({
              url: q.url,
              title: q.title,
              published_at: q.published_at ?? q.created_at,
            })),
            browser_command:
              queue.length > 0
                ? indexingBrowserCommand(p, queue.map((q) => q.url))
                : null,
          },
          // The links half of the job, kept specific: null when the profile
          // is healthy-and-growing, unmeasured, or the free playbook is
          // exhausted - never a vague "build backlinks".
          backlink_move:
            authority && needsLinkMove(authority)
              ? {
                  referring_domains: authority.referring_domains,
                  gained_recent: authority.gained_recent,
                  next: authority.next_move,
                  free_listings_done: authority.free_done,
                  free_listings_total: authority.free_total,
                  note:
                    "Referring domains are what young pages stall without. Walk the owner through this listing (the copy is prefilled on the dashboard's Playbook page), then set_playbook_status when it is actually submitted.",
                }
              : null,
        });
      },
    );

    server.registerTool(
      "merge_pr",
      {
        title: "Merge PR",
        description:
          "Squash-merge an open SEO PR on the project's repo - the dashboard's " +
          "one-tap merge. Only merge PRs listed by get_next_actions, and only " +
          "when the user asked for it or its checks are green. Requires the " +
          "server's GH_MERGE_TOKEN; without it this fails and the PR page link " +
          "is the fallback.",
        inputSchema: {
          number: z.number().int().positive().describe("The pull request number to merge."),
        },
      },
      async ({ number }) => {
        const p = currentProject();
        const result = await mergePr(p, number);
        if (!result.ok) return fail(result.message);
        return ok(result);
      },
    );

    // ---- product changelog -------------------------------------------------
    // Parity with the dashboard's /changelog page: same list, same source
    // (src/lib/changelog.ts), so an agent can answer "what changed in
    // DispatchSEO lately?" without the owner opening the dashboard.
    server.registerTool(
      "get_changelog",
      {
        title: "Get changelog",
        description:
          "What shipped in DispatchSEO itself, newest first - the same release " +
          "log the dashboard shows at /changelog. This is about the PRODUCT, not " +
          "this project's site: for the site's own activity use get_activity. " +
          "Pass limit to trim the list.",
        inputSchema: {
          limit: z.number().int().min(1).max(50).optional().describe("How many of the most recent releases to return, up to 50."),
        },
      },
      async ({ limit }) => {
        const entries = CHANGELOG.slice(0, limit ?? 10);
        return ok({
          latest_version: LATEST?.version ?? null,
          dashboard_url: "/changelog",
          entries,
        });
      },
    );

    // ---- feedback board ----------------------------------------------------
    // Parity with the dashboard's /feedback screen. The board is shared across
    // every tenant on the deployment, so unlike every other tool here these do
    // not scope by project - the calling project only supplies WHO is asking
    // (its owner account), which is what one-vote-per-person is counted by.
    server.registerTool(
      "get_feedback",
      {
        title: "Get feedback board",
        description:
          "Feature requests people have asked for in DispatchSEO itself, most-voted " +
          "first - the same board the dashboard shows at /feedback. This is about " +
          "the PRODUCT, not this project's site. Statuses: open, planned, " +
          "in_progress, shipped, declined.",
        inputSchema: {
          limit: z.number().int().min(1).max(200).optional().describe("How many requests to return, most-voted first."),
          status: z
            .enum(["open", "planned", "in_progress", "shipped", "declined"])
            .optional()
            .describe("Only requests in this status."),
        },
      },
      async ({ limit, status }) => {
        const project = currentProject();
        try {
          const isAdmin = await isFeedbackAdminUser(project.owner_user_id);
          const all = await listFeedback({
            userId: project.owner_user_id,
            includeHidden: isAdmin,
          });
          const filtered = status ? all.filter((i) => i.status === status) : all;
          return ok({
            dashboard_url: "/feedback",
            moderator: isAdmin,
            total: filtered.length,
            requests: filtered.slice(0, limit ?? 50),
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "submit_feedback",
      {
        title: "Submit feedback",
        description:
          "Ask for something in DispatchSEO itself - a feature, a change, a thing " +
          "that's missing. Posts to the shared board at /feedback under the account " +
          "that owns this project. PLAIN TEXT ONLY: links, email addresses and HTML " +
          "are rejected, and there is a daily limit per account. Check get_feedback " +
          "first - voting for an existing request beats posting a duplicate.",
        inputSchema: {
          title: z.string().describe("The request in one line, up to 120 characters."),
          body: z.string().optional().describe("Optional detail: what you're trying to do and what gets in the way."),
        },
      },
      async ({ title, body }) => {
        const project = currentProject();
        try {
          const res = await submitFeedback({
            title,
            body: body ?? "",
            userId: project.owner_user_id,
            projectId: project.id,
          });
          return ok({
            id: res.id,
            title: res.title,
            emailed: res.emailed,
            dashboard_url: "/feedback",
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "vote_feedback",
      {
        title: "Vote on feedback",
        description:
          "Add or remove this account's vote on a request from the feedback board. " +
          "One vote per account per request, and setting a vote it already has is a " +
          "no-op - safe to retry. Cloud deployments only (a vote needs an account).",
        inputSchema: {
          id: z.string().describe("The request's id, from get_feedback."),
          vote: z.boolean().optional().describe("true to vote (default), false to take the vote back."),
        },
      },
      async ({ id, vote }) => {
        const project = currentProject();
        if (!project.owner_user_id) {
          return fail(
            "Voting needs an account, and this deployment has none (self-hosted). " +
              "Use submit_feedback to send a request instead.",
          );
        }
        try {
          const res = await setVote(id, project.owner_user_id, vote ?? true);
          return ok({ id, ...res });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.registerTool(
      "update_feedback",
      {
        title: "Update feedback",
        description:
          "Moderator only - set a request's status or hide it from the board. Fails " +
          "for everyone else. Hiding never deletes: the request stays in the " +
          "database and only drops off the board.",
        inputSchema: {
          id: z.string().describe("The request's id, from get_feedback."),
          status: z
            .enum(["open", "planned", "in_progress", "shipped", "declined"])
            .optional()
            .describe("New status."),
          hidden: z.boolean().optional().describe("true hides it from the board, false puts it back."),
        },
      },
      async ({ id, status, hidden }) => {
        const project = currentProject();
        if (!(await isFeedbackAdminUser(project.owner_user_id))) {
          return fail("Only the feedback board's moderator can change a request.");
        }
        if (status === undefined && hidden === undefined) {
          return fail("Pass status, hidden, or both.");
        }
        try {
          if (status !== undefined) await setFeedbackStatus(id, status);
          if (hidden !== undefined) await setFeedbackHidden(id, hidden);
          return ok({ id, status: status ?? null, hidden: hidden ?? null, updated: true });
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ---- backlink playbook -------------------------------------------------
    server.registerTool(
      "get_playbook",
      {
        title: "Get playbook",
        description:
          "The curated backlink playbook (researched " +
          PLAYBOOK_RESEARCHED +
          "): free directories and ROI-ranked paid placements with this project's " +
          "done/skipped progress. Without a slug returns the compact list; pass a " +
          "slug for the full submission brief - prefilled field copy personalized " +
          "from the site profile, plain-English steps, gotchas, and a paste-ready " +
          "@browser command. Mark progress with set_playbook_status.",
        inputSchema: {
          slug: z.string().optional().describe("Fetch one playbook step by slug. Omit for the whole playbook."),
        },
      },
      async ({ slug }) => {
        const p = currentProject();
        // Tolerate a missing playbook_status table (migration pending) - the
        // playbook itself is static and still worth returning.
        const { data: statusRows } = await db()
          .from("playbook_status")
          .select("slug, status")
          .eq("project_id", p.id);
        const statusOf = new Map(
          (statusRows ?? []).map((r) => [r.slug as string, r.status as string]),
        );
        const all = [...FREE_BACKLINKS, ...PAID_BACKLINKS];
        if (slug) {
          const item = all.find((i) => i.slug === slug);
          if (!item) {
            return fail(`Unknown playbook item '${slug}' - call get_playbook without a slug for the list.`);
          }
          const { profile, fromDb } = await loadSiteProfile(p);
          return ok({
            slug: item.slug,
            name: item.name,
            kind: item.kind,
            price: item.price,
            url: item.url,
            submit_url: item.submitUrl,
            link_type: item.linkType,
            worth: item.worth,
            effort_mins: item.effortMins,
            requires_account: item.requiresAccount,
            status: statusOf.get(item.slug) ?? "todo",
            fields: item.fields.map((f) => ({
              label: f.label,
              value: resolveField(profile, f),
            })),
            steps: item.steps,
            notes: item.notes,
            browser_command: browserCommand(profile, item),
            profile_from_db: fromDb,
          });
        }
        const compact = (i: (typeof all)[number]) => ({
          slug: i.slug,
          name: i.name,
          price: i.price,
          link_type: i.linkType,
          worth: i.worth,
          effort_mins: i.effortMins,
          requires_account: i.requiresAccount,
          status: statusOf.get(i.slug) ?? "todo",
        });
        return ok({
          researched: PLAYBOOK_RESEARCHED,
          free: FREE_BACKLINKS.map(compact),
          paid: PAID_BACKLINKS.map(compact),
        });
      },
    );

    server.registerTool(
      "set_playbook_status",
      {
        title: "Set playbook status",
        description:
          "Mark a backlink playbook item todo/done/skipped - the same checkbox as " +
          "the dashboard's Backlinks screen. Call it after a submission actually " +
          "went through (e.g. the @browser session finished), not before.",
        inputSchema: {
          slug: z.string().min(1).describe("The playbook step's slug, as returned by get_playbook."),
          status: z
            .enum(["todo", "done", "skipped"])
            .describe("Where this step stands: 'skipped' means deliberately not doing it, not failed."),
        },
      },
      async ({ slug, status }) => {
        const p = currentProject();
        const known = [...FREE_BACKLINKS, ...PAID_BACKLINKS].some((i) => i.slug === slug);
        if (!known) {
          return fail(`Unknown playbook item '${slug}' - call get_playbook for the list.`);
        }
        const { error } = await db()
          .from("playbook_status")
          .upsert({
            project_id: p.id,
            slug,
            status,
            done_at: status === "done" ? new Date().toISOString() : null,
          });
        if (error) return fail(error.message);
        return ok({ slug, status });
      },
    );

    // ---- project info --------------------------------------------------------
    server.registerTool(
      "get_project",
      {
        title: "Get project",
        description:
          "The project this token belongs to and how it's set up: domain, mode " +
          "(semi/auto) with the effective auto_approve / auto_approve_tools flags, " +
          `which coding agent runs the builders (agent: ${BUILDER_AGENT_IDS.join("|")} - read it ` +
          "before calling set_agent), " +
          "keyword source (dataforseo/serpapi/gsc), whether a SERP " +
          "provider and Search Console are connected, whether THIS repo has its own " +
          "DataForSEO MCP server (dataforseo_repo_mcp - false on the cloud bundled " +
          "plan, see dataforseo_billed_to), the content-pipeline repo, and whether " +
          "one-tap merge is available. Call it first in a session to know which " +
          "capabilities apply. Secrets are never returned; credentials are managed " +
          "on the dashboard's Settings screen only.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const dfsCreds = await credsForProject(p);
        return ok({
          name: p.name,
          slug: p.slug,
          domain: p.domain,
          mode: p.mode,
          // Which coding agent this project's unattended builders run. Read
          // through the registry, never off the row: the column is absent on a
          // database that has not run migration 0044, and absent means Claude
          // (the column exists only because a second agent does).
          agent: projectAgent(p).id,
          // Effective approval flags (mode-derived, same source the approval
          // gate coerces on). auto_approve=true means research guides land
          // straight in the build queue - the research run must FILL to the
          // weekly target on these, not leave a pending backlog.
          auto_approve: effectiveAutomations(p).auto_approve,
          auto_approve_tools: effectiveAutomations(p).auto_approve_tools,
          // May the guide builder EDIT already-published posts so they link
          // back to a new guide (build-guide step 10)? Not an automation flag
          // and never implied by auto mode - false unless the owner said yes.
          // Read this exact field; never infer the permission from anything
          // else in this payload.
          internal_linking: internalLinkingEnabled(p),
          keyword_source: p.keyword_source,
          serp_provider_connected: (await serpProviderForProject(p)) != null,
          dataforseo_connected: dfsCreds != null,
          // Whether THIS repo gets a DataForSEO MCP server of its own (the
          // pipeline pack's mcp-ci.json dataforseo block) - true only for a
          // project with its own connected account, or the default project's
          // env fallback. A cloud project on the platform's bundled plan is
          // dataforseo_connected but NOT dataforseo_repo_mcp: those
          // credentials are server-side only and never ship into a repo.
          dataforseo_repo_mcp: hasDataforseo(p),
          dataforseo_billed_to: dfsCreds?.billedTo ?? null,
          gsc_property: p.gsc_site_url,
          github_repo: p.github_repo,
          // Cloud: whether the DispatchSEO GitHub App is installed for this
          // project - tells "repo connected but App revoked" apart from
          // "never connected".
          github_app_installed: p.github_installation_id != null,
          // Where finished articles go (github | wordpress | manual) and
          // whether the WordPress half of that is actually connected - the
          // same facts the Drafts screen's "waiting on setup" state derives
          // from. wordpress_connected is presence only; the credential itself
          // never leaves wordpress-connect.ts.
          publish_target: publishTarget(p),
          wordpress_connected: Boolean(p.wp_app_password),
          // The wizard's answers (migration 0060). ai_choice is what the owner
          // SAID will write (claude-web | chatgpt | claude-code | codex |
          // cursor; null = never said - projects from before the adaptive
          // wizard), distinct from `agent` above, which is the coding agent
          // the repo builders run. chat_app_connected is evidence, not a
          // claim: true once any request has reached this door with
          // ?client=chat.
          ai_choice: p.ai_choice ?? null,
          chat_app_connected: Boolean(p.chat_last_seen_at),
          // The onboarding "does the site have a blog?" answer - the setup
          // workflow's content-home hint (the repo wins on conflict).
          content_mode: p.content_mode,
          content_path_hint: p.content_path_hint,
          merge_enabled: await canMerge(p),
          location_code: p.location_code,
          language_code: p.language_code,
          // The trend-scan workflow's skip check: a scheduled run exits early
          // when a scan already happened within the last 48 hours.
          last_trend_scan_at: p.last_trend_scan_at,
          created_at: p.created_at,
        });
      },
    );

    server.registerTool(
      "record_trend_scan",
      {
        title: "Record trend scan",
        description:
          "Stamp the project's last_trend_scan_at with now. The trend-scan " +
          "workflow calls this at the end of every run (found something or " +
          "not) - the stamp shows on the Trend radar and backs the Scan now " +
          "button's cooldown.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const now = new Date().toISOString();
        const { error } = await db()
          .from("projects")
          .update({ last_trend_scan_at: now })
          .eq("id", p.id);
        if (error) return fail(error.message);
        return ok({ recorded_at: now });
      },
    );

    // ---- trend topics (stage 1 of the two-stage radar) ---------------------
    // The scan queues SUBJECTS here; the owner picks one on the Trends page
    // (Get takes), which dispatches the trend-expand workflow; its takes land
    // in the suggestions queue linked back via trend_topic_id.
    server.registerTool(
      "propose_trend_topic",
      {
        title: "Propose trend topic",
        description:
          "Put a trending SUBJECT on the owner's Trend radar - a conversation the " +
          "niche is having right now ('codex vs claude code'), NOT a guide idea. " +
          "The trend-scan workflow calls this once per shortlisted subject (max 5 " +
          "per scan). why_now leads with the trigger event and its date; signals " +
          "are the threads/launches/trend lines actually seen; sources are the " +
          "vendor posts or threads that prove it. seed_url is the single most " +
          "viral PIECE of content driving the subject (the YouTube video, HN " +
          "thread, or Reddit post itself) with seed_stats carrying its public " +
          "numbers and date ('512k views, Jul 12') - the builder later writes " +
          "FROM that source (credit, quotes, embed), so only pass a seed that " +
          "genuinely anchors the conversation. If the subject is already on " +
          "the radar (any status) the existing row is returned with a note - " +
          "move on, don't retry.",
        inputSchema: {
          title: z.string().min(1).describe("The subject in a few words, as it should read on the dashboard's Trend radar."),
          why_now: z
            .string()
            .min(1)
            .describe("Why this is worth writing about THIS week - the timeliness argument, not a general description."),
          signals: z
            .array(z.string())
            .max(8)
            .optional()
            .describe("What proves the topic is moving right now: engagement numbers, velocity, repeated discussion."),
          sources: z
            .array(z.string())
            .max(8)
            .optional()
            .describe("URLs the signals came from, so the owner can judge the evidence."),
          seed_url: z
            .string()
            .url()
            .optional()
            .describe("The one specific post or video this topic grew from. Takes built on it credit and quote it directly."),
          seed_stats: z
            .string()
            .optional()
            .describe("The seed's traction at scan time, e.g. '4.2k upvotes, 380 comments in 2 days'."),
        },
      },
      async ({ title, why_now, signals, sources, seed_url, seed_stats }) => {
        const p = currentProject();
        // Dedupe by title, case-insensitive, across ALL statuses - a
        // dismissed subject stays dismissed, an expanded one keeps its takes.
        // ilike needs its wildcards escaped to act as a plain match.
        const pattern = title.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
        const { data: existing, error: lookupErr } = await db()
          .from("trend_topics")
          .select("*")
          .eq("project_id", p.id)
          .ilike("title", pattern)
          .maybeSingle();
        if (lookupErr) {
          return fail(
            lookupErr.message +
              " (if the trend_topics table is missing, migration 0016_trend_topics.sql has not been applied yet)",
          );
        }
        if (existing) {
          return ok({
            note: "Already on the radar - not re-proposed. Move on to the next subject.",
            topic: existing,
          });
        }
        const { data, error } = await db()
          .from("trend_topics")
          .insert({
            project_id: p.id,
            title,
            evidence: { why_now, signals, sources, seed_url, seed_stats },
          })
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "get_trend_topics",
      {
        title: "Get trend topics",
        description:
          "List the subjects on the Trend radar, newest first, optionally filtered " +
          "by status (new|expanding|expanded|dismissed). The trend-scan workflow " +
          "reads ALL statuses before proposing (never re-propose a known subject); " +
          "the trend-expand workflow reads its dispatched topic's evidence here.",
        inputSchema: {
          status: z
            .enum(["new", "expanding", "expanded", "dismissed"])
            .optional()
            .describe("Filter the radar to one stage. Omit for every topic."),
        },
      },
      async ({ status }) => {
        const p = currentProject();
        let q = db()
          .from("trend_topics")
          .select("*")
          .eq("project_id", p.id)
          .order("created_at", { ascending: false });
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "update_trend_topic",
      {
        title: "Update trend topic",
        description:
          "Move a radar subject to 'expanded' (the trend-expand workflow's last " +
          "step after queuing its takes - flips the radar card from 'working on " +
          "takes' to showing them) or 'dismissed' (the scan's housekeeping for " +
          "subjects older than 14 days - dead hype, or the owner passing on one). " +
          "Picking a subject to expand is the owner's move, so 'expanding' is not " +
          "settable here - when the owner asks for takes on a subject, use " +
          "expand_trend_topic instead.",
        inputSchema: {
          id: z.string().uuid().describe("The trend topic's id, as returned by get_trend_topics."),
          status: z
            .enum(["expanded", "dismissed"])
            .describe("'expanded' once takes have been queued from it; 'dismissed' to drop it off the radar."),
        },
      },
      async ({ id, status }) => {
        const p = currentProject();
        const patch: Record<string, unknown> = { status };
        if (status === "expanded") patch.expanded_at = new Date().toISOString();
        const { data, error } = await db()
          .from("trend_topics")
          .update(patch)
          .eq("id", id)
          .eq("project_id", p.id)
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data);
      },
    );

    server.registerTool(
      "trigger_trend_scan",
      {
        title: "Trigger trend scan",
        description:
          "The Trend radar's 'Scan now' through this door: wakes the project repo's " +
          "trend-scan workflow (stage 1 - trending SUBJECTS only). The scan runs in " +
          "the repo's CI and reports back via propose_trend_topic - subjects appear " +
          "on the radar (get_trend_topics) a few minutes later. Shares the " +
          "dashboard's 30-minute cooldown; a cooldown refusal means the radar is " +
          "already current - don't retry. Only use when the site owner asked for a " +
          "scan in the current conversation - never from autonomous workflow runs " +
          "(the scan workflow itself must NOT call this - it reports via " +
          "record_trend_scan).",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const result = await requestTrendScan(p);
        if (!result.ok) return fail(result.message);
        return ok(result);
      },
    );

    server.registerTool(
      "expand_trend_topic",
      {
        title: "Expand trend topic",
        description:
          "The radar's 'Get takes' through this door: wakes the trend-expand " +
          "workflow for ONE radar subject. The subject flips to 'expanding'; the " +
          "run's takes land in the suggestions queue linked by trend_topic_id a few " +
          "minutes later (they wait pending for the owner, like every trend idea). " +
          "Refuses dismissed subjects and repeats within the cooldown - a refusal " +
          "means takes are already on their way; don't retry. Only use when the " +
          "site owner picked the subject in the current conversation - never from " +
          "autonomous workflow runs.",
        inputSchema: {
          id: z.string().uuid().describe("The trend topic to expand into takes, as returned by get_trend_topics."),
        },
      },
      async ({ id }) => {
        const p = currentProject();
        const result = await requestTrendExpand(p, id);
        if (!result.ok) return fail(result.message);
        return ok(result);
      },
    );

    // ---- instructions (the centrally-served brain) -------------------------
    // Not a research/generation tool: like get_playbook, it serves curated
    // content-as-state. The repo-side workflows are thin shims that fetch
    // their playbook here before acting, so instruction updates reach every
    // project's next run without touching any user repo.
    server.registerTool(
      "get_instructions",
      {
        title: "Get instructions",
        description:
          "The operating instructions for an SEO workflow, personalized to this " +
          "project. Automations and agents MUST call this before running a " +
          "workflow and follow the returned markdown exactly - it is the current " +
          "version of the playbook (pipelines, quality bar, policies). Workflows: " +
          `${WORKFLOWS.join(", ")}. ` +
          "Returns { project, version, workflow, summary, markdown }. The " +
          "project field is WHO this connection's token belongs to - confirm it " +
          "matches the site you mean to operate on before following the " +
          "playbook, and stop if it does not (the token routes every call, so a " +
          "mismatched token would act on another site's data). Report the " +
          "version in run output so results are traceable to the instruction " +
          "set that produced them. Site-specific facts live in the repo's " +
          ".dispatchseo/conventions.md, which the 'setup' workflow writes.",
        inputSchema: {
          workflow: z.enum(WORKFLOWS).describe("Which playbook to fetch. Call this FIRST in every run - it overrides any cached knowledge of the pipeline."),
        },
      },
      async ({ workflow }) => {
        const p = currentProject();
        // The tenant, stated explicitly: a stale or copy-pasted token is the
        // one misconfiguration the playbooks' own preflights can't always
        // catch, so every instruction fetch names the project it will act on.
        return ok({
          project: { name: p.name, slug: p.slug, domain: p.domain },
          ...(await renderInstructions(workflow, p)),
        });
      },
    );

    // ---- pipeline pack (the repo-side shim, served as data) ----------------
    // Content-as-state like get_instructions: the `install` workflow fetches
    // these files and writes them into the owner's site repo, replacing the
    // old "copy the seo-*.yml files from the reference repo by hand" step.
    server.registerTool(
      "get_pipeline_pack",
      {
        title: "Get pipeline pack",
        description:
          "The repo-side shim files (GitHub workflows, MCP configs, slash " +
          "commands) personalized to this project. Call with NO arguments for " +
          "the MANIFEST (list of file paths only) - the full pack overflows one " +
          "response, so content is fetched per file. Then call again with " +
          "path=<a path from the manifest> to get that one file's " +
          "{ path, content }, and write each with your file-write tool one at a " +
          "time (no bulk script). Called by the 'install' workflow, which " +
          "adapts the stack-specific spots to the target repo and commits a PR " +
          "- the files are a reference-stack template, never commit blindly.",
        inputSchema: {
          path: z.string().optional().describe("Return a single file from the pipeline pack by its repo-relative path. Omit for every file."),
        },
      },
      async ({ path }) => {
        const p = currentProject();
        const files = await getPipelinePack(p);
        if (path) {
          const file = files.find((f) => f.path === path);
          if (!file)
            return fail(
              `no pack file at "${path}" - call get_pipeline_pack with no arguments for the manifest of valid paths`,
            );
          return ok({ project: p.slug, file });
        }
        // Manifest only. The full pack (~110k chars) overflows a single MCP
        // response; returning it all forced the agent onto a file dump + a
        // bulk-extraction script that the permission gate then BLOCKED, stalling
        // a real install (2026-07-24). Paths only here - content per file.
        return ok({
          project: p.slug,
          files: files.map((f) => ({ path: f.path })),
          next: "Call get_pipeline_pack again with path=<each path above> to get { path, content }; write each with your file-write tool, one at a time - no bulk script.",
        });
      },
    );

    server.registerTool(
      "mark_install_step",
      {
        title: "Mark an install step done",
        description:
          "Progress ticker for the owner's wizard finale: stamp one install " +
          "step the moment you FINISH it, so the checklist the owner is " +
          "watching ticks in real time instead of sitting dark for 20-60 " +
          "minutes. Steps: workflows (pack files written), adaptation " +
          "(stack adapted + install command proven), repo_settings (Actions " +
          "PR permission + labels), content_home (blog section found or " +
          "scaffolded), site_facts (conventions.md written), research " +
          "(first keyword research kicked off or handed to the builder). " +
          "Call it once per step, right after the step - never in advance. " +
          "Purely informational and always safe: it unlocks nothing " +
          "(mark_pipeline_installed does that) and a failure here must " +
          "never stop the install.",
        inputSchema: {
          step: z
            .enum([
              "workflows",
              "adaptation",
              "repo_settings",
              "content_home",
              "site_facts",
              "research",
            ])
            .describe("Which install step just completed. Stamps it on the dashboard's live setup checklist."),
        },
      },
      async ({ step }) => {
        const p = currentProject();
        // Read-merge-write; a lone install agent writes these, so the race
        // window is theoretical. Tolerant of the 0036 column not existing
        // yet (older self-host DB): report noted:false instead of failing -
        // this tool must never be the reason an install stops.
        const { data } = await db()
          .from("projects")
          .select("install_progress")
          .eq("id", p.id)
          .single();
        const current =
          (data?.install_progress as Record<string, string> | null) ?? {};
        const { error } = await db()
          .from("projects")
          .update({ install_progress: { ...current, [step]: new Date().toISOString() } })
          .eq("id", p.id);
        if (error) {
          return ok({
            noted: false,
            reason: /install_progress|column/i.test(error.message)
              ? "backend predates migration 0036 - progress display unavailable, continue the install"
              : error.message,
          });
        }
        return ok({ noted: true, step });
      },
    );

    server.registerTool(
      "mark_pipeline_installed",
      {
        title: "Mark pipeline installed",
        description:
          "Stamp this project as pipeline-installed. Called ONCE, by the " +
          "install workflow's final step - and ONLY after its verification " +
          "checklist passes (install PR merged, Actions PR permission on, " +
          "labels, secrets, setup run). This call UNLOCKS the owner's " +
          "dashboard, so stamping an unverified install ships a broken " +
          "setup. It flips the dashboard's install card to " +
          "its green done state; never call it before the install actually " +
          "completed.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        // The stamp unlocks the owner's dashboard, so the backend verifies
        // what it can instead of taking the agent's word: workflows merged,
        // labels, Actions PR permission (approve half only when auto-merge
        // is on). Verifiable problem = no stamp, with the fix spelled out.
        //
        // Setup is part of the install (the agent chains into it), so the
        // unlock also requires its proof-of-work: the saved site profile.
        // Tolerant like every pre-migration path - a query error never blocks.
        try {
          const { count, error: profErr } = await db()
            .from("site_profile")
            .select("id", { count: "exact", head: true })
            .eq("project_id", p.id);
          if (!profErr && (count ?? 0) === 0) {
            return fail(
              "Install NOT verified - the setup workflow hasn't run for this project " +
                "(no site profile saved). Run get_instructions with workflow=setup and " +
                "follow it, then call mark_pipeline_installed again.",
            );
          }
        } catch {
          /* pre-migration database - never block the unlock on a missing table */
        }
        let verified = false;
        if (p.github_repo) {
          const verdict = await verifyPipelinePrereqs(
            p.github_repo,
            effectiveAutomations(p).auto_merge,
            p,
          );
          if (verdict.problems.length > 0) {
            return fail(
              "Install NOT verified - the dashboard stays locked. Fix these, then call mark_pipeline_installed again: " +
                verdict.problems.join("; "),
            );
          }
          verified = verdict.checked;
        }
        // backend_verified used to be returned ONLY in this tool call's
        // ephemeral response - the agent saw it once, but the dashboard had
        // no way to know later whether the unlock was ever actually checked
        // (typically: no merge/dispatch token, so nothing GitHub-side could
        // be verified). Persist it so the finale's "Pipeline verified" step
        // can tell that apart from a real backend-checked pass (migration 0040).
        // A DB that hasn't run 0040 yet (migrations are applied manually, so
        // code can reach prod first) must NEVER have the unlock itself fail
        // on a missing column - retry with just the original column.
        const stampedAt = new Date().toISOString();
        let { error } = await db()
          .from("projects")
          .update({ pipeline_installed_at: stampedAt, pipeline_verified: verified })
          .eq("id", p.id);
        if (error && /pipeline_verified|does not exist/i.test(error.message)) {
          ({ error } = await db()
            .from("projects")
            .update({ pipeline_installed_at: stampedAt })
            .eq("id", p.id));
        }
        if (error) return fail(error.message);
        return ok({ marked: true, project: p.slug, backend_verified: verified });
      },
    );

    // ---- conventions (the dashboard's mirror of the repo's site facts) -----
    const themeTokenSchema = z.object({
      name: z.string().min(1).describe("The token's name as used in the codebase, e.g. 'brand-500' or '--surface'."),
      value: z.string().optional().describe("The token's literal value, e.g. '#7c3aed' or '1.25rem'."),
    });
    server.registerTool(
      "set_conventions",
      {
        title: "Set conventions",
        description:
          "Mirror the repo's .dispatchseo/conventions.md site facts to the backend " +
          "so the dashboard's Instructions page can show how DispatchSEO adapted to " +
          "this site. The setup workflow calls this right after writing the repo " +
          "file, with the COMPLETE current facts (full replace, not a patch). " +
          "theme_tokens should include resolved color values (hex/oklch) where the " +
          "token is a color, so the dashboard can render real swatches.",
        inputSchema: {
          product_summary: z
            .string()
            .optional()
            .describe("What the product does, in a few sentences - the grounding every research and build run reads first."),
          stack: z
            .string()
            .optional()
            .describe("Framework, language and notable libraries, e.g. 'Next.js 16 App Router, React 19, Tailwind v4'."),
          package_manager: z
            .string()
            .optional()
            .describe("The package manager this repo uses: npm, pnpm, yarn or bun."),
          build_command: z
            .string()
            .optional()
            .describe("The command that verifies a build, e.g. 'pnpm build'. Builders run it before opening a PR."),
          guides_dir: z
            .string()
            .optional()
            .describe("Repo path where guide content files live, e.g. 'src/content/blog'."),
          tools_wiring: z
            .string()
            .optional()
            .describe("How a new interactive tool gets registered and routed in this repo: registry file, index page, route convention."),
          theme_tokens: z
            .array(themeTokenSchema)
            .optional()
            .describe("The site's design tokens, so generated UI matches the site instead of improvising colours and spacing."),
          fonts: z
            .array(z.string())
            .optional()
            .describe("Font families the site uses, so generated pages match."),
          voice_rules: z
            .array(z.string())
            .optional()
            .describe("Writing rules to follow exactly: punctuation bans, tone, author attribution."),
          exemplar_guides: z
            .array(z.string())
            .optional()
            .describe("Paths to existing guides that represent the quality bar - builders read these before writing."),
          exemplar_visuals: z
            .array(z.string())
            .optional()
            .describe("Paths to existing visual or diagram components worth imitating."),
          tool_reference: z
            .string()
            .optional()
            .describe("Path to the best existing interactive tool - the reference implementation a new tool is modelled on."),
          analytics: z
            .string()
            .optional()
            .describe("How analytics is wired, when new pages have to hook into it."),
          notes: z
            .string()
            .optional()
            .describe("Anything else a builder must know about this repo that the other fields don't cover."),
        },
      },
      async (data) => {
        const p = currentProject();
        const { error } = await saveConventions(p, data);
        if (error) return fail(error);
        return ok({ saved: true, project: p.slug });
      },
    );

    server.registerTool(
      "get_conventions",
      {
        title: "Get conventions",
        description:
          "The site facts last mirrored via set_conventions (stack, build command, " +
          "theme tokens, voice rules, exemplars), with updated_at. Null data means " +
          "the setup workflow hasn't run - the repo's .dispatchseo/conventions.md " +
          "remains the agent-facing source of truth; this copy exists for the " +
          "dashboard and for agents working without the repo checked out.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const row = await loadConventions(p);
        return ok(row ?? { data: null, updated_at: null });
      },
    );

    server.registerTool(
      "get_content_prefs",
      {
        title: "Get content preferences",
        description:
          "The owner's template controls from the dashboard's Instructions page: " +
          "house_rules (free-text standing instructions injected into every build), " +
          "disabled_archetypes (guide shapes removed from rotation), and " +
          "disabled_blocks (guide skeleton parts dropped: cover, tldr, comparison_table, " +
          "visuals, faq). Build workflows don't need to call this - the same " +
          "preferences are already rendered into the get_instructions text.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        return ok(normalizeContentPrefs(p.content_prefs));
      },
    );

    server.registerTool(
      "set_content_prefs",
      {
        title: "Set content preferences",
        description:
          "Owner-gated: change the owner's template controls (house rules, guide " +
          "shape rotation, skeleton blocks) - the dashboard's Instructions page " +
          "through the MCP door. Use ONLY when the owner asked for the change in " +
          "this conversation; an autonomous build run must never adjust its own " +
          "content preferences. Provided fields replace their current value " +
          "wholesale (omitted fields keep theirs). At least 2 archetypes must " +
          "stay in rotation.",
        inputSchema: {
          house_rules: z
            .string()
            .max(HOUSE_RULES_MAX)
            .optional()
            .describe("Free-text standing instructions injected into every build. Replaces the current value wholesale."),
          disabled_archetypes: z
            .array(z.enum(GUIDE_ARCHETYPES))
            .optional()
            .describe("Guide shapes to remove from rotation. At least 2 archetypes must stay in rotation."),
          disabled_blocks: z
            .array(z.enum(GUIDE_BLOCKS))
            .optional()
            .describe(
              "Guide skeleton parts to drop from every build: cover, tldr, comparison_table, " +
                "visuals, faq. All are on by default; `cover` drops the agent-drawn cover image.",
            ),
        },
      },
      async (patch) => {
        const p = currentProject();
        const current = normalizeContentPrefs(p.content_prefs);
        const next = {
          house_rules: patch.house_rules ?? current.house_rules,
          disabled_archetypes: patch.disabled_archetypes ?? current.disabled_archetypes,
          disabled_blocks: patch.disabled_blocks ?? current.disabled_blocks,
        };
        const { prefs, error } = await saveContentPrefs(p, next);
        if (error) return fail(error);
        return ok({ saved: true, project: p.slug, content_prefs: prefs });
      },
    );

    server.registerTool(
      "join_waitlist",
      {
        title: "Join the cloud waitlist",
        description:
          "Add an email to the DispatchSEO Cloud waitlist (the same list the " +
          "public landing page feeds). Waitlist members get launch invites. " +
          "Duplicate emails are fine - re-joining is a " +
          "no-op, not an error.",
        inputSchema: {
          email: z.string().describe("Email address to add to the waitlist"),
        },
      },
      async ({ email }) => {
        const result = await joinWaitlist(email, "mcp");
        if (!result.ok) return fail(result.error);
        return ok({ joined: true });
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

// Bearer gate in front of the MCP handler. The token doubles as the tenant:
// each project row carries its own mcp_token, and the legacy MCP_API_KEY env
// var keeps resolving to ClockedCode so existing CI secrets never break.
// The resolved project rides an AsyncLocalStorage the tools read.
async function authed(req: Request): Promise<Response> {
  const header = req.headers.get("authorization") ?? "";
  // The key also rides as ?key=<token> in the URL. Claude Code on Windows
  // has a long-lived bug where a configured Authorization header is stored,
  // `claude mcp list` says Connected, and the actual tool calls send NO
  // header at all (anthropics/claude-code#50464) - a URL survives every
  // shell-quoting and header-handling bug there is, so the Windows connect
  // command uses this form. Header wins when both are present.
  //
  // Deliberate secrets-in-URL tradeoff (2026-07-28 security review): the
  // client cannot do an exchange flow (the CLI stores a static URL), and
  // URL-embedded keys are the standard MCP connect pattern for exactly that
  // reason. Exposure delta: self-host logs belong to the same owner the
  // token protects; on cloud only the platform's own request logs see it.
  // Rules that keep this safe: this route must never log req.url, and the
  // eventual revocation story is a rotate-key action (LATER.md).
  const headerToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const token = headerToken || (new URL(req.url).searchParams.get("key") ?? "");
  const project = token ? await getProjectByToken(token) : null;
  if (!project) {
    // Spell out WHICH way auth failed: an MCP client renders both cases as a
    // bare "Failed to connect", so the body is the only debuggable signal
    // (curl the URL, or read the client's connection log). Missing header and
    // unknown token have different fixes. A missing header in particular is
    // the first thing a brand-new visitor sees (e.g. someone who found this
    // via an MCP/plugin directory and connected with no project at all), so
    // that message carries real URLs, not just "the dashboard".
    const error = token
      ? "Unknown project key. The Bearer token IS the project - this one matches no project on this deploy (deleted project, wrong backend, or a stale copy). Copy the current connect command from the dashboard: Settings -> Project key."
      : "No DispatchSEO project connected yet. New here? Sign up free at https://dispatchseo.com, or self-host in one command: https://github.com/NeoZi12/dispatchseo. Already have a project? Copy the exact connect command for your agent from your dashboard: Settings -> Project key.";
    return Response.json(
      { error },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="dispatchseo"' } },
    );
  }
  // ?client=chat marks a chat app (claude.ai, ChatGPT) rather than a coding
  // agent. It changes what the tool list contains and how big the answers
  // are, never what the caller is allowed to do - authorisation is the token's
  // job alone, and a caller can always drop this parameter, so nothing
  // security-relevant may ever hang off it.
  const client = new URL(req.url).searchParams.get("client") === "chat" ? "chat" : "agent";
  if (client === "chat") noteChatSeen(project);
  return projectStore.run(project, () => clientKindStore.run(client, () => mcpHandler(req)));
}

/** The "Connected" light for the Claude/ChatGPT app (migration 0060). Every
 *  request that arrives with ?client=chat is evidence the owner's chat app
 *  actually reached us - which is worth more than any button they could
 *  press to tell us so. Throttled to one write per ten minutes per project
 *  and never awaited: a stamp that fails or lags costs a green light on a
 *  setup screen, and must never cost the tool call it rode in on. The
 *  comparison reads the row the token already resolved, so a quiet project
 *  costs one update per chat session, not one per tool call. */
function noteChatSeen(project: Project): void {
  const last = project.chat_last_seen_at ? Date.parse(project.chat_last_seen_at) : 0;
  if (Date.now() - last < 10 * 60_000) return;
  void db()
    .from("projects")
    .update({ chat_last_seen_at: new Date().toISOString() })
    .eq("id", project.id)
    .then(
      () => undefined,
      () => undefined,
    );
}

export { authed as GET, authed as POST, authed as DELETE };

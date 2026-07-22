import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { db } from "@/lib/db";
import { remainingKeywords } from "@/lib/billing";
import { joinWaitlist } from "@/lib/waitlist";
import { getActivityReport } from "@/lib/activity";
import { getCronHealth, markCronFixed } from "@/lib/cron-alerts";
import { instanceSettings } from "@/lib/dashboard-auth";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { getJourney } from "@/lib/journey";
import { getWeeklyProgress } from "@/lib/progress";
import { AUTOMATIONS, gatherEvidence } from "@/lib/automations";
import { credsForProject } from "@/lib/dataforseo";
import { canMerge, dispatchToolBuild, mergePr, openSeoPrs, verifyPipelinePrereqs } from "@/lib/github";
import {
  indexingBrowserCommand,
  indexingQueue,
  type IndexingPageRow,
} from "@/lib/indexing";
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
import { getPipelinePack } from "@/lib/pipeline-pack";
import { effectiveAutomations, getProjectByToken } from "@/lib/projects";
import { loadSiteProfile } from "@/lib/site-profile";
import { currentProject, projectStore } from "@/lib/mcp-context";
import { isProjectUrl } from "@/lib/url-guard";
import { AGENT_ENGINES, getAiVisibility, recordAiSnapshots } from "@/lib/ai-visibility";
import { sortQueue } from "@/lib/metrics";
import { placeAtFront, writeQueueOrder } from "@/lib/queue";
import {
  compareToCorpus,
  CORPUS_SIZE,
  extractFromHtml,
  extractFromMarkdown,
  tokenize,
} from "@/lib/similarity";
import { requestTrendExpand, requestTrendScan } from "@/lib/trends";
import { serpProviderForProject, providerOrganic } from "@/lib/serp";
import { gscAccessProbe } from "@/lib/gsc";
import { setTrackedProperty } from "@/lib/gsc-oauth";
import { expandKeyword } from "@/lib/suggest";

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
// set_content_prefs, mark_cron_fixed). Owner-gated
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
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}

const mcpHandler = createMcpHandler(
  (server) => {
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
            .optional(),
          type: z.enum(["guide", "tool", "backlink", "update"]).optional(),
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
        return ok(
          sortQueue((data ?? []) as { created_at: string; queue_position?: number | null }[]),
        );
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
          type: z.enum(["guide", "tool", "backlink", "update"]),
          title: z.string(),
          primary_keyword: z.string().optional(),
          volume: z.number().int().optional(),
          kd: z.number().optional(),
          rationale: z.string().optional(),
          spec: z.record(z.string(), z.any()).optional(),
          source: z.enum(["research", "trend-scan", "manual"]).optional(),
          trend_topic_id: z.string().uuid().optional(),
          approved: z.boolean().optional(),
          position: z.enum(["front", "back"]).optional(),
          build: z.enum(["now", "queue"]).optional(),
        },
      },
      async ({ type, title, primary_keyword, volume, kd, rationale, spec, source, trend_topic_id, approved, position, build }) => {
        const p = currentProject();
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
        let error: { message: string } | null = null;
        for (const attempt of attempts) {
          ({ data, error } = await db().from("suggestions").insert(attempt).select().single());
          if (!error) break;
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
            const dispatch = await dispatchToolBuild(p.github_repo, data.id);
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
          id: z.string().uuid(),
          status: z
            .enum(["pending", "approved", "rejected", "in_progress", "done"])
            .optional(),
          result_pr_url: z.string().optional(),
          decided_by: z.enum(["owner", "agent"]).optional(),
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
            const dispatch = await dispatchToolBuild(p.github_repo, id);
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
          group: z.enum(["guide", "tool"]),
          ordered_ids: z.array(z.string().uuid()).min(1),
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
          id: z.string().uuid(),
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
          const dispatch = await dispatchToolBuild(p.github_repo, id);
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
          markdown: z.string(),
          primary_keyword: z.string().optional(),
        },
      },
      async ({ markdown, primary_keyword }) => {
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
              // not on this project's own domain (pre-guard rows, SSRF).
              if (!isProjectUrl(r.url, p.domain)) return null;
              try {
                const res = await fetch(r.url, {
                  signal: AbortSignal.timeout(8000),
                  headers: { "user-agent": "DispatchSEO-sameness-gate" },
                });
                if (!res.ok) return null;
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
        return ok(compareToCorpus(draft, corpus));
      },
    );

    // ---- keyword tracking --------------------------------------------------
    server.registerTool(
      "track_keywords",
      {
        title: "Track keywords",
        description:
          "Upsert keywords into the tracking set (matched by keyword text). The daily rank " +
          "cron checks every tracked keyword. Pass the metrics you have from research; " +
          "omitted fields are left as-is on existing rows.",
        inputSchema: {
          keywords: z
            .array(
              z.object({
                keyword: z.string(),
                volume: z.number().int().optional(),
                kd: z.number().optional(),
                cpc: z.number().optional(),
                intent: z.string().optional(),
              }),
            )
            .min(1),
        },
      },
      async ({ keywords }) => {
        const p = currentProject();
        // Cloud plan cap (no-op on self-host). Only NET-NEW keywords count -
        // updating an already-tracked keyword's metrics is always allowed, so
        // a maxed-out plan can still be maintained, just not grown.
        const remaining = await remainingKeywords(p.id);
        if (remaining !== null) {
          const incoming = [...new Set(keywords.map((k) => k.keyword))];
          const { data: existing } = await db()
            .from("keywords")
            .select("keyword")
            .eq("project_id", p.id)
            .in("keyword", incoming);
          const known = new Set((existing ?? []).map((r) => r.keyword as string));
          const newCount = incoming.filter((k) => !known.has(k)).length;
          if (newCount > remaining) {
            return fail(
              `Keyword limit reached: this plan allows ${remaining} more tracked keyword(s), ` +
                `but ${newCount} new one(s) were provided. Upgrade the plan or stop tracking ` +
                `some keywords. Updating already-tracked keywords is always allowed.`,
            );
          }
        }
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
          "run) - unknown, NOT 'not ranking'. Pass a keyword to scope to one.",
        inputSchema: {
          keyword: z.string().optional(),
          days: z.number().int().positive().optional(),
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
        return ok(results);
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
          "and to avoid duplicate coverage. type is guide|tool|landing. published_at (ISO " +
          "date/datetime) is when the page ACTUALLY went live - pass it when backfilling a " +
          "page published earlier, omit it for a page shipping right now. It matters: the " +
          "daily publishing pace reads this field, so a backfill stamped 'now' wrongly uses " +
          "today's build slot.",
        inputSchema: {
          url: z.string(),
          title: z.string().optional(),
          type: z.enum(["guide", "tool", "landing"]).optional(),
          primary_keyword: z.string().optional(),
          pr_url: z.string().optional(),
          published_at: z.string().optional(),
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
          "new content to pick 2-3 existing pages to link to and to avoid covering a topic twice.",
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
        return ok(data);
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
          requested_urls: z.array(z.string()).optional(),
          already_indexed_urls: z.array(z.string()).optional(),
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
        const stamp = async (urls: string[], patch: Record<string, unknown>) => {
          if (urls.length === 0) return [] as string[];
          let res = await db()
            .from("pages")
            .update(patch)
            .eq("project_id", p.id)
            .in("url", urls)
            .select("url");
          // indexed_at only exists once migration 0010 runs - fall back to
          // the 0005 stamp alone so the card still clears on older schemas.
          if (res.error && "indexed_at" in patch) {
            res = await db()
              .from("pages")
              .update({ index_requested_at: now })
              .eq("project_id", p.id)
              .in("url", urls)
              .select("url");
          }
          if (res.error) throw new Error(res.error.message);
          return (res.data ?? []).map((r) => r.url as string);
        };
        try {
          const requestedMarked = await stamp(requested, { index_requested_at: now });
          const indexedMarked = await stamp(alreadyIndexed, {
            index_requested_at: now,
            indexed_at: now,
          });
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
          days: z.number().int().positive().optional(),
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
          domain: z.string(),
          url: z.string().optional(),
          reason: z.string().optional(),
          domain_rating: z.number().optional(),
        },
      },
      async ({ domain, url, reason, domain_rating }) => {
        const p = currentProject();
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
          status: z.enum(["new", "contacted", "acquired", "rejected"]).optional(),
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
          id: z.string().uuid(),
          status: z.enum(["new", "contacted", "acquired", "rejected"]),
        },
      },
      async ({ id, status }) => {
        const p = currentProject();
        const { data, error } = await db()
          .from("backlink_prospects")
          .update({ status })
          .eq("id", id)
          .eq("project_id", p.id)
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data);
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
          keyword: z.string().min(1),
          top: z.number().int().positive().max(100).optional(),
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
        try {
          const { results, ai } = await providerOrganic(
            provider,
            keyword,
            p.location_code,
            p.language_code,
          );
          return ok({
            keyword,
            source: provider.kind,
            results: results.slice(0, top ?? 10),
            // Google's AI Overview citations when this call carried them
            // (SerpApi mode). null = not measured here - DataForSEO mode
            // records AI Overviews via the daily cron; read get_ai_visibility.
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

    // ---- AI visibility (GEO) --------------------------------------------
    server.registerTool(
      "get_ai_visibility",
      {
        title: "Get AI visibility",
        description:
          "How AI answer engines see this site: per-engine summary (queries checked, AI " +
          "answers seen, citation rate), a per-day trend, the latest verbatim answers, and " +
          "the gap list - domains AI cites on queries where this site is NOT cited. Google " +
          "AI Overview data comes from the daily rank cron automatically; other engines fill " +
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
                engine: z.enum(AGENT_ENGINES),
                query: z.string().min(1).max(300),
                has_ai_answer: z.boolean(),
                cited: z.boolean(),
                cited_url: z.string().max(600).optional(),
                answer_excerpt: z.string().max(1500).optional(),
                citations: z
                  .array(
                    z.object({
                      domain: z.string().min(1).max(253),
                      url: z.string().max(600).optional(),
                      title: z.string().max(300).optional(),
                    }),
                  )
                  .max(30)
                  .optional(),
              }),
            )
            .min(1)
            .max(100),
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
          seed: z.string().min(1),
          modifiers: z.array(z.string()).max(8).optional(),
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

    // ---- site profile (backlink playbook personalization) -----------------
    server.registerTool(
      "get_site_profile",
      {
        title: "Get site profile",
        description:
          "Read the site profile the backlink playbook personalizes from (name, " +
          "tagline, descriptions, categories, tags). Returns null if /seo-setup " +
          "has not written it yet.",
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
          "submission and @browser command from. Called by the /seo-setup command " +
          "after researching the product. Length contracts: tagline <= 60 chars, " +
          "short_description <= 160 chars, long_description 300-600 chars - " +
          "directories enforce these limits, so keep to them.",
        inputSchema: {
          name: z.string().min(1),
          url: z.string().url(),
          tagline: z.string().min(1).max(60),
          short_description: z.string().min(1).max(160),
          long_description: z.string().min(100).max(700),
          categories: z.array(z.string()).min(1).max(5),
          tags: z.array(z.string()).min(1).max(10),
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
        inputSchema: { site_url: z.string().min(1) },
      },
      async ({ site_url }) => {
        const p = currentProject();
        const err = await setTrackedProperty(p.id, site_url);
        if (err) return fail(err);
        return ok({ project: p.slug, gsc_site_url: site_url });
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
          return ok({
            domain: o.domain,
            journey,
            this_week: week,
            domain_rating: o.dr,
            totals_28d: o.totals,
            last_24h: o.fresh24,
            tracked_keywords: o.rankings.length,
            keywords_in_top100: o.rankingCount,
            rankings: o.rankings.map((r) => ({
              keyword: r.keyword.keyword,
              position: r.current,
              change_30d: r.change,
              volume: r.volume,
            })),
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
      "get_cron_health",
      {
        title: "Get cron health",
        description:
          "The latest run of every background job: the backend crons " +
          "(daily-ranks, hourly-gsc, weekly-opportunities), deploy-check (the " +
          "post-deploy smoke test after every push), the SEO GitHub workflows " +
          "(seo-daily, seo-auto-merge, seo-tools, trend scans, weekly research - " +
          "they phone their outcomes home), and the secrets canary that " +
          "validates tokens/keys every 6h. Each entry: ok/failed, error strings, " +
          "and whether the job is stale (hasn't run inside its expected window). " +
          "This is the dashboard's red 'background jobs need attention' banner " +
          "as data - check it when rankings or GSC stats look frozen, when a " +
          "build seems missing, or to confirm the latest deploy passed its " +
          "smoke test. Empty means no job has ever logged a run (fresh install).",
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
            } | null;
            return ok({
              builder_last_seen_at: inst?.builder_last_seen_at ?? null,
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
        inputSchema: { job: z.string().min(1) },
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
          "@browser command; report the outcome via mark_indexing_requested).",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        const client = db();
        const [sugRes, pagesRes, prs] = await Promise.all([
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
          openSeoPrs(p.github_repo),
        ]);
        if (sugRes.error) return fail(sugRes.error.message);
        const sugs = sugRes.data ?? [];
        const queue = indexingQueue((pagesRes.data ?? []) as IndexingPageRow[]);
        return ok({
          awaiting_approval: sugs.filter((s) => s.status === "pending"),
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
          number: z.number().int().positive(),
        },
      },
      async ({ number }) => {
        const p = currentProject();
        const result = await mergePr(p.github_repo, number);
        if (!result.ok) return fail(result.message);
        return ok(result);
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
          slug: z.string().optional(),
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
          slug: z.string().min(1),
          status: z.enum(["todo", "done", "skipped"]),
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
          "(semi/auto), keyword source (dataforseo/serpapi/gsc), whether a SERP " +
          "provider and Search Console are connected, the content-pipeline repo, " +
          "and whether one-tap merge is available. Call it first in a session to " +
          "know which capabilities apply. Secrets are never returned; credentials " +
          "are managed on the dashboard's Settings screen only.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        return ok({
          name: p.name,
          slug: p.slug,
          domain: p.domain,
          mode: p.mode,
          keyword_source: p.keyword_source,
          serp_provider_connected: (await serpProviderForProject(p)) != null,
          dataforseo_connected: (await credsForProject(p)) != null,
          gsc_property: p.gsc_site_url,
          github_repo: p.github_repo,
          // The onboarding "does the site have a blog?" answer - the setup
          // workflow's content-home hint (the repo wins on conflict).
          content_mode: p.content_mode,
          content_path_hint: p.content_path_hint,
          merge_enabled: await canMerge(),
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
          title: z.string().min(1),
          why_now: z.string().min(1),
          signals: z.array(z.string()).max(8).optional(),
          sources: z.array(z.string()).max(8).optional(),
          seed_url: z.string().url().optional(),
          seed_stats: z.string().optional(),
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
          status: z.enum(["new", "expanding", "expanded", "dismissed"]).optional(),
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
          id: z.string().uuid(),
          status: z.enum(["expanded", "dismissed"]),
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
          id: z.string().uuid(),
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
          workflow: z.enum(WORKFLOWS),
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
          "commands) personalized to this project, as { path, content } " +
          "entries. Called by the 'install' workflow, which fetches this " +
          "pack, adapts the stack-specific spots to the target repo, and " +
          "commits it as a PR. The files are a template tuned to the " +
          "reference stack - always run install's adapt step, never commit " +
          "blindly.",
        inputSchema: {},
      },
      async () => {
        const p = currentProject();
        return ok({ project: p.slug, files: await getPipelinePack(p) });
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
          );
          if (verdict.problems.length > 0) {
            return fail(
              "Install NOT verified - the dashboard stays locked. Fix these, then call mark_pipeline_installed again: " +
                verdict.problems.join("; "),
            );
          }
          verified = verdict.checked;
        }
        const { error } = await db()
          .from("projects")
          .update({ pipeline_installed_at: new Date().toISOString() })
          .eq("id", p.id);
        if (error) return fail(error.message);
        return ok({ marked: true, project: p.slug, backend_verified: verified });
      },
    );

    // ---- conventions (the dashboard's mirror of the repo's site facts) -----
    const themeTokenSchema = z.object({
      name: z.string().min(1),
      value: z.string().optional(),
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
          product_summary: z.string().optional(),
          stack: z.string().optional(),
          package_manager: z.string().optional(),
          build_command: z.string().optional(),
          guides_dir: z.string().optional(),
          tools_wiring: z.string().optional(),
          theme_tokens: z.array(themeTokenSchema).optional(),
          fonts: z.array(z.string()).optional(),
          voice_rules: z.array(z.string()).optional(),
          exemplar_guides: z.array(z.string()).optional(),
          exemplar_visuals: z.array(z.string()).optional(),
          tool_reference: z.string().optional(),
          analytics: z.string().optional(),
          notes: z.string().optional(),
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
          "disabled_blocks (guide skeleton parts dropped: tldr, comparison_table, " +
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
          house_rules: z.string().max(HOUSE_RULES_MAX).optional(),
          disabled_archetypes: z.array(z.enum(GUIDE_ARCHETYPES)).optional(),
          disabled_blocks: z.array(z.enum(GUIDE_BLOCKS)).optional(),
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
          "public landing page feeds). Waitlist members get launch invites and " +
          "founding-member pricing. Duplicate emails are fine - re-joining is a " +
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
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const project = token ? await getProjectByToken(token) : null;
  if (!project) {
    // Spell out WHICH way auth failed: an MCP client renders both cases as a
    // bare "Failed to connect", so the body is the only debuggable signal
    // (curl the URL, or read the client's connection log). Missing header and
    // unknown token have different fixes.
    const error = token
      ? "Unknown project key. The Bearer token IS the project - this one matches no project on this deploy (deleted project, wrong backend, or a stale copy). Copy the current connect command from the dashboard: Settings -> Project key."
      : "Missing Authorization header. Connect with the exact `claude mcp add` command from the dashboard (Settings -> Project key) - the Bearer token is what routes calls to your project.";
    return Response.json(
      { error },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="dispatchseo"' } },
    );
  }
  return projectStore.run(project, () => mcpHandler(req));
}

export { authed as GET, authed as POST, authed as DELETE };

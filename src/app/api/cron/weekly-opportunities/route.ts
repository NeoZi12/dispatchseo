import { db } from "@/lib/db";
import { credsForProject, keywordIdeas, type KeywordIdea } from "@/lib/dataforseo";
import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { DEFAULT_PROJECT_ID, getProjectById } from "@/lib/projects";

// RETIRED from vercel.json (the Claude weekly-research workflow replaced it)
// but kept callable. Scoped to the default project only - it predates
// multi-project and its env seed list is ClockedCode's.
//
// Weekly cron (Mondays). Discovers new content opportunities and drops them in
// the suggestions queue as 'pending' for the dashboard.
//  1. Seed = SEED_KEYWORDS env + tracked keywords + top GSC queries.
//  2. Expand via Labs keyword_ideas, filter to volume>500 & KD<10, drop anything
//     already tracked / already covered by a page / already in the queue.
//  3. Insert the top 5-10 as guide|tool suggestions.
//  4. Separately, GSC queries sitting at positions 5-15 become 'update'
//     suggestions ("push to top 3").

export const maxDuration = 60;

const VOL_MIN = 500;
const KD_MAX = 10;
const TOOL_PATTERN = /calculator|generator|checker|template|converter|formatter|builder/i;

// Setup gate marker: unmet prerequisites are an informational skip, never a
// failed run (no 500, no banner, no alert email) - same contract as
// gsc-readiness.ts in the other crons.
class SetupIncomplete extends Error {}

function classify(keyword: string): "guide" | "tool" {
  return TOOL_PATTERN.test(keyword) ? "tool" : "guide";
}

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  const result: Record<string, unknown> = {};
  let hadError = false;

  try {
    const project = await getProjectById(DEFAULT_PROJECT_ID);
    if (!project) throw new Error("Default project not found");
    const creds = await credsForProject(project);
    if (!creds) {
      throw new SetupIncomplete(
        "setup incomplete: no DataForSEO connected for the default project - connect it on Home before this cron can research",
      );
    }

    // --- gather seeds ---
    const seedEnv = (process.env.SEED_KEYWORDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { data: tracked } = await db()
      .from("keywords")
      .select("keyword")
      .eq("project_id", project.id);
    const trackedSet = new Set((tracked ?? []).map((k) => k.keyword.toLowerCase()));

    // latest GSC top queries as extra seeds
    const { data: latestGsc } = await db()
      .from("gsc_stats")
      .select("top_queries")
      .eq("project_id", project.id)
      .order("date", { ascending: false })
      .limit(1);
    const gscQueries: string[] = ((latestGsc?.[0]?.top_queries as Array<{ query: string }>) ?? [])
      .map((q) => q.query)
      .slice(0, 10);

    const seeds = Array.from(new Set([...seedEnv, ...trackedSet, ...gscQueries])).slice(0, 20);

    // --- expand ---
    const { ideas, cost } = await keywordIdeas(seeds, creds, 200);
    result.expansion = { seeds: seeds.length, ideas: ideas.length, cost };

    // --- what's already covered ---
    const { data: pages } = await db()
      .from("pages")
      .select("primary_keyword")
      .eq("project_id", project.id);
    const coveredSet = new Set(
      (pages ?? []).map((p) => (p.primary_keyword ?? "").toLowerCase()).filter(Boolean),
    );
    const { data: queued } = await db()
      .from("suggestions")
      .select("primary_keyword")
      .eq("project_id", project.id)
      .in("status", ["pending", "approved", "in_progress"]);
    const queuedSet = new Set(
      (queued ?? []).map((s) => (s.primary_keyword ?? "").toLowerCase()).filter(Boolean),
    );

    // --- filter + rank ---
    const seen = new Set<string>();
    const winners = ideas
      .filter((i: KeywordIdea) => {
        const k = i.keyword.toLowerCase();
        if (!k || seen.has(k)) return false;
        if (i.search_volume == null || i.search_volume <= VOL_MIN) return false;
        if (i.keyword_difficulty == null || i.keyword_difficulty >= KD_MAX) return false;
        if (trackedSet.has(k) || coveredSet.has(k) || queuedSet.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
      .slice(0, 10);

    // --- insert content suggestions ---
    const rows = winners.map((w) => ({
      project_id: project.id,
      type: classify(w.keyword),
      title: w.keyword,
      primary_keyword: w.keyword,
      keyword_volume: w.search_volume,
      keyword_difficulty: w.keyword_difficulty,
      rationale: `Volume ${w.search_volume}, KD ${w.keyword_difficulty}, CPC ${w.cpc ?? "n/a"}. Passes thresholds (vol>${VOL_MIN}, KD<${KD_MAX}); not yet tracked, covered, or queued.`,
      spec: { suggested_angle: "", serp_notes: "", source: "weekly-opportunities" },
      status: "pending",
    }));
    if (rows.length) {
      const { error } = await db().from("suggestions").insert(rows);
      if (error) throw new Error(error.message);
    }
    result.content_suggestions = rows.length;

    // --- GSC positions 5-15 -> update suggestions ---
    const nearMisses = ((latestGsc?.[0]?.top_queries as Array<{
      query: string;
      position: number;
      impressions: number;
    }>) ?? []).filter((q) => q.position >= 5 && q.position <= 15 && !queuedSet.has(q.query.toLowerCase()));
    const updateRows = nearMisses.slice(0, 5).map((q) => ({
      project_id: project.id,
      type: "update" as const,
      title: `Push "${q.query}" to top 3 (currently ~${Math.round(q.position)})`,
      primary_keyword: q.query,
      rationale: `Ranking ~${Math.round(q.position)} with ${q.impressions} impressions - a content refresh could reach the top 3.`,
      spec: { source: "weekly-opportunities", current_position: q.position },
      status: "pending",
    }));
    if (updateRows.length) {
      const { error } = await db().from("suggestions").insert(updateRows);
      if (error) throw new Error(error.message);
    }
    result.update_suggestions = updateRows.length;
  } catch (e) {
    if (e instanceof SetupIncomplete) {
      result.skipped = e.message;
    } else {
      hadError = true;
      result.error = e instanceof Error ? e.message : String(e);
    }
  }

  console.log("[weekly-opportunities]", JSON.stringify(result));
  await reportCronRun("weekly-opportunities", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}

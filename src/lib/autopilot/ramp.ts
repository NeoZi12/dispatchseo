import { cache } from "react";
import { db } from "@/lib/db";
import { projectHint } from "@/lib/billing";
import { DAY_MS, rampQuota, type RampVerdict } from "./math";

// The ramp and index-rate brake (math.ts rampQuota), fed from the database.
// Every caller of cadence() asks this for the week's ceiling. A read that
// fails is not evidence: it answers with the plan's number capped at 1, the
// slowest safe pace, never with "full speed".

const CLIENT_KIND = "dispatchseo-writer";

export type RampInputs = Pick<Parameters<typeof rampQuota>[0], "firstStartAt" | "gscConnected" | "articles">;

/** The day the "Google connected" check counts from: 14 days before `now`.
 *  A string, so rampInputs can be keyed on it. */
export function rampSinceDay(now: Date): string {
  return new Date(now.getTime() - 14 * DAY_MS).toISOString().slice(0, 10);
}

export async function rampFor(projectId: string, planQuota: number, now = new Date()): Promise<RampVerdict> {
  if (planQuota <= 0) return { quota: 0, stage: "full", reason: null };
  return rampVerdict(await rampInputs(projectId, rampSinceDay(now)), planQuota, now);
}

/** The week's ceiling from inputs already read. Null inputs = the reads
 *  failed: the plan's number capped at 1, never full speed. */
export function rampVerdict(inputs: RampInputs | null, planQuota: number, now: Date): RampVerdict {
  if (planQuota <= 0) return { quota: 0, stage: "full", reason: null };
  if (!inputs) return { quota: Math.min(planQuota, 1), stage: "ramp-1", reason: "one a week while the site's history could not be read" };
  return rampQuota({ planQuota, now, ...inputs });
}

/** The ramp's reads, apart from the verdict so the queue can start them
 *  beside the plan read instead of after it. Once per request (cache()),
 *  for whoever asks (the queue, the start gate). Null when a read failed. */
export const rampInputs = cache(async (projectId: string, since: string): Promise<RampInputs | null> => {
  try {
    // The row's created_at from the caller's copy when it has one
    // (billing.ts projectHint), else the one-row read.
    const hinted = projectHint(projectId)?.created_at;
    const [proj, first, gsc, drafts] = await Promise.all([
      hinted !== undefined ? Promise.resolve({ data: { created_at: hinted }, error: null }) : db().from("projects").select("created_at").eq("id", projectId).maybeSingle(),
      db().from("writer_runs").select("created_at").eq("project_id", projectId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      db().from("gsc_stats").select("date", { count: "exact", head: true }).eq("project_id", projectId).gte("date", since),
      db()
        .from("article_drafts")
        .select("published_url, published_at, created_at")
        .eq("project_id", projectId)
        .eq("client_kind", CLIENT_KIND)
        .eq("status", "published")
        .not("published_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (proj.error || first.error || gsc.error || drafts.error) throw new Error((proj.error ?? first.error ?? gsc.error ?? drafts.error)!.message);
    const rows = (drafts.data ?? []) as { published_url: string; published_at: string | null; created_at: string }[];
    let indexed = new Map<string, string | null>();
    if (rows.length) {
      const { data: pages, error } = await db().from("pages").select("url, indexed_at").eq("project_id", projectId).in("url", rows.map((r) => r.published_url));
      if (error) throw new Error(error.message);
      indexed = new Map(((pages ?? []) as { url: string; indexed_at: string | null }[]).map((p) => [p.url, p.indexed_at]));
    }
    return {
      // The site's age with us: the earlier of joining and the first engine
      // article, so an established site that signed up long ago does not
      // restart at one a week the day its first engine article starts.
      firstStartAt: earliest((proj.data as { created_at: string | null } | null)?.created_at, (first.data as { created_at: string } | null)?.created_at),
      gscConnected: (gsc.count ?? 0) > 0,
      articles: rows.map((r) => ({ publishedAt: r.published_at ?? r.created_at, indexedAt: indexed.get(r.published_url) ?? null })),
    };
  } catch (e) {
    console.warn(`[ramp] ${projectId}: could not read the ramp inputs (${e instanceof Error ? e.message : String(e)}); one a week`);
    return null;
  }
});

function earliest(...isos: Array<string | null | undefined>): string | null {
  const ms = isos.filter((x): x is string => Boolean(x)).map((x) => Date.parse(x)).filter(Number.isFinite);
  return ms.length ? new Date(Math.min(...ms)).toISOString() : null;
}

import { db } from "@/lib/db";
import { writerMode, type Project } from "@/lib/projects";

// Rank tracking for a hosted site starts when an article goes LIVE (audit
// 2026-10-24, cost). Research used to track every keyword it queued, so the
// weekly paid SERP sweep bought "not ranking" for ideas that had no page yet,
// and for ideas the writer later parked and never wrote. Now the keyword
// enters `keywords` from the publish success paths (verify.ts for WordPress
// and repo, publish-hosted.ts for the hosted blog), and nothing else on a
// hosted site adds one.
//
// An existing row keeps its status (a keyword the owner paused stays paused):
// ignoreDuplicates. Best-effort and never thrown - the article is live, and a
// failed tracking write must not turn its verify job into a retry loop.

export async function trackPublishedKeyword(
  project: Pick<Project, "id" | "slug" | "writer_mode">,
  draft: { primary_keyword: string | null; suggestion_id: string | null },
): Promise<void> {
  if (writerMode(project) !== "hosted") return;
  const keyword = draft.primary_keyword?.trim().toLowerCase();
  if (!keyword) return;
  try {
    type Meta = { keyword_volume: number | null; keyword_difficulty: number | null; spec: { intent?: string } | null };
    let meta: Meta | null = null;
    if (draft.suggestion_id) {
      const { data } = await db()
        .from("suggestions")
        .select("keyword_volume, keyword_difficulty, spec")
        .eq("id", draft.suggestion_id)
        .eq("project_id", project.id)
        .maybeSingle();
      meta = (data as Meta | null) ?? null;
    }
    const { error } = await db()
      .from("keywords")
      .upsert(
        [
          {
            project_id: project.id,
            keyword,
            search_volume: meta?.keyword_volume ?? null,
            keyword_difficulty: meta?.keyword_difficulty ?? null,
            intent: meta?.spec?.intent ?? null,
          },
        ],
        { onConflict: "project_id,keyword", ignoreDuplicates: true },
      );
    if (error) console.warn(`[autopilot] keyword tracking failed for ${project.slug}: ${error.message}`);
  } catch (e) {
    console.warn(`[autopilot] keyword tracking failed for ${project.slug}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

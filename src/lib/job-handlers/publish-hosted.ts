import { submitHostedSitemap } from "@/lib/gsc-sitemaps";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { hostedArticleUrl } from "@/lib/hosted-blog";
import { renderDraftForRoute } from "./finish";
import { schemaScript } from "@/lib/article-render";
import { dryDraftBlocked, parkDryDraft } from "./dry-guard";
import { trackPublishedKeyword } from "@/lib/autopilot/tracking";
import { ideaDone } from "@/lib/writer/runs";
import { warmScreenshotsLater } from "@/lib/page-screenshot";
import { linkOlderHostedArticles } from "@/lib/backlinks";

// The hosted half of the publish job: the article is served by us under the
// site's own /blog (src/lib/hosted-blog.ts), so "publishing" is a render for
// that address, a status flip and a page record. No credential, no remote
// API, nothing that can be mid-setup. Whether the site's /blog forwards to
// us yet is the owner's rewrite pull request, shown as a setup card - it
// never blocks the article, because the page is live at our address the
// moment this runs.
//
// THE RE-RENDER IS NOT OPTIONAL. A draft is finished BEFORE the route is
// known to be hosted (the switch happens at publish time, when the repo turns
// out to have no blog folder), so its structured data names
// https://site/<slug>. The page lives at https://site/blog/<slug>; rendering
// is deterministic, so it is simply done again for the right address.
//
// Mirrors what the verify job does for the other routes (log the page, close
// the idea, then flip the status), in the same order and for the same
// reason: the status flip is what makes a re-run a no-op, so it goes last.
const LIVE = ["accepted", "finished", "blocked_setup"];

export async function runHostedPublish(project: Project, draftId: string): Promise<void> {
  const { data } = await db()
    .from("article_drafts")
    .select("id, title, slug, meta_description, primary_keyword, markdown, faq, sources, suggestion_id, status, published_at, validation")
    .eq("id", draftId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!data) throw new Error("that article no longer exists");
  const row = data as Parameters<typeof renderDraftForRoute>[1] & { suggestion_id: string | null; status: string; published_at: string | null; validation: unknown };
  // Allowlist, as every publish handler: a discarded draft with a pending job
  // must never go live.
  if (!LIVE.includes(row.status)) return;
  if (dryDraftBlocked(row.validation)) return parkDryDraft(row.id, row.validation);

  const now = new Date().toISOString();
  const publishedAt = row.published_at ?? now;
  const finished = await renderDraftForRoute(project, row, "hosted", publishedAt);
  const html = finished.html + schemaScript(finished.schema);
  const url = hostedArticleUrl(project, row.slug);

  const { error: pageError } = await db()
    .from("pages")
    .upsert(
      {
        project_id: project.id,
        url,
        title: row.title,
        type: "guide",
        primary_keyword: row.primary_keyword,
        published_at: publishedAt,
        live_at: now,
        live_checked_at: now,
      },
      { onConflict: "project_id,url" },
    );
  if (pageError) throw new Error(`published, but could not log the page: ${pageError.message}`);

  // Live on our side this instant: start rank-tracking its keyword now (a
  // hosted site's keywords are tracked only once published - tracking.ts).
  await trackPublishedKeyword(project, row);

  // Tell Google the blog's sitemap exists, on the owner's own connection
  // (lib/gsc-sitemaps.ts). Best-effort: a grant without the write scope is
  // silence, and nothing here can hold the article back.
  await submitHostedSitemap(project).then(
    (r) => { if (r !== "submitted" && r !== "no-scope") console.log(`[publish-hosted] sitemap for ${project.slug}: ${r}`); },
    () => undefined,
  );

  if (row.suggestion_id) await ideaDone(project.id, row.suggestion_id, now, false);

  // Status re-checked in the write: a discard that landed between our read
  // and this update must win.
  const { data: flipped, error } = await db()
    .from("article_drafts")
    .update({ rendered_html: html, meta_description: finished.excerpt, status: "published", published_url: url, published_at: publishedAt, updated_at: now })
    .eq("id", row.id)
    .in("status", LIVE)
    .select("id");
  if (error) throw new Error(`published, but could not record it: ${error.message}`);
  // Its closest older articles link to it now that it is live (backlinks.ts) -
  // only if it IS live: a discard that won the race above leaves nothing to
  // link to. Best-effort: the article is published whatever happens here.
  if (flipped?.length) await linkOlderHostedArticles(project, row, url).then(
    (done) => { if (done.length) console.log(`[publish-hosted] ${project.slug}: linked from ${done.map((d) => `${d.sourceUrl} ("${d.anchor}")`).join(", ")}`); },
    (e) => console.warn(`[publish-hosted] ${project.slug}: older-article links skipped: ${e instanceof Error ? e.message : String(e)}`),
  );
  // The dashboard's preview of it (page-screenshot.ts). If the blog isn't
  // reachable at this address yet, the dashboard takes it later.
  warmScreenshotsLater(project.id, [url], 1);
}

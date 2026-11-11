import { sitePath } from "@/lib/site-root";
import { db } from "./db";
import { firstArticleHtml } from "./email/templates";
import type { Project } from "./projects";

// "Hey, your first article is up" (owner, 2026-11-08). One email per site,
// the moment its FIRST article is live, with a button to read it. Every later
// article is silent: the dashboard shows them, and a weekly inbox nudge is
// not what people signed up for.
//
// Called from each publish path right after the draft flips to published
// (publish-hosted, and verify's pull-request and WordPress branches), so a
// hosted blog and a repo site get the same email. "First" = no other draft of
// this site is published yet. Best-effort end to end: the article is live
// whatever happens here, so nothing in this file throws.
//
// Sent from CUSTOMER_EMAIL_FROM (the customer sender, not the operator's
// alerts address) through Resend; with either unset, nobody is emailed.

const RESEND_URL = "https://api.resend.com/emails";

export async function notifyFirstArticleLive(
  project: Pick<Project, "id" | "slug" | "domain" | "owner_user_id"> & { site_path?: string | null },
  article: { draftId: string; url: string; title: string | null },
): Promise<"sent" | "skipped"> {
  try {
    const from = process.env.CUSTOMER_EMAIL_FROM;
    const apiKey = process.env.RESEND_API_KEY;
    if (!from || !apiKey || !project.owner_user_id) return "skipped";

    const { count, error } = await db()
      .from("article_drafts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      // An article the owner later took down was still the first: without
      // these two, removing the only live article made the next one "your
      // first article is live" all over again.
      .in("status", ["published", "removing", "removed"])
      .neq("id", article.draftId);
    // Unsure whether this is the first: stay quiet rather than email twice.
    if (error || (count ?? 0) > 0) return "skipped";

    const { data: u } = await db().auth.admin.getUserById(project.owner_user_id);
    const to = u?.user?.email;
    if (!to) return "skipped";

    const { backendBaseUrl } = await import("./pipeline-pack");
    const dashboard = await backendBaseUrl();
    // A site in a folder of its host is named with the folder
    // ("you.github.io/your-repo"): the bare host is somebody else's page.
    const domain = project.domain ? `${project.domain}${sitePath(project)}` : project.slug;
    const title = article.title?.trim() || "Your first article";
    // The cover leads the email when the article has one (/api/cover/<id>,
    // a PNG or the writer's picture); without one the card shows the title.
    const { data: draft } = await db().from("article_drafts").select("cover_url").eq("id", article.draftId).maybeSingle();
    const cover = (draft as { cover_url?: string | null } | null)?.cover_url ?? null;
    const coverUrl = cover ? (cover.startsWith("http") ? cover : `${dashboard}${cover}`) : null;

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Your first article is live on ${domain}`,
        text:
          `Hi,\n\n` +
          `The first article DispatchSEO wrote for ${domain} is live:\n\n` +
          `${title}\n${article.url}\n\n` +
          `Google usually needs a few days to a few weeks to index a new page, so the first visits show up later, not today. ` +
          `The next article arrives on your plan's schedule.\n\n` +
          `Your dashboard: ${dashboard}\n\n` +
          `DispatchSEO`,
        html: firstArticleHtml({ base: dashboard, domain, title, url: article.url, dashboard, coverUrl }),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[first-article-email] ${project.slug}: Resend answered ${res.status}`);
      return "skipped";
    }
    return "sent";
  } catch (e) {
    console.warn(`[first-article-email] ${project.slug}: ${e instanceof Error ? e.message : String(e)}`);
    return "skipped";
  }
}

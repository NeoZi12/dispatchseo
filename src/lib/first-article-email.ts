import { sitePath } from "@/lib/site-root";
import { db } from "./db";
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
      .eq("status", "published")
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
        html: firstArticleHtml({ domain, title, url: article.url, dashboard }),
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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstArticleHtml(v: { domain: string; title: string; url: string; dashboard: string }): string {
  return (
    `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e6e8;border-radius:12px;padding:32px">` +
    `<tr><td style="font-size:16px;line-height:1.6">` +
    `<p style="margin:0 0 16px">Hi,</p>` +
    `<p style="margin:0 0 16px">The first article DispatchSEO wrote for <strong>${esc(v.domain)}</strong> is live.</p>` +
    `<p style="margin:0 0 24px;font-size:18px;font-weight:600">${esc(v.title)}</p>` +
    `<p style="margin:0 0 28px"><a href="${esc(v.url)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Read the article</a></p>` +
    `<p style="margin:0 0 16px;color:#444">Google usually needs a few days to a few weeks to index a new page, so the first visits show up later, not today. The next article arrives on your plan's schedule.</p>` +
    `<p style="margin:0;color:#444">Everything else is on <a href="${esc(v.dashboard)}" style="color:#111">your dashboard</a>.</p>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

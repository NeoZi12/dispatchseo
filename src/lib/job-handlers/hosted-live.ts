import { db } from "@/lib/db";
import { enqueue, type Job } from "@/lib/jobs";
import { getProjectById, publishTarget, type Project } from "@/lib/projects";
import { checkRewriteLive, manualSnippet } from "@/lib/hosted-rewrite";
import { notifyFirstArticleLive } from "@/lib/first-article-email";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { siteOrigin } from "@/lib/hosted-blog";

// Watches a hosted site's own /blog until it answers from us (the marker
// header), then sends the "your first article is live" email for the first
// published article - the link in that email is on the owner's domain, so
// sending it before the forwarding works would hand them a dead link
// (easyrender.app, 2026-11-09). Started by switchToHostedBlog and by a
// hosted publish that found the forwarding not live yet.
//
// One pass per jobs tick for up to a day. After that, the owner gets ONE
// email with the exact rule for their stack: the product asks the owner,
// never the operator. The chain then ends; the Settings card keeps showing
// the rule, and the weekly re-probe keeps looking.

const EVERY_MS = 5 * 60_000;
const GIVE_UP_MS = 24 * 3_600_000;

export async function runHostedLiveJob(job: Job): Promise<void> {
  const project = await getProjectById(job.project_id);
  if (!project || publishTarget(project) !== "hosted") return;
  const since = typeof job.payload.since === "string" ? job.payload.since : job.created_at;
  const n = Number(job.payload.n ?? 0);

  // Already live before this pass: whoever stamped it (a publish, the
  // settings screen) also owned the email. Nothing left to watch.
  if (project.hosted_rewrite_live_at) return;

  const live = await checkRewriteLive(project).catch(() => false);
  if (live) {
    await emailFirstPublished(project);
    return;
  }
  if (Date.now() - Date.parse(since) > GIVE_UP_MS) {
    await notifyForwardingNeeded(project);
    return;
  }
  await enqueue({
    projectId: project.id,
    kind: "hosted-live",
    payload: { since, n: n + 1 },
    runAfter: new Date(Date.now() + EVERY_MS),
    idempotencyKey: `hosted-live:${project.id}:${since}:${n + 1}`,
  });
}

/** The first published article of this site, if one is live on our side. */
async function emailFirstPublished(project: Project): Promise<void> {
  const { data } = await db()
    .from("article_drafts")
    .select("id, title, published_url")
    .eq("project_id", project.id)
    .eq("status", "published")
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; title: string | null; published_url: string | null } | null;
  if (!row?.published_url) return;
  await notifyFirstArticleLive(project, { draftId: row.id, url: row.published_url, title: row.title });
}

/** One email, after a day without the forwarding: the rule for their stack,
 *  spelled out. Best-effort, never throws (the chain ends either way). */
async function notifyForwardingNeeded(project: Project): Promise<void> {
  try {
    const from = process.env.CUSTOMER_EMAIL_FROM;
    const apiKey = process.env.RESEND_API_KEY;
    if (!from || !apiKey || !project.owner_user_id || !project.hosted_key) return;
    const { data: u } = await db().auth.admin.getUserById(project.owner_user_id);
    const to = u?.user?.email;
    if (!to) return;
    const backend = await backendBaseUrl();
    const snippets = manualSnippet(backend, project.hosted_key);
    const origin = siteOrigin(project);
    const domain = project.domain || project.slug;
    const text =
      `Hi,\n\n` +
      `Your first article for ${domain} is written and waiting. One thing is missing on your side: ${origin}/blog does not forward to your hosted blog yet, so nobody can reach it.\n\n` +
      `If your site is Next.js, add this to next.config.js and deploy:\n\n${snippets.next}\n\n` +
      `On Vercel without Next.js, put this in vercel.json:\n\n${snippets.vercel}\n\n` +
      `On Netlify, add these two lines to _redirects:\n\n${snippets.netlify}\n` +
      `The same rules, for copying, are on your settings screen: ${backend}/settings?section=publishing\n\n` +
      `As soon as ${origin}/blog answers, the article is live and you get a mail with the link.\n\n` +
      `DispatchSEO`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: `One line to switch on your blog at ${domain}`, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[hosted-live] ${project.slug}: Resend answered ${res.status}`);
  } catch (e) {
    console.warn(`[hosted-live] ${project.slug}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

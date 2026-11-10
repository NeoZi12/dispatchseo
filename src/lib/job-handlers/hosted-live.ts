import { db } from "@/lib/db";
import { enqueue, type Job } from "@/lib/jobs";
import { getProjectById, publishTarget, type Project } from "@/lib/projects";
import { checkRewriteLive, mergeRewritePr, replanForwarding } from "@/lib/hosted-rewrite";
import { notifyFirstArticleLive } from "@/lib/first-article-email";

// Watches a hosted site's own /blog until it answers from us (the marker
// header), then sends the "your first article is live" email for the first
// published article - the link in that email is on the owner's domain, so
// sending it before the forwarding works would hand them a dead link
// (easyrender.app, 2026-11-09). Started by switchToHostedBlog and by a
// hosted publish that found the forwarding not live yet.
//
// One pass per jobs tick for up to a day, then the chain ends quietly. The
// next hosted publish starts a new one, and the weekly re-probe keeps
// looking, so the "live" email still goes out whenever the address answers.
//
// NO EMAIL ASKS THE OWNER TO ADD THE FORWARDING (owner's rule, 2026-11-10):
// this product never mails a customer "your site did not work, do X". A site
// either works end to end and gets one email - "your first article is live" -
// or it is refused at setup. Until that day a mail went out here after 24
// hours with the rule to paste; a site we cannot forward on our own is a
// case for setup to refuse or for us to solve, never the customer's job.

const EVERY_MS = 5 * 60_000;
const GIVE_UP_MS = 24 * 3_600_000;
/** A merged change not serving after this long is on a host that needs a deploy or a different rule. */
const REPLAN_AFTER_MS = 20 * 60_000;

export async function runHostedLiveJob(job: Job): Promise<void> {
  const project = await getProjectById(job.project_id);
  if (!project || publishTarget(project) !== "hosted") return;
  const since = typeof job.payload.since === "string" ? job.payload.since : job.created_at;
  const n = Number(job.payload.n ?? 0);

  // Already live before this pass: whoever stamped it (a publish, the
  // settings screen) also owned the email. Nothing left to watch.
  if (project.hosted_rewrite_live_at) return;

  // On Auto, a merge GitHub refused the first time (mergeability is often
  // still computing seconds after a pull request opens) is tried again each
  // pass until the site answers. Best-effort; the state column says why.
  const pr = project.hosted_rewrite_pr_url;
  const state = project.hosted_rewrite_state ?? "";
  if (project.auto_merge && pr && pr.startsWith("http") && !state.startsWith("merged") && state !== "owner-merge") {
    await mergeRewritePr(project, pr).catch(() => undefined);
  }

  const live = await checkRewriteLive(project).catch(() => false);
  if (live) {
    await emailFirstPublished(project);
    return;
  }
  // Merged twenty minutes ago and still not answering: a Vercel deploy
  // would be done by now. If the site is not on Vercel/Netlify, the merged
  // config file is inert there and an in-app rule is opened instead
  // (hosted-rewrite.ts replanForwarding; a no-op for in-app kinds).
  if (state.startsWith("merged") && Date.now() - Date.parse(since) > REPLAN_AFTER_MS) {
    await replanForwarding(project).catch((e) => console.warn(`[hosted-live] ${project.slug}: re-plan failed: ${e instanceof Error ? e.message : String(e)}`));
  }
  if (Date.now() - Date.parse(since) > GIVE_UP_MS) return;
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

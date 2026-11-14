import { NextResponse } from "next/server";
import { dashboardAuth } from "@/lib/auth-gate";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { firstArticleKey, firstArticleProgress } from "@/lib/first-article-progress";
import { checkRewriteLive, lovableFileMerged, lovablePublishPending, syncRewriteMerged } from "@/lib/hosted-rewrite";
import { getProjectById } from "@/lib/projects";

// What the first-article card polls (app/(dashboard)/first-article-card.tsx):
// one small string that changes when the card would read differently. The
// card used to router.refresh() every 20 seconds, which re-rendered the
// layout AND the whole page it was covering - Home's five reads, the
// report, the queue - for output nobody saw. Now it asks here, five cheap
// reads, and refreshes only when the answer moved. Same auth as every
// dashboard page; the project is the one the dashboard is looking at.
export const dynamic = "force-dynamic";

/** When each pending Lovable site was last looked at from here. The card
 *  polls every 20 seconds; this keeps a caller that polls faster from turning
 *  the route into a way to hit somebody's site once per request. */
const PROBE_EVERY_MS = 15_000;
const lastProbe = new Map<string, number>();

export async function GET() {
  const auth = await dashboardAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const project = await getActiveProjectOrNull();
  if (!project) return NextResponse.json({ error: "no project" }, { status: 404 });
  // A Lovable site waiting for its owner's Publish click: the owner is on
  // this card, about to press it (or just did). Look at the site now, so the
  // card moves within one poll of the click instead of waiting for the
  // five-minute watch. One bounded fetch of their own page, only while the
  // card is open and only until it answers.
  let current = project;
  if (lovablePublishPending(project) && Date.now() - (lastProbe.get(project.id) ?? 0) >= PROBE_EVERY_MS) {
    lastProbe.set(project.id, Date.now());
    if (lastProbe.size > 500) lastProbe.clear();
    // Not merged as far as the row knows: an owner who merges the pull
    // request themselves is found here, so the card can ask for Publish.
    const moved = lovableFileMerged(project) ? false : await syncRewriteMerged(project).catch(() => false);
    if ((await checkRewriteLive(project).catch(() => false)) || moved) {
      current = (await getProjectById(project.id).catch(() => null)) ?? project;
    }
  }
  // A failed read answers null: the card keeps its last key and tries again
  // on the next tick.
  const progress = await firstArticleProgress(current).catch(() => null);
  return NextResponse.json({ key: progress ? firstArticleKey(progress) : null }, { headers: { "cache-control": "no-store" } });
}

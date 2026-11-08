import { NextResponse } from "next/server";
import { dashboardAuth } from "@/lib/auth-gate";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { firstArticleKey, firstArticleProgress } from "@/lib/first-article-progress";

// What the first-article card polls (app/(dashboard)/first-article-card.tsx):
// one small string that changes when the card would read differently. The
// card used to router.refresh() every 20 seconds, which re-rendered the
// layout AND the whole page it was covering - Home's five reads, the
// report, the queue - for output nobody saw. Now it asks here, five cheap
// reads, and refreshes only when the answer moved. Same auth as every
// dashboard page; the project is the one the dashboard is looking at.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await dashboardAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const project = await getActiveProjectOrNull();
  if (!project) return NextResponse.json({ error: "no project" }, { status: 404 });
  // A failed read answers null: the card keeps its last key and tries again
  // on the next tick.
  const progress = await firstArticleProgress(project).catch(() => null);
  return NextResponse.json({ key: progress ? firstArticleKey(progress) : null }, { headers: { "cache-control": "no-store" } });
}

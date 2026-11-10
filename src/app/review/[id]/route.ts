import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dashboardAuth } from "@/lib/auth-gate";
import { PROJECT_COOKIE, scopedProjects } from "@/lib/active-project";

// The "Review and publish" link in the ready-for-review email
// (review-email.ts). The article page reads the ACTIVE site from the
// dash_project cookie, so an owner with two sites whose cookie points at the
// other one would land on a 404. This switches to the article's own site
// first, then opens the article.
//
// Not on the proxy allowlist on purpose: a signed-out click is sent to
// /login like any dashboard page. Only the signed-in owner's own sites are
// candidates (scopedProjects), so an id from someone else's site is just
// the list page.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const list = new URL("/articles", req.url);
  if (!(await dashboardAuth())) return NextResponse.redirect(new URL("/login", req.url));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(list);

  const { data } = await db().from("article_drafts").select("project_id").eq("id", id).maybeSingle();
  const projectId = (data as { project_id: string } | null)?.project_id;
  const site = projectId ? (await scopedProjects()).find((p) => p.id === projectId) : undefined;
  if (!site) return NextResponse.redirect(list);

  const res = NextResponse.redirect(new URL(`/articles/${encodeURIComponent(id)}`, req.url));
  res.cookies.set(PROJECT_COOKIE, site.slug, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

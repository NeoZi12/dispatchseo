import { countHostedPosts, hostedHeaders, hostedProject, INDEX_PAGE_SIZE, listHostedPosts, renderHostedIndex } from "@/lib/hosted-blog";

// A customer's /blog index, served under their domain through the rewrite
// (src/lib/hosted-rewrite.ts). The [slug] segment is the project's random
// hosted key, not its slug. Plain HTML from a route handler on purpose: the
// app's own layout (dark dashboard chrome, analytics, fonts) must never leak
// onto someone else's site.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug: key } = await ctx.params;
  const project = await hostedProject(key);
  if (!project) return new Response("Not found", { status: 404 });
  const page = Math.max(1, Math.min(10_000, Number(new URL(req.url).searchParams.get("page") ?? "1") || 1));
  const [posts, total] = await Promise.all([listHostedPosts(project.id, INDEX_PAGE_SIZE, (page - 1) * INDEX_PAGE_SIZE), countHostedPosts(project.id)]);
  return new Response(await renderHostedIndex(project, posts, { page, total }), { headers: hostedHeaders("text/html; charset=utf-8") });
}

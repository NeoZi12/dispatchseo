import { getHostedPost, hostedHeaders, hostedPostRemoved, hostedProject, renderHostedArticle } from "@/lib/hosted-blog";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; article: string }> }): Promise<Response> {
  const { slug: key, article } = await ctx.params;
  const project = await hostedProject(key);
  if (!project) return new Response("Not found", { status: 404 });
  let decoded = article;
  try {
    decoded = decodeURIComponent(article);
  } catch {
    // keep the raw segment
  }
  const slug = decoded.replace(/\/+$/, "");
  const post = await getHostedPost(project.id, slug);
  if (!post) {
    // Taken down by the owner (article-owner.ts): 410, not 404. Google treats
    // "gone" as final and drops the page in days; a 404 is retried for weeks.
    if (await hostedPostRemoved(project.id, slug)) return new Response("This article was removed.", { status: 410, headers: hostedHeaders("text/plain; charset=utf-8") });
    return new Response("Not found", { status: 404, headers: hostedHeaders("text/plain; charset=utf-8") });
  }
  return new Response(await renderHostedArticle(project, post), { headers: hostedHeaders("text/html; charset=utf-8") });
}

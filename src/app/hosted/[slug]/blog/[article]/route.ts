import { getHostedPost, hostedHeaders, hostedProject, renderHostedArticle } from "@/lib/hosted-blog";

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
  const post = await getHostedPost(project.id, decoded.replace(/\/+$/, ""));
  if (!post) return new Response("Not found", { status: 404, headers: hostedHeaders("text/plain; charset=utf-8") });
  return new Response(await renderHostedArticle(project, post), { headers: hostedHeaders("text/html; charset=utf-8") });
}

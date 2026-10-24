import { hostedHeaders, hostedProject, listHostedPosts, renderHostedFeed } from "@/lib/hosted-blog";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug: key } = await ctx.params;
  const project = await hostedProject(key);
  if (!project) return new Response("Not found", { status: 404 });
  const posts = await listHostedPosts(project.id, 30);
  return new Response(await renderHostedFeed(project, posts), { headers: hostedHeaders("application/rss+xml; charset=utf-8") });
}

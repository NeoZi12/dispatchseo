import { hostedHeaders, hostedProject, listHostedPosts, renderHostedSitemap } from "@/lib/hosted-blog";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug: key } = await ctx.params;
  const project = await hostedProject(key);
  if (!project) return new Response("Not found", { status: 404 });
  const posts = await listHostedPosts(project.id, 50_000);
  return new Response(renderHostedSitemap(project, posts), { headers: hostedHeaders("application/xml; charset=utf-8") });
}

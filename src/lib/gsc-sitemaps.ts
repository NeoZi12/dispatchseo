import { oauthSearchConsole } from "@/lib/gsc-oauth";
import { siteOrigin } from "@/lib/hosted-blog";
import type { Project } from "@/lib/projects";

// Telling Google where the hosted blog's sitemap is, so a site whose owner
// never opens Search Console still gets every article discovered.
//
// The hosted blog renders its own sitemap at <site>/blog/sitemap.xml
// (src/app/hosted/[slug]/blog/sitemap.xml). Google only reads a sitemap it
// knows about: through robots.txt (not ours to edit), through the owner
// pasting it into Search Console (a free user never will), or through the
// Search Console API, which is what this does - one call per publish, on
// the Google connection the owner made during setup. Resubmitting the same
// sitemap is a no-op on Google's side, so the call is simply made every
// time a hosted article goes live.
//
// Best-effort by design: a grant without the write scope (connections made
// before the setup scopes shipped, or while Google is still reviewing them)
// is refused with 403 and that is silence here, never a failed publish. The
// article is live either way; this only shortens how long Google takes to
// notice. There is no API that asks Google to index a regular page: the
// Indexing API is for job postings and livestreams, and the URL Inspection
// API is read-only (lib/indexing.ts), so this and the links on the owner's
// site are the whole legitimate toolbox.

/** The hosted blog's sitemap address on the owner's domain. */
export function hostedSitemapUrl(project: Pick<Project, "domain"> & { hosted_origin?: string | null }): string {
  return `${siteOrigin(project)}/blog/sitemap.xml`;
}

/** Submit the hosted blog's sitemap to the project's Search Console
 *  property. Returns what happened, for the publish log; never throws. */
export async function submitHostedSitemap(project: Project): Promise<"submitted" | "no-connection" | "no-property" | "no-scope" | "failed"> {
  if (!project.gsc_oauth_refresh_token) return "no-connection";
  if (!project.gsc_site_url) return "no-property";
  try {
    const sc = await oauthSearchConsole(project.gsc_oauth_refresh_token);
    await sc.sitemaps.submit({ siteUrl: project.gsc_site_url, feedpath: hostedSitemapUrl(project) });
    return "submitted";
  } catch (e) {
    const err = e as { code?: number | string; message?: string };
    const status = Number(err?.code);
    if (status === 403 || /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(String(err?.message ?? ""))) return "no-scope";
    console.warn(`[gsc-sitemaps] sitemap submit for ${project.slug} failed: ${err?.message ?? String(e)}`);
    return "failed";
  }
}

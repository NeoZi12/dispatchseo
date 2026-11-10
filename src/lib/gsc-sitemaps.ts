import { oauthSearchConsole, setupScopesEnabled } from "@/lib/gsc-oauth";
import { fetchProjectUrl } from "@/lib/url-guard";
import { readCapped } from "@/lib/hosted-theme";
import { serviceAccountWriteClient } from "@/lib/gsc";
import { instanceTokenAllowedFor } from "@/lib/github";
import { hostedBase } from "@/lib/hosted-blog";
import { publishTarget, type Project } from "@/lib/projects";

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
export function hostedSitemapUrl(project: Pick<Project, "domain"> & { hosted_origin?: string | null; hosted_path?: string | null }): string {
  return `${hostedBase(project)}/sitemap.xml`;
}

/** Submit the hosted blog's sitemap to the project's Search Console
 *  property. Returns what happened, for the publish log; never throws. */
/** Who may write to this project's Search Console property: the owner's own
 *  Google connection, else - for the operator's allowlisted sites only - the
 *  shared service account with write scope. null = nobody. */
async function sitemapClient(project: Project) {
  if (project.gsc_oauth_refresh_token) return oauthSearchConsole(project.gsc_oauth_refresh_token);
  if (instanceTokenAllowedFor({ github_repo: project.github_repo, id: project.id, slug: project.slug })) return serviceAccountWriteClient();
  return null;
}

export async function submitHostedSitemap(project: Project): Promise<"submitted" | "no-connection" | "no-property" | "no-scope" | "failed"> {
  if (!project.gsc_site_url) return "no-property";
  try {
    const sc = await sitemapClient(project);
    if (!sc) return "no-connection";
    await sc.sitemaps.submit({ siteUrl: project.gsc_site_url, feedpath: hostedSitemapUrl(project) });
    return "submitted";
  } catch (e) {
    const err = e as { code?: number | string; message?: string };
    const status = Number(err?.code);
    if (status === 403 || /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|sufficient permission/i.test(String(err?.message ?? ""))) {
      console.warn(`[gsc-sitemaps] ${project.slug}: no write access to its Search Console property (${err?.message ?? "403"}) - grant Full permission to resubmit sitemaps`);
      return "no-scope";
    }
    console.warn(`[gsc-sitemaps] sitemap submit for ${project.slug} failed: ${err?.message ?? String(e)}`);
    return "failed";
  }
}

/**
 * The same, for a site that publishes on its own (a repo or WordPress): its
 * sitemap is wherever its robots.txt says (the first "Sitemap:" line on its
 * own host), else /sitemap.xml. Called when an article is confirmed live, so
 * Google re-reads the sitemap now rather than whenever it next decides to -
 * ClockedCode's had not been read since July (2026-11-08) and 7 of its 8
 * newest articles were "URL is unknown to Google". OAuth only: the shared
 * service account stays read-only, so an operator site connected through it
 * gets "no-connection" and needs the owner's Google connection to resubmit.
 * Never the Indexing API - that is for job postings and livestreams only.
 */
export async function submitSiteSitemap(project: Project): Promise<"submitted" | "no-connection" | "no-property" | "no-scope" | "failed"> {
  if (!project.gsc_site_url) return "no-property";
  const feedpath = await siteSitemapUrl(project).catch(() => null);
  if (!feedpath) return "failed";
  try {
    const sc = await sitemapClient(project);
    if (!sc) return "no-connection";
    await sc.sitemaps.submit({ siteUrl: project.gsc_site_url, feedpath });
    return "submitted";
  } catch (e) {
    const err = e as { code?: number | string; message?: string };
    if (Number(err?.code) === 403 || /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|sufficient permission/i.test(String(err?.message ?? ""))) {
      console.warn(`[gsc-sitemaps] ${project.slug}: no write access to its Search Console property (${err?.message ?? "403"}) - grant Full permission to resubmit sitemaps`);
      return "no-scope";
    }
    console.warn(`[gsc-sitemaps] sitemap submit for ${project.slug} failed: ${err?.message ?? String(e)}`);
    return "failed";
  }
}

async function siteSitemapUrl(project: Project): Promise<string> {
  const origin = `https://${project.domain.replace(/^www\./, "")}`;
  const res = await fetchProjectUrl(`${origin}/robots.txt`, project.domain, { timeoutMs: 5_000, userAgent: "DispatchSEO-Sitemap/1.0 (+https://dispatchseo.com)" });
  if (res?.ok) {
    const text = await readCapped(res, 50_000);
    for (const m of text.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)) {
      try {
        const u = new URL(m[1]);
        const bare = project.domain.replace(/^www\./, "").toLowerCase();
        const host = u.hostname.toLowerCase();
        // Only a sitemap on the site's own host: Search Console refuses
        // another host's anyway, and robots.txt is the site's to write.
        if (u.protocol === "https:" && (host === bare || host.endsWith(`.${bare}`))) return u.toString();
      } catch {
        // not a URL
      }
    }
  } else {
    await res?.body?.cancel().catch(() => undefined);
  }
  return `${origin}/sitemap.xml`;
}

// --- is Google reading it? -------------------------------------------------------
//
// ClockedCode's sitemap sat unread from 2026-07-12 to 2026-11-08 and nobody
// knew: Search Console shows "last read" only to someone who opens it. So the
// report asks (sitemaps.list, at most twice a day per site) when Google last
// downloaded the sitemap, resubmits it on the spot when that was 14+ days ago,
// and raises a setup card (setup.sitemap) for the owner - a nudge, never an
// alarm: the articles are live either way.

export const SITEMAP_STALE_DAYS = 14;

export type SitemapFreshness = {
  /** Google's last download of the site's sitemap; null = never. */
  lastReadAt: string | null;
  /** The sitemap we checked. */
  sitemap: string;
  /** What the resubmit did; "no-scope" means the owner must grant Full access. */
  resubmit: Awaited<ReturnType<typeof submitSiteSitemap>> | null;
};

/** Null when the sitemap is fresh, or when nobody may ask (no property, no
 *  connection), or when Google could not be asked. Cached 12 hours. */
export async function staleSitemap(project: Project): Promise<SitemapFreshness | null> {
  if (!project.gsc_site_url) return null;
  const { unstable_cache } = await import("next/cache");
  return unstable_cache(() => checkSitemap(project), ["sitemap-freshness-v1", project.id, project.gsc_site_url], { revalidate: 12 * 3600 })().catch(() => null);
}

export async function checkSitemap(project: Project): Promise<SitemapFreshness | null> {
  const sc = await sitemapClient(project).catch(() => null);
  if (!sc || !project.gsc_site_url) return null;
  const hosted = publishTarget(project) === "hosted";
  const sitemap = hosted ? hostedSitemapUrl(project) : await siteSitemapUrl(project).catch(() => `https://${project.domain}/sitemap.xml`);
  let listed: { path?: string | null; lastDownloaded?: string | null }[];
  try {
    const res = await sc.sitemaps.list({ siteUrl: project.gsc_site_url });
    listed = (res.data.sitemap ?? []) as { path?: string | null; lastDownloaded?: string | null }[];
  } catch (e) {
    console.warn(`[gsc-sitemaps] sitemaps.list for ${project.slug} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
  const ours = listed.find((s) => s.path && norm(s.path) === norm(sitemap));
  // Ours when Search Console knows it; otherwise the freshest it knows (a
  // site's sitemap index or a CMS's own), since any recent read means Google
  // is crawling the site's map.
  const reads = (ours ? [ours] : listed).map((s) => Date.parse(s.lastDownloaded ?? "")).filter(Number.isFinite);
  const last = reads.length ? Math.max(...reads) : null;
  if (last !== null && Date.now() - last < SITEMAP_STALE_DAYS * 86_400_000) return null;
  const resubmit = hosted ? await submitHostedSitemap(project) : await submitSiteSitemap(project);
  // An owner's grant made while the deploy asks only for the read-only scope
  // (GOOGLE_SETUP_SCOPES unset, i.e. before Google verified the app) cannot
  // resubmit, and nothing the owner does in Search Console changes that - so
  // there is no card to show, only the quiet log. The operator's service
  // account path is unaffected: its "no-scope" IS a permission to grant.
  if (resubmit === "no-scope" && project.gsc_oauth_refresh_token && !setupScopesEnabled()) return null;
  return { lastReadAt: last === null ? null : new Date(last).toISOString(), sitemap, resubmit };
}

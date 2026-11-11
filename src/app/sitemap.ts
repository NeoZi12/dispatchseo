import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getDocSlugs } from "@/lib/docs";
import { getAllTools } from "@/lib/free-tools";
import { LATEST } from "@/lib/changelog";
import { requestOrigin } from "@/lib/origin";

// Next prerenders sitemap.ts at build time by default, and that is exactly
// wrong for a self-host: the docker app image is compiled by OUR CI, with no
// APP_URL and no idea what domain it will end up serving, so a prerendered
// sitemap freezes dispatchseo.com into every install and advertises our pages
// from the owner's site. Resolve per request instead - the file is a handful
// of in-memory arrays, so rendering it on demand costs nothing.
export const dynamic = "force-dynamic";

// Same resolution order as pipeline-pack's backendBaseUrl(): the owner's
// declared public URL first, the host this request actually arrived on second,
// dispatchseo.com only when neither exists.
async function baseUrl(): Promise<string> {
  // APP_URL is the address the owner told the stack to call itself (start.sh
  // writes it, docs/vps.mdx documents hand-setting it behind a reverse proxy).
  // It wins over the request host because a visitor may well have arrived on a
  // raw IP:port while the canonical, crawlable address is the domain.
  const declared = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (declared) return declared;
  try {
    // No APP_URL: the host header is the only thing that knows where this
    // install lives, and it is at least honest about what the visitor typed.
    return await requestOrigin();
  } catch {
    // Only reachable if this ever renders without a request context (a future
    // prerender, a build-time probe). Our own domain is the least-wrong guess
    // there, because the hosted deployment is the one install that has no
    // owner to configure APP_URL for it.
    return "https://dispatchseo.com";
  }
}

// Only the public surface belongs here - the dashboard is password-gated
// and should never be crawled.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await baseUrl();
  return [
    // The landing page - the commercial entry point, and the one page a
    // sitemap that omits it looks broken for. Bare origin, no trailing slash,
    // to match byte-for-byte what page.tsx emits as its canonical.
    { url: base, changeFrequency: "weekly", priority: 1 },
    // The agent hubs (/claude-code, /codex, /cursor) are noindex since
    // 2026-11-08 and stay out of here; so do the free tools marked noindex.
    // Plain-language "what this is" page. Public by design (it is also the
    // Google OAuth consent home page), and the one page that states the
    // product and its pricing as prose a crawler can quote.
    { url: `${base}/about`, changeFrequency: "monthly" },
    { url: `${base}/blog`, changeFrequency: "daily" },
    // Posts hidden from Google (PostMeta.googleNoindex) stay out: listing a
    // URL here while telling Googlebot not to index it is a mixed signal.
    ...getAllPosts()
      .filter((post) => !post.googleNoindex)
      .map((post) => ({
        url: `${base}/blog/${post.slug}`,
        lastModified: new Date(post.date),
      })),
    { url: `${base}/docs` },
    ...getDocSlugs().map((slug) => ({ url: `${base}/docs/${slug}` })),
    { url: `${base}/free-tools`, changeFrequency: "weekly" },
    ...getAllTools()
      .filter((tool) => !tool.noindex)
      .map((tool) => ({ url: `${base}/free-tools/${tool.slug}` })),
    // Public release notes - linkable, and worth crawling as proof the
    // product is alive. lastModified is the newest release's own date.
    { url: `${base}/changelog`, lastModified: LATEST ? new Date(LATEST.date) : undefined },
  ];
}

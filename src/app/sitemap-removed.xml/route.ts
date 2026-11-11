// TEMPORARY - delete this route (and its line in src/proxy.ts) once Search
// Console no longer reports any of these URLs as indexed.
//
// The blog prunes of 2026-10-21 and 2026-11-08 removed these posts, and the
// site answers 410 (or a redirect) for every one of them. But Google only
// drops a page after it re-crawls it, and a demoted site is crawled rarely:
// on 2026-11-11 these sixteen were still "Submitted and indexed" months after
// their last crawl, and they were 84% of everything Google showed the site
// for. So Google was still judging the site that had been deleted.
//
// A sitemap that lists removed URLs with the date they changed is the method
// Google's John Mueller gave for getting them re-crawled and dropped sooner.
// It is submitted in Search Console next to the real sitemap and reports
// errors there by design - every URL in it is gone on purpose.
//
// Only ever served on dispatchseo.com: on a self-host these are not the
// owner's URLs, so the route answers 404 there.

const ORIGIN = "https://dispatchseo.com";

const REMOVED: ReadonlyArray<readonly [slug: string, changed: string]> = [
  ["claude-code-vs-cursor", "2026-10-21"],
  ["claude-code-memory", "2026-10-21"],
  ["claude-code-subagents", "2026-10-21"],
  ["claude-code-mcp-server", "2026-10-21"],
  ["claude-code-github-actions", "2026-10-21"],
  ["mcp-server-examples", "2026-10-21"],
  ["how-to-build-an-mcp-server", "2026-10-21"],
  ["self-hosted-ai", "2026-10-21"],
  ["google-search-console-mcp", "2026-11-08"],
  ["ahrefs-alternative", "2026-11-08"],
  ["semrush-alternative-free", "2026-11-08"],
  ["best-seo-automation-tools", "2026-11-08"],
  ["majestic-alternative", "2026-11-08"],
  ["mangools-alternative", "2026-11-08"],
  ["moz-alternative", "2026-11-08"],
  // A redirect, not a 410: folded into generative-engine-optimization-tools.
  ["ai-visibility-tracking-tool", "2026-11-08"],
];

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host !== "dispatchseo.com" && host !== "www.dispatchseo.com") {
    return new Response("Not found", { status: 404 });
  }
  const urls = REMOVED.map(
    ([slug, changed]) => `  <url><loc>${ORIGIN}/blog/${slug}</loc><lastmod>${changed}</lastmod></url>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

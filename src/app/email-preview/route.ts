import { firstArticleHtml, pauseWarningHtml } from "@/lib/email/templates";

// Dev-only design review of the customer emails, with fixtures: renders the
// exact HTML the senders hand Resend, and sends nothing. Same contract as
// /onboarding/stage-preview: it 404s in a production build, and the proxy
// only opens the path outside production (src/proxy.ts).
//
//   /email-preview                        the list
//   /email-preview?email=first-article    "Your first article is live"
//   /email-preview?email=first-article-no-cover
//   /email-preview?email=pause            the free plan's pause warning
//
// Images load from this dev server (the request's own origin), so the
// preview shows the art from public/email/ as it is on disk right now.

export const dynamic = "force-dynamic";

const FIXTURE = {
  domain: "northwindcoffee.com",
  title: "How to dial in espresso at home without a scale",
  url: "https://northwindcoffee.com/blog/dial-in-espresso-without-a-scale",
};

function render(name: string, base: string): string | null {
  switch (name) {
    case "first-article":
    case "first-article-no-cover":
      return firstArticleHtml({
        base,
        domain: FIXTURE.domain,
        title: FIXTURE.title,
        url: FIXTURE.url,
        dashboard: `${base}/dashboard`,
        // A cover from the landing's own blog stands in for
        // /api/cover/<id> (16:9 either way; webp here, PNG/JPEG in a real email).
        coverUrl: name === "first-article" ? `${base}/blog/covers/content-marketing-for-saas.webp` : null,
      });
    case "pause":
      return pauseWarningHtml({ base, domain: FIXTURE.domain, pauseOn: "December 3", loginUrl: `${base}/login` });
    default:
      return null;
  }
}

const NAMES = ["first-article", "first-article-no-cover", "pause"];

export function GET(req: Request): Response {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const name = url.searchParams.get("email");
  if (!name) {
    const links = NAMES.map((n) => `<li><a href="?email=${n}">${n}</a></li>`).join("");
    return new Response(`<!doctype html><title>Email previews</title><ul style="font:16px system-ui;line-height:2">${links}</ul>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const html = render(name, url.origin);
  if (!html) return new Response("No such email", { status: 404 });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

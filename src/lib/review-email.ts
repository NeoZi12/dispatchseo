import { sitePath } from "@/lib/site-root";
import { db } from "./db";
import type { Project } from "./projects";

// "Your article is ready for review" (owner, 2026-11-10): one email per
// article, to a site on review before publishing (article-review.ts), the
// moment the finish parks it as status "review". The button opens the
// article in the dashboard (/review/<id> switches to its site first), where
// the owner reads it, edits it, and presses Publish.
//
// Unlike the first-article-is-live email this goes out for EVERY article:
// with review on, nothing reaches the site until the owner acts, so an
// article nobody hears about is an article that never goes out.
//
// Same sender and same rules as first-article-email.ts: CUSTOMER_EMAIL_FROM
// through Resend, best-effort end to end. Nothing here throws - the article
// is safely parked whatever happens to the email, and the dashboard shows it.

const RESEND_URL = "https://api.resend.com/emails";

export async function notifyArticleReady(
  project: Pick<Project, "id" | "slug" | "domain" | "owner_user_id"> & { site_path?: string | null },
  article: { draftId: string; title: string | null },
): Promise<"sent" | "skipped"> {
  try {
    const from = process.env.CUSTOMER_EMAIL_FROM;
    const apiKey = process.env.RESEND_API_KEY;
    if (!from || !apiKey || !project.owner_user_id) return "skipped";

    const { data: u } = await db().auth.admin.getUserById(project.owner_user_id);
    const to = u?.user?.email;
    if (!to) return "skipped";

    // The site's first article reads as such: nothing has gone out yet, and
    // "your first article" is what the owner has been waiting on since setup.
    const { count } = await db()
      .from("article_drafts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .in("status", ["published", "removing", "removed"]);
    const first = (count ?? 0) === 0;

    const { backendBaseUrl } = await import("./pipeline-pack");
    const base = await backendBaseUrl();
    const link = `${base}/review/${encodeURIComponent(article.draftId)}`;
    const settings = `${base}/settings`;
    const domain = project.domain ? `${project.domain}${sitePath(project)}` : project.slug;
    const title = article.title?.trim() || "Your new article";
    const subject = first ? `Your first article for ${domain} is ready for review` : `A new article for ${domain} is ready for review`;
    const lead = first
      ? `Your first article for ${domain} is ready. Nothing goes on your site until you publish it.`
      : `A new article for ${domain} is ready. Nothing goes on your site until you publish it.`;

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        text:
          `Hi,\n\n` +
          `${lead}\n\n` +
          `${title}\n` +
          `Review and publish: ${link}\n\n` +
          `Read it, change anything you like, and press Publish when you're happy with it.\n\n` +
          `If you'd rather have articles go out on their own, switch to automatic publishing in Settings: ${settings}\n\n` +
          `DispatchSEO`,
        html: readyHtml({ base, first, domain, title, link, settings }),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[review-email] ${project.slug}: Resend answered ${res.status}`);
      return "skipped";
    }
    return "sent";
  } catch (e) {
    console.warn(`[review-email] ${project.slug}: ${e instanceof Error ? e.message : String(e)}`);
    return "skipped";
  }
}

// ---- the HTML ---------------------------------------------------------------
// Same look as the other owner emails (src/lib/email/templates.ts on main
// since aeee0f77): the dispatcher's desk as a looping GIF, a white card, the
// article as a card, one big button, a three-step strip, the dispatcher's own
// line. Built in here rather than imported because this branch predates that
// module; once both are on main, this can move onto its shared pieces.
// EMAIL HTML IS NOT WEB HTML: tables, inline styles, 600px, no SVG. The art
// (public/email/*) is served publicly through src/proxy.ts.
// The button is GREEN here on purpose (owner, 2026-11-10): it releases the
// article, so it reads as "go", not as the brand purple.

const EMAIL_ART = { live: "/email/desk-live-v1.gif", dispatcher: "/email/dispatcher-v1.png", mark: "/dispatch-mark.png" } as const;
const FONT = `'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const C = {
  page: "#f2f0f7",
  card: "#ffffff",
  line: "#e7e3f1",
  ink: "#17141f",
  body: "#4a4658",
  mute: "#7b7690",
  violet: "#7c3aed",
  violetText: "#6d28d9",
  green: "#059669",
  greenSoft: "#e7f8f0",
  greenText: "#047857",
  clay: "#d97757",
};
const DARK_CSS =
  `:root{color-scheme:light dark;supported-color-schemes:light dark}` +
  `@media (prefers-color-scheme:dark){` +
  `.e-page{background:#0f0d15!important}` +
  `.e-card{background:#211d2e!important;border-color:#332e45!important}` +
  `.e-sub{background:#2a2539!important;border-color:#3b3550!important}` +
  `.e-ink{color:#f4f2fa!important}` +
  `.e-body{color:#c9c4d8!important}` +
  `.e-mute{color:#8f89a3!important}` +
  `.e-link{color:#b79cff!important}` +
  `.e-rule{border-color:#332e45!important}` +
  `.e-track{background:#45405a!important}` +
  `.e-pill{background:#123a2b!important;color:#6ee7b7!important}` +
  `}` +
  `[data-ogsc] .e-ink{color:#f4f2fa!important}` +
  `[data-ogsc] .e-body{color:#c9c4d8!important}` +
  `[data-ogsc] .e-mute{color:#8f89a3!important}` +
  `[data-ogsc] .e-link{color:#b79cff!important}` +
  `[data-ogsb] .e-page{background:#0f0d15!important}` +
  `[data-ogsb] .e-card{background:#211d2e!important}` +
  `[data-ogsb] .e-sub{background:#2a2539!important}` +
  `@media (max-width:480px){.e-pad{padding-left:20px!important;padding-right:20px!important}.e-h1{font-size:25px!important}.e-step{display:block!important;width:100%!important;padding:0 0 14px!important}.e-track-cell{display:none!important}}`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function asset(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function pixel(color: string, size = 10): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle"><tr>` +
    `<td width="${size}" height="${size}" bgcolor="${color}" style="width:${size}px;height:${size}px;background:${color};font-size:0;line-height:0">&nbsp;</td>` +
    `</tr></table>`
  );
}

function readyHtml(v: { base: string; first: boolean; domain: string; title: string; link: string; settings: string }): string {
  const heading = v.first ? "Your first article is ready" : "A new article is ready";
  const step = (color: string, head: string, sub: string, last = false) =>
    `<td class="e-step" valign="top" width="33%" style="width:33%;padding:0 10px 0 0;font-family:${FONT}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="10" valign="middle" style="width:10px">${pixel(color)}</td>` +
    (last
      ? `<td>&nbsp;</td>`
      : `<td class="e-track-cell" valign="middle" style="padding:0 0 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="e-track" height="2" bgcolor="${C.line}" style="height:2px;background:${C.line};font-size:0;line-height:0">&nbsp;</td></tr></table></td>`) +
    `</tr></table>` +
    `<p class="e-ink" style="margin:10px 0 2px;font-size:15px;font-weight:700;line-height:1.35;color:${C.ink}">${head}</p>` +
    `<p class="e-mute" style="margin:0;font-size:13.5px;line-height:1.45;color:${C.mute}">${sub}</p></td>`;

  return (
    `<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<title>${esc(heading)}</title><style>${DARK_CSS}</style></head>` +
    `<body class="e-page" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(v.title)} is waiting for you. Nothing goes on ${esc(v.domain)} until you publish it.&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>` +
    `<table role="presentation" class="e-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px 40px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">` +
    // brand line
    `<tr><td style="padding:0 8px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding-right:10px"><img src="${esc(asset(v.base, EMAIL_ART.mark))}" width="15" height="24" alt="" style="display:block;width:15px;height:24px;border:0"></td>` +
    `<td valign="middle" class="e-ink" style="font-family:${FONT};font-size:16px;font-weight:800;letter-spacing:-0.01em;color:${C.ink}">DispatchSEO</td>` +
    `</tr></table></td></tr>` +
    // the card
    `<tr><td class="e-card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:20px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td class="e-pad" style="padding:20px 40px 0" align="center">` +
    `<img src="${esc(asset(v.base, EMAIL_ART.live))}" width="520" height="208" alt="The DispatchSEO dispatcher waving from his desk" style="display:block;width:100%;max-width:520px;height:auto;border:0;image-rendering:pixelated;font-family:${FONT};font-size:14px;color:${C.mute}">` +
    `</td></tr>` +
    `<tr><td class="e-pad" style="padding:30px 40px 0;font-family:${FONT}">` +
    `<h1 class="e-ink e-h1" style="margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${C.ink}">${heading}</h1>` +
    `<p class="e-body" style="margin:10px 0 0;font-size:17px;line-height:1.55;color:${C.body}">for <strong class="e-ink" style="color:${C.ink}">${esc(v.domain)}</strong>. Nothing goes on your site until you publish it.</p>` +
    `</td></tr>` +
    // the article, waiting
    `<tr><td class="e-pad" style="padding:24px 40px 0">` +
    `<table role="presentation" class="e-sub" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:14px;background:#faf9fd">` +
    `<tr><td style="padding:18px 20px 20px;font-family:${FONT}">` +
    `<span class="e-pill" style="display:inline-block;margin:0 0 10px;padding:3px 10px;border-radius:999px;background:${C.greenSoft};color:${C.greenText};font-size:12.5px;font-weight:700;line-height:1.4">Waiting for your review</span>` +
    `<a class="e-ink" href="${esc(v.link)}" target="_blank" style="display:block;font-size:20px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${C.ink};text-decoration:none">${esc(v.title)}</a>` +
    `</td></tr></table>` +
    `</td></tr>` +
    // the green button: the cell carries the colour for Outlook
    `<tr><td class="e-pad" style="padding:20px 40px 0">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" bgcolor="${C.green}" style="border-radius:12px;background-color:${C.green};background-image:linear-gradient(135deg,#047857 0%,#10b981 100%)">` +
    `<a href="${esc(v.link)}" target="_blank" style="display:block;padding:16px 24px;font-family:${FONT};font-size:17px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px">Review and publish</a>` +
    `</td></tr></table></td></tr>` +
    // read -> change -> publish
    `<tr><td class="e-pad" style="padding:32px 40px 24px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    step(C.violet, "Read it", "In your dashboard") +
    step(C.clay, "Change anything", "Edit it as you like") +
    step(C.green, "Press Publish", "When you&#39;re happy with it", true) +
    `</tr></table></td></tr>` +
    // the dispatcher's line
    `<tr><td class="e-pad" style="padding:8px 40px 36px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="e-rule" style="border-top:1px solid ${C.line};padding-top:24px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="top" width="48" style="width:48px;padding-right:16px"><img src="${esc(asset(v.base, EMAIL_ART.dispatcher))}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border:0;image-rendering:pixelated"></td>` +
    `<td valign="top" style="font-family:${FONT}">` +
    `<p class="e-ink" style="margin:0 0 6px;font-size:16px;line-height:1.5;color:${C.ink}">&ldquo;Written and on your desk. It goes out the moment you say so.&rdquo;</p>` +
    `<p class="e-mute" style="margin:0;font-size:14px;line-height:1.5;color:${C.mute}">Your dispatcher &nbsp;&middot;&nbsp; <a class="e-link" href="${esc(v.link)}" target="_blank" style="color:${C.violetText};font-weight:600;text-decoration:none">Open the article</a></p>` +
    `</td></tr></table>` +
    `</td></tr></table></td></tr>` +
    `</table></td></tr>` +
    // the note under the card
    `<tr><td class="e-mute" align="center" style="padding:20px 24px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.mute}">If you&#39;d rather have articles go out on their own, switch to automatic publishing in <a class="e-link" href="${esc(v.settings)}" target="_blank" style="color:${C.mute};text-decoration:underline">Settings</a>.</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

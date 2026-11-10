// The HTML of the emails a site owner gets (first-article-email.ts,
// free-gate.ts's pause warning). Pure string builders, no database and no
// secrets, so the dev preview (/email-preview) renders exactly what ships.
//
// EMAIL HTML IS NOT WEB HTML. Tables for layout, every style inline, ~600px
// wide, no SVG (Gmail strips it), no external CSS, no script. The dispatcher
// arrives as PNG/GIF files from public/email/, drawn from the site's own pixel
// grids by scripts/render-email-art.mjs; every picture has alt text and the
// email reads complete with images blocked. The <style> block only adds dark
// mode for the clients that honour it (Apple Mail, Outlook.com); everyone
// else gets the inline light baseline, and the art sits on its own dark panel
// with transparent corners, so it looks the same on either background.
//
// The art's file names carry a version (Gmail's image proxy caches forever):
// re-render with a new ART_VERSION in the script, then update EMAIL_ART.

export const EMAIL_ART = {
  live: "/email/desk-live-v1.gif",
  asleep: "/email/desk-asleep-v1.gif",
  dispatcher: "/email/dispatcher-v1.png",
  mark: "/dispatch-mark.png",
} as const;

const FONT = `'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;

// Light baseline (inline) and the dark overrides (the <style> block).
const C = {
  page: "#f2f0f7",
  card: "#ffffff",
  line: "#e7e3f1",
  ink: "#17141f",
  body: "#4a4658",
  mute: "#7b7690",
  violet: "#7c3aed",
  violetText: "#6d28d9",
  green: "#22c55e",
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
  `}` +
  // Outlook.com's dark mode rewrites colours and tags the body with these.
  `[data-ogsc] .e-ink{color:#f4f2fa!important}` +
  `[data-ogsc] .e-body{color:#c9c4d8!important}` +
  `[data-ogsc] .e-mute{color:#8f89a3!important}` +
  `[data-ogsc] .e-link{color:#b79cff!important}` +
  `[data-ogsb] .e-page{background:#0f0d15!important}` +
  `[data-ogsb] .e-card{background:#211d2e!important}` +
  `[data-ogsb] .e-sub{background:#2a2539!important}` +
  // Narrow screens: tighter card padding, smaller headline.
  `@media (max-width:480px){.e-pad{padding-left:20px!important;padding-right:20px!important}.e-h1{font-size:25px!important}.e-step{display:block!important;width:100%!important;padding:0 0 14px!important}.e-track-cell{display:none!important}}`;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** An absolute URL for an asset path, for the image src attributes. */
function asset(base: string, path: string): string {
  return path.startsWith("http") ? path : `${base.replace(/\/+$/, "")}${path}`;
}

// ---- pieces -----------------------------------------------------------------

/** The bulletproof button: the cell carries the colour (Outlook keeps a
 *  bgcolor when it drops the gradient and the padding on the link), the link
 *  carries the padding everywhere else, so the whole button is clickable. */
function button(href: string, label: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" bgcolor="${C.violet}" style="border-radius:12px;background-color:${C.violet};background-image:linear-gradient(135deg,#6d28d9 0%,#9333ea 100%)">` +
    `<a href="${esc(href)}" target="_blank" style="display:block;padding:16px 24px;font-family:${FONT};font-size:17px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px">${esc(label)}</a>` +
    `</td></tr></table>`
  );
}

/** A square pixel, the emails' one recurring mark (bullets, timeline). Built
 *  from a table cell so Outlook draws it too. */
function pixel(color: string, size = 10): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle"><tr>` +
    `<td width="${size}" height="${size}" bgcolor="${color}" style="width:${size}px;height:${size}px;background:${color};font-size:0;line-height:0">&nbsp;</td>` +
    `</tr></table>`
  );
}

/** The dispatcher's own line at the bottom, under a hairline. */
function signoff(base: string, quote: string, link: { href: string; label: string }): string {
  return (
    `<tr><td class="e-pad" style="padding:8px 40px 36px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="e-rule" style="border-top:1px solid ${C.line};padding-top:24px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="top" width="48" style="width:48px;padding-right:16px">` +
    `<img src="${esc(asset(base, EMAIL_ART.dispatcher))}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border:0;image-rendering:pixelated">` +
    `</td>` +
    `<td valign="top" style="font-family:${FONT}">` +
    `<p class="e-ink" style="margin:0 0 6px;font-size:16px;line-height:1.5;color:${C.ink}">&ldquo;${esc(quote)}&rdquo;</p>` +
    `<p class="e-mute" style="margin:0;font-size:14px;line-height:1.5;color:${C.mute}">Your dispatcher &nbsp;&middot;&nbsp; <a class="e-link" href="${esc(link.href)}" target="_blank" style="color:${C.violetText};font-weight:600;text-decoration:none">${esc(link.label)}</a></p>` +
    `</td></tr></table>` +
    `</td></tr></table>` +
    `</td></tr>`
  );
}

/** The page around every email: preheader, brand line, the card, the note. */
function shell(v: { base: string; title: string; preheader: string; hero: { src: string; alt: string }; rows: string; note: string }): string {
  const mark = asset(v.base, EMAIL_ART.mark);
  return (
    `<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<title>${esc(v.title)}</title><style>${DARK_CSS}</style></head>` +
    `<body class="e-page" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">` +
    // The inbox preview line, hidden in the email itself.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(v.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>` +
    `<table role="presentation" class="e-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px 40px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">` +
    // brand line
    `<tr><td style="padding:0 8px 16px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding-right:10px"><img src="${esc(mark)}" width="15" height="24" alt="" style="display:block;width:15px;height:24px;border:0"></td>` +
    `<td valign="middle" class="e-ink" style="font-family:${FONT};font-size:16px;font-weight:800;letter-spacing:-0.01em;color:${C.ink}">DispatchSEO</td>` +
    `</tr></table></td></tr>` +
    // the card
    `<tr><td class="e-card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:20px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td class="e-pad" style="padding:20px 40px 0" align="center">` +
    `<img src="${esc(asset(v.base, v.hero.src))}" width="520" height="208" alt="${esc(v.hero.alt)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;image-rendering:pixelated;font-family:${FONT};font-size:14px;color:${C.mute}">` +
    `</td></tr>` +
    v.rows +
    `</table></td></tr>` +
    // the note under the card
    `<tr><td class="e-mute" align="center" style="padding:20px 24px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.mute}">${v.note}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

// ---- "Your first article is live" -------------------------------------------

export type FirstArticleEmail = {
  /** Where the email's images load from: the app's public URL. */
  base: string;
  /** The site as the owner knows it, folder included for folder sites. */
  domain: string;
  title: string;
  url: string;
  dashboard: string;
  /** The article's cover, absolute; null shows the article card without it. */
  coverUrl: string | null;
};

export function firstArticleHtml(v: FirstArticleEmail): string {
  const shown = v.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cover = v.coverUrl
    ? `<tr><td style="padding:0;font-size:0;line-height:0">` +
      `<a href="${esc(v.url)}" target="_blank" style="text-decoration:none"><img src="${esc(v.coverUrl)}" width="518" alt="${esc(v.title)}" style="display:block;width:100%;max-width:518px;height:auto;border:0;border-radius:13px 13px 0 0;font-family:${FONT};font-size:14px;color:${C.mute}"></a>` +
      `</td></tr>`
    : "";

  // Today -> Google -> visits: the "why no traffic yet" answer, shown as the
  // sequence it is rather than a paragraph.
  // Each step's pixel trails a line to the next one; stacked on a phone the
  // lines drop away and the pixels read as a list.
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

  const rows =
    `<tr><td class="e-pad" style="padding:30px 40px 0;font-family:${FONT}">` +
    `<h1 class="e-ink e-h1" style="margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${C.ink}">Your first article is live</h1>` +
    `<p class="e-body" style="margin:8px 0 0;font-size:17px;line-height:1.5;color:${C.body}">on <strong class="e-ink" style="color:${C.ink}">${esc(v.domain)}</strong></p>` +
    `</td></tr>` +
    // the article, as a card you can click
    `<tr><td class="e-pad" style="padding:24px 40px 0">` +
    `<table role="presentation" class="e-sub" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:14px;background:#faf9fd">` +
    cover +
    `<tr><td style="padding:18px 20px 20px;font-family:${FONT}">` +
    `<a class="e-ink" href="${esc(v.url)}" target="_blank" style="display:block;font-size:20px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${C.ink};text-decoration:none">${esc(v.title)}</a>` +
    `<p class="e-mute" style="margin:8px 0 0;font-size:13.5px;line-height:1.4;color:${C.mute};word-break:break-all">${esc(shown)}</p>` +
    `</td></tr></table>` +
    `</td></tr>` +
    `<tr><td class="e-pad" style="padding:20px 40px 0">${button(v.url, "Read it live")}</td></tr>` +
    // what happens next
    `<tr><td class="e-pad" style="padding:32px 40px 24px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr>` +
    step(C.green, "Live today", "On your site now") +
    step(C.violet, "Google finds it", "In a few days to a few weeks") +
    step(C.clay, "First visits", "Once Google lists it", true) +
    `</tr></table>` +
    `</td></tr>` +
    signoff(v.base, "That's the first one filed. I'll send the next on your plan's schedule.", { href: v.dashboard, label: "Open your dashboard" });

  return shell({
    base: v.base,
    title: `Your first article is live on ${v.domain}`,
    preheader: `${v.title} is on ${v.domain} now.`,
    hero: { src: EMAIL_ART.live, alt: "The DispatchSEO dispatcher waving from his desk" },
    rows,
    note: `You get this email once, for your first article.`,
  });
}

// ---- "New articles pause on <date>" (free plan, 55 days unseen) -------------

export type PauseWarningEmail = {
  base: string;
  domain: string;
  /** "December 3" */
  pauseOn: string;
  loginUrl: string;
};

export function pauseWarningHtml(v: PauseWarningEmail): string {
  const fact = (color: string, text: string) =>
    `<tr><td valign="top" width="22" style="width:22px;padding:6px 0 0">${pixel(color)}</td>` +
    `<td class="e-body" style="padding:0 0 12px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.body}">${text}</td></tr>`;

  const rows =
    `<tr><td class="e-pad" style="padding:30px 40px 0;font-family:${FONT}">` +
    `<h1 class="e-ink e-h1" style="margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${C.ink}">New articles pause on ${esc(v.pauseOn)}</h1>` +
    `<p class="e-body" style="margin:12px 0 0;font-size:17px;line-height:1.55;color:${C.body}">Nobody has opened the dashboard for <strong class="e-ink" style="color:${C.ink}">${esc(v.domain)}</strong> in almost two months. Sign in before then to keep them coming.</p>` +
    `</td></tr>` +
    `<tr><td class="e-pad" style="padding:24px 40px 0">${button(v.loginUrl, "Sign in to keep them coming")}</td></tr>` +
    `<tr><td class="e-pad" style="padding:28px 40px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    fact(C.green, "The articles already on your site stay up either way.") +
    fact(C.violet, "If they do pause, signing in starts them again.") +
    `</table></td></tr>` +
    signoff(v.base, "One sign-in is all it takes, and I keep writing.", { href: v.loginUrl, label: "Sign in" });

  return shell({
    base: v.base,
    title: `New articles for ${v.domain} pause on ${v.pauseOn}`,
    preheader: `Sign in before ${v.pauseOn} to keep new articles coming for ${v.domain}.`,
    hero: { src: EMAIL_ART.asleep, alt: "The DispatchSEO dispatcher dozing at his desk" },
    rows,
    note: `Sent because ${esc(v.domain)} is on the free plan and its dashboard has been quiet.`,
  });
}

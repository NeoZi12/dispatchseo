import { isPrivateHost } from "./url-guard";

// What a site is built on, decided from ONE homepage fetch (plus one optional
// /wp-json/ probe). Two callers, one definition:
//
//   1. The pre-checkout qualifier (/qualify) - the reason this exists. Two
//      WordPress owners paid, hit "Connect GitHub" (impossible without a repo)
//      and left inside five minutes; a third picked a repo that wasn't his
//      site's. Platform is knowable before the card is charged, so it is asked
//      before the card is charged.
//   2. The WordPress connect flow - the same probe answers "is the REST API
//      actually reachable", which is the first thing that has to be true
//      before an application password is worth asking for.
//
// Signals and their precedence come from a 2026-08-18 research pass over
// vendor docs; each one carries its source in a comment. The rule that matters
// most: a SINGLE weak signal never decides. A stray "/wp-content/" string in a
// static export, or a stale generator tag copied from a starter kit, is common
// enough that one hit is a hint, not a verdict.

export type Platform =
  | "wordpress"
  | "wix"
  | "squarespace"
  | "shopify"
  | "webflow"
  | "framer"
  | "ghost"
  | "hubspot"
  | "weebly"
  | "godaddy"
  | "duda"
  | "jimdo"
  | "tilda"
  | "strikingly"
  | "googlesites"
  | "blogger"
  | "substack"
  | "medium"
  | "bigcommerce"
  | "hostinger"
  | "nextjs"
  | "static"
  | "unknown"
  | "unreachable";

export type PlatformResult = {
  platform: Platform;
  /** How sure we are. "high" = 2+ independent signals or a vendor-only header. */
  confidence: "high" | "medium" | "low";
  /** The final URL we actually read, after redirects. */
  url: string | null;
  /** Human-readable signal names, for the dashboard and for support. */
  signals: string[];
  /** For a site built from code: the framework or generator we recognised
   *  ("Astro", "Hugo", "Laravel"...), for the "we can work with this" line.
   *  Null when it is code we could not name - still a fit. */
  framework?: string | null;
  /** WordPress specifics - populated only when platform is wordpress, or when
   *  a headless front end turned out to have a live WP REST API behind it. */
  wordpress?: {
    version: string | null;
    elementor: boolean;
    /** yoast | rankmath | seopress | null (aiosee is not namespace-detectable) */
    seoPlugin: "yoast" | "rankmath" | "seopress" | null;
    /** /wp-json/ answered with a wp/v2 namespace - the publisher needs this. */
    restReachable: boolean;
    /** Set when the rendered site is NOT WordPress but /wp-json/ is live -
     *  a decoupled front end. Publishing still works; the front end may not
     *  rebuild on its own, which the owner has to be told. */
    headless: boolean;
  };
};

const UA =
  "Mozilla/5.0 (compatible; DispatchSEO/1.0; +https://dispatchseo.com/docs/site-check)";

const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8000;
/** Only the head of the document is needed; a 20 MB page must not be read whole. */
const MAX_BYTES = 400_000;

/** Fetch that follows redirects BY HAND, re-running the private-host guard on
 *  every hop. `redirect: "follow"` would hand the SSRF primitive straight back
 *  to whoever controls the typed domain's first response - the same reasoning
 *  as domainAnswers() in actions.ts, which is why that one refuses to follow at
 *  all. This one has to read the body, so it follows, but never blindly. */
async function guardedFetch(
  startUrl: string,
): Promise<{ res: Response; url: string } | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    if (isPrivateHost(host)) return null;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { res, url };
      try {
        url = new URL(next, url).toString();
      } catch {
        return { res, url };
      }
      continue;
    }
    return { res, url };
  }
  return null;
}

/** Read at most MAX_BYTES of the body as text, so a huge page can't wedge us. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return await res.text().catch(() => "");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= MAX_BYTES) break;
      }
    }
  } catch {
    // Partial body is still worth fingerprinting.
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    merged.set(c.subarray(0, Math.min(c.length, total - at)), at);
    at += c.length;
    if (at >= total) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function metaGenerator(html: string): string | null {
  // Attribute order varies; match name= before content= and the reverse.
  const m =
    /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']*)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']generator["']/i.exec(html);
  return m ? m[1] : null;
}

/** Probe /wp-json/ - the near-definitive WordPress signal, and the one that
 *  tells us whether the REST API a publisher needs is actually reachable.
 *  Also catches decoupled WordPress, where the rendered site looks like
 *  Next.js but a live WP install sits behind it. */
async function probeWpJson(origin: string): Promise<{
  reachable: boolean;
  seoPlugin: "yoast" | "rankmath" | "seopress" | null;
}> {
  const got = await guardedFetch(`${origin.replace(/\/$/, "")}/wp-json/`);
  if (!got || !got.res.ok) return { reachable: false, seoPlugin: null };
  // Content-type first: a themed 404 page can easily contain the string
  // "wp/v2" and would otherwise read as a live REST API.
  if (!/json/i.test(got.res.headers.get("content-type") ?? "")) {
    return { reachable: false, seoPlugin: null };
  }
  const text = await readCapped(got.res);
  // Do NOT JSON.parse the whole document. WordPress's root index inlines the
  // full schema of every registered route, which on a plugin-heavy site runs
  // to hundreds of KB - past the read cap, so parsing a truncated body threw
  // and a perfectly healthy site (grimoakademija.lt, 2026-08-18) came back as
  // "REST not reachable". `namespaces` sits in the first few hundred bytes, so
  // lift just that array out and parse it alone.
  let namespaces: string[] = [];
  const arr = /"namespaces"\s*:\s*\[([^\]]*)\]/.exec(text);
  if (arr) {
    try {
      namespaces = (JSON.parse(`[${arr[1]}]`) as unknown[]).filter((n): n is string => typeof n === "string");
    } catch {
      namespaces = [];
    }
  }
  if (!namespaces.length) {
    // Truncated before the array closed, or an unusual shape. Fall back to
    // substring evidence rather than declaring a live API dead.
    for (const ns of ["wp/v2", "yoast/v1", "rankmath/v1", "seopress/v1"]) {
      if (text.includes(`"${ns}"`)) namespaces.push(ns);
    }
  }
  // Each SEO plugin registers its own namespace, visible in the root index.
  // AIOSEO registers no distinctive namespace - it hooks fields onto wp/v2
  // instead - so it is deliberately not detected here rather than guessed.
  const seoPlugin = namespaces.includes("yoast/v1")
    ? ("yoast" as const)
    : namespaces.includes("rankmath/v1")
      ? ("rankmath" as const)
      : namespaces.includes("seopress/v1")
        ? ("seopress" as const)
        : null;
  return { reachable: namespaces.includes("wp/v2"), seoPlugin };
}

// --- Hosted builders: no repo, so nothing for us to open a pull request
// --- against. A generator tag or a vendor-only header decides on its own (a
// --- builder sets those; a code-built site has no reason to). A vendor ASSET
// --- host only counts when nothing says the site is code: a headless Shopify
// --- storefront loads every product image from cdn.shopify.com, and a site
// --- migrated off Wix often still hotlinks its old wixstatic images.
type Builder = { platform: Platform; gen?: RegExp; header?: string; asset?: RegExp };
const BUILDERS: Builder[] = [
  { platform: "hubspot", gen: /^HubSpot/i, header: "x-hs-hub-id" },
  // Weebly and Square Online are the same editor, same CDN.
  { platform: "weebly", gen: /weebly/i, asset: /editmysite\.com/i },
  { platform: "godaddy", gen: /go ?daddy|starfield technologies/i, asset: /img1\.wsimg\.com\/isteam\//i },
  { platform: "duda", asset: /\bl?irp\.cdn-website\.com/i },
  { platform: "jimdo", gen: /jimdo/i, asset: /assets\.jimstatic\.com|\.jimcdn\.com/i },
  { platform: "tilda", gen: /^Tilda/i, asset: /static\.tildacdn\.com/i },
  { platform: "strikingly", asset: /strikinglycdn\.com/i },
  { platform: "googlesites", asset: /gstatic\.com\/atari\//i },
  { platform: "blogger", gen: /^blogger$/i },
  { platform: "substack", asset: /substackcdn\.com\/bundle\//i },
  { platform: "medium", asset: /cdn-client\.medium\.com/i },
  { platform: "bigcommerce", gen: /bigcommerce/i, asset: /cdn\d*\.bigcommerce\.com/i },
  { platform: "hostinger", gen: /hostinger|zyro/i, asset: /zyrosite\.com/i },
];

// --- Built from code: what we can name. Every one of these is a FIT - the
// --- publisher mirrors whatever markdown the repo already keeps, and a repo
// --- with none gets the hosted blog - so a match only words the verdict
// --- ("Astro on Netlify"); it never decides it. Order matters only where two
// --- can co-occur: Lovable apps are Vite apps, so Lovable is checked first.
type Framework = { name: string; gen?: RegExp; html?: RegExp; cookie?: RegExp };
const FRAMEWORKS: Framework[] = [
  { name: "Next.js", html: /id=["']__NEXT_DATA__["']|\/_next\/static\// },
  { name: "Astro", gen: /^Astro/i, html: /\/_astro\/|<astro-island/i },
  { name: "Nuxt", html: /\/_nuxt\/|id=["']__nuxt["']|window\.__NUXT__/i },
  { name: "SvelteKit", html: /\/_app\/immutable\/|data-sveltekit-/i },
  { name: "Remix", html: /__remixContext|__reactRouterContext/ },
  { name: "Gatsby", gen: /^Gatsby/i, html: /id=["']___gatsby["']/ },
  { name: "Docusaurus", gen: /^Docusaurus/i },
  { name: "VitePress", gen: /^VitePress/i },
  { name: "VuePress", gen: /^VuePress/i },
  { name: "Hugo", gen: /^Hugo/i },
  { name: "Jekyll", gen: /^Jekyll/i },
  { name: "Eleventy", gen: /^Eleventy/i },
  { name: "Hexo", gen: /^Hexo/i },
  { name: "MkDocs", gen: /^mkdocs/i },
  { name: "Pelican", gen: /^Pelican/i },
  { name: "Angular", html: /\sng-version=["']/ },
  { name: "Qwik", html: /\sq:container=/ },
  { name: "Lovable", html: /cdn\.gpteng\.co|<meta[^>]+content=["']Lovable["']/i },
  { name: "Vite", html: /<script[^>]+type=["']module["'][^>]*src=["'][^"']*\/assets\/index-[\w-]+\.js/i },
  { name: "Laravel", cookie: /laravel_session=/i },
  { name: "Django", cookie: /csrftoken=/, html: /name=["']csrfmiddlewaretoken["']/ },
  { name: "Ruby on Rails", html: /name=["']csrf-param["'][^>]*content=["']authenticity_token["']/ },
];

function detectFramework(html: string, gen: string, setCookie: string): { name: string; signal: string } | null {
  for (const f of FRAMEWORKS) {
    if (f.gen && f.gen.test(gen)) return { name: f.name, signal: `generator "${gen}"` };
    if (f.html && f.html.test(html)) return { name: f.name, signal: `${f.name} markup` };
    if (f.cookie && f.cookie.test(setCookie)) return { name: f.name, signal: `${f.name} session cookie` };
  }
  return null;
}

/**
 * Identify what `domain` is built on. Never throws: an unreachable or hostile
 * host comes back as "unreachable"/"unknown", because this runs in a signup
 * form where a wrong answer must not be a crash.
 */
export async function detectPlatform(domainOrUrl: string): Promise<PlatformResult> {
  const raw = domainOrUrl.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!raw || isPrivateHost(raw)) {
    return { platform: "unreachable", confidence: "high", url: null, signals: ["private or empty host"] };
  }

  const got = (await guardedFetch(`https://${raw}`)) ?? (await guardedFetch(`http://${raw}`));
  if (!got) {
    return { platform: "unreachable", confidence: "high", url: null, signals: ["no HTTP response"] };
  }

  const { res, url } = got;
  const html = await readCapped(res);
  const h = (name: string) => res.headers.get(name) ?? "";
  const gen = metaGenerator(html) ?? "";
  const signals: string[] = [];
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    origin = `https://${raw}`;
  }

  // What the site says it is built from, computed once up front: it is what
  // lets an asset-only builder hint (below) be overruled.
  const code = detectFramework(html, gen, h("set-cookie"));

  // --- Vendor-only response headers decide on their own (they cannot be
  // --- faked by a migrated-away site the way an asset URL can).
  if (h("x-wix-request-id")) {
    signals.push("X-Wix-Request-Id header");
    return { platform: "wix", confidence: "high", url, signals };
  }
  if (h("x-shopid") || h("x-shopify-stage") || h("x-sorting-hat-podid")) {
    signals.push("Shopify infrastructure header");
    return { platform: "shopify", confidence: "high", url, signals };
  }
  for (const b of BUILDERS) {
    if (b.header && h(b.header)) return { platform: b.platform, confidence: "high", url, signals: [`${b.header} header`] };
    if (b.gen && b.gen.test(gen)) return { platform: b.platform, confidence: "high", url, signals: [`generator "${gen}"`] };
  }
  // Asset hosts alone: a builder only when nothing says the site is code.
  if (!code) {
    if (/static\.wixstatic\.com/i.test(html)) return { platform: "wix", confidence: "medium", url, signals: ["wixstatic.com assets"] };
    if (/cdn\.shopify\.com/i.test(html)) return { platform: "shopify", confidence: "medium", url, signals: ["cdn.shopify.com assets"] };
    for (const b of BUILDERS) {
      if (b.asset && b.asset.test(html)) return { platform: b.platform, confidence: "medium", url, signals: [`${labelFor(b.platform)} assets`] };
    }
  }

  // --- WordPress: require two independent signals before saying so.
  const wpSignals: string[] = [];
  // The REST Link header survives generator-tag stripping and is the single
  // highest-precision homepage signal.
  if (/rel=["']?https:\/\/api\.w\.org\//i.test(h("link"))) wpSignals.push('Link header rel="https://api.w.org/"');
  if (/xmlrpc\.php/i.test(h("x-pingback"))) wpSignals.push("X-Pingback header");
  if (/\/wp-content\//i.test(html)) wpSignals.push("/wp-content/ asset paths");
  if (/\/wp-includes\//i.test(html)) wpSignals.push("/wp-includes/ asset paths");
  if (/^WordPress/i.test(gen)) wpSignals.push(`generator "${gen}"`);

  const looksWp = wpSignals.length >= 2;

  // Squarespace / Webflow / Framer / Ghost - checked before the single-signal
  // WordPress fallback so a code-built site that merely mentions wp-content in
  // a blog post is not mislabelled. A generator tag (or Webflow's data-wf-*
  // attributes, which only its own renderer emits) decides; a CDN or asset
  // host alone needs the site not to look like code.
  const sqGen = /^Squarespace/i.test(gen);
  const sqAssets = /static1\.squarespace\.com|images\.squarespace-cdn\.com|static\.squarespace\.com/i.test(html);
  const otherSignals: string[] = [];
  if (sqGen) otherSignals.push('generator "Squarespace"');
  if (sqAssets) otherSignals.push("squarespace CDN assets");
  const looksSquarespace = sqGen || (sqAssets && !code);

  const wfSignals: string[] = [];
  if (/^Webflow/i.test(gen)) wfSignals.push('generator "Webflow"');
  // data-wf-* survives generator removal on paid plans; it is the robust one.
  if (/data-wf-(page|site|domain)=/i.test(html)) wfSignals.push("data-wf-* attributes");
  if (!code && /\/js\/webflow(\.[a-z0-9]+)?\.js/i.test(html)) wfSignals.push("webflow.js");

  const framerSignals: string[] = [];
  if (/^Framer/i.test(gen)) framerSignals.push('generator "Framer"');
  if (!code && /framerusercontent\.com/i.test(html)) framerSignals.push("framerusercontent.com assets");

  // Ghost: the docs have named it unsupported since the qualifier shipped, but
  // nothing detected it, so a Ghost site fell through to "unknown" - which the
  // support table deliberately waves through. That is the exact churn shape
  // the qualifier exists to stop. Generator tag is the standard signal; the
  // portal/cards assets ship with stock installs and survive themes that
  // strip the tag - but a code front end over a headless Ghost is a fit.
  const ghostSignals: string[] = [];
  if (/^Ghost/i.test(gen)) ghostSignals.push(`generator "${gen}"`);
  if (!code && /@tryghost\/portal|\/public\/cards\.min\.(js|css)/i.test(html))
    ghostSignals.push("Ghost portal/cards assets");

  const nextSignals: string[] = [];
  if (/id=["']__NEXT_DATA__["']/i.test(html)) nextSignals.push("__NEXT_DATA__ script");
  if (/\/_next\/static\//i.test(html)) nextSignals.push("/_next/static/ assets");
  if (h("x-nextjs-cache")) nextSignals.push("X-Nextjs-Cache header");

  if (looksWp) {
    const version = /^WordPress\s+([0-9.]+)/i.exec(gen)?.[1] ?? null;
    // Elementor: the generator tag is authoritative but switchable off, so the
    // class-name fallback (emitted by the actual page output) does the work.
    const elementor = /content=["']Elementor\s/i.test(html) || /class=["'][^"']*\belementor-/i.test(html);
    if (elementor) wpSignals.push("Elementor markup");
    const probe = await probeWpJson(origin);
    return {
      platform: "wordpress",
      confidence: "high",
      url,
      signals: wpSignals,
      wordpress: {
        version,
        elementor,
        seoPlugin: probe.seoPlugin,
        restReachable: probe.reachable,
        headless: false,
      },
    };
  }

  if (looksSquarespace) return { platform: "squarespace", confidence: otherSignals.length > 1 ? "high" : "medium", url, signals: otherSignals };
  if (wfSignals.length) return { platform: "webflow", confidence: wfSignals.length > 1 ? "high" : "medium", url, signals: wfSignals };
  if (framerSignals.length) return { platform: "framer", confidence: framerSignals.length > 1 ? "high" : "medium", url, signals: framerSignals };
  if (ghostSignals.length) return { platform: "ghost", confidence: ghostSignals.length > 1 ? "high" : "medium", url, signals: ghostSignals };

  if (nextSignals.length) {
    // Decoupled WordPress: the front end is Next.js but a live WP install may
    // still sit behind it. Worth one extra request - it turns "we can't help
    // you" into "we can publish to your WordPress" for a whole class of site.
    const probe = await probeWpJson(origin);
    if (probe.reachable) {
      return {
        platform: "wordpress",
        confidence: "medium",
        url,
        signals: [...nextSignals, "/wp-json/ reachable behind the front end"],
        wordpress: { version: null, elementor: false, seoPlugin: probe.seoPlugin, restReachable: true, headless: true },
      };
    }
    return { platform: "nextjs", confidence: nextSignals.length > 1 ? "high" : "medium", url, signals: nextSignals, framework: "Next.js" };
  }

  // One weak WordPress signal and nothing else: confirm with /wp-json/ rather
  // than guessing either way.
  if (wpSignals.length === 1 && !code) {
    const probe = await probeWpJson(origin);
    if (probe.reachable) {
      const elementor = /class=["'][^"']*\belementor-/i.test(html);
      return {
        platform: "wordpress",
        confidence: "high",
        url,
        signals: [...wpSignals, "/wp-json/ exposes wp/v2"],
        wordpress: {
          version: /^WordPress\s+([0-9.]+)/i.exec(gen)?.[1] ?? null,
          elementor,
          seoPlugin: probe.seoPlugin,
          restReachable: true,
          headless: false,
        },
      };
    }
    signals.push(...wpSignals, "single weak signal, /wp-json/ not reachable");
    return { platform: "unknown", confidence: "low", url, signals };
  }

  // Code we can name: a fit, whatever the framework.
  if (code) return { platform: "static", confidence: "medium", url, signals: [code.signal], framework: code.name };

  if (gen) signals.push(`generator "${gen}"`);
  return { platform: res.ok ? "static" : "unknown", confidence: "low", url, signals, framework: null };
}

// --- Verdict -------------------------------------------------------------
//
// Kept separate from detection ON PURPOSE. What we can serve changes as the
// product grows (WordPress publishing lands, Shopify may follow); what a site
// IS does not. One place to edit when support widens.

export type Qualification = {
  verdict: "supported" | "unsupported" | "unknown";
  /** Which publishing route this site would take, when supported. */
  route: "repo" | "wordpress" | null;
  /** Plain sentence for the owner. No jargon: they are not developers. */
  message: string;
};

export function qualifySite(result: PlatformResult): Qualification {
  switch (result.platform) {
    case "wordpress":
      // Supported since the publisher landed (connect -> crawl -> finish ->
      // publish -> verify, proven against a live site and the fixture
      // installs). An unreachable REST API is a heads-up, not a refusal:
      // security plugins commonly block anonymous /wp-json/ probes while the
      // authenticated connect still works, and the connect screen is the
      // place that finds out for real.
      return {
        verdict: "supported",
        route: "wordpress",
        message: result.wordpress?.restReachable
          ? "We found WordPress on your site - articles publish straight to it, no repo or plugin needed."
          : "We found WordPress on your site. Its REST API didn't answer our anonymous check (security plugins often block that), which is fine - connecting with an application password is what settles it.",
      };
    case "nextjs":
    case "static":
      return {
        verdict: "supported",
        route: "repo",
        message: "Your site looks like it is built from code, which is what we support today.",
      };
    case "wix":
    case "squarespace":
    case "shopify":
    case "webflow":
    case "framer":
    case "ghost":
    case "hubspot":
    case "weebly":
    case "godaddy":
    case "duda":
    case "jimdo":
    case "tilda":
    case "strikingly":
    case "googlesites":
    case "blogger":
    case "substack":
    case "medium":
    case "bigcommerce":
    case "hostinger":
      return {
        verdict: "unsupported",
        route: null,
        message: `We do not support ${labelFor(result.platform)} sites. There is no way for us to publish pages to one yet.`,
      };
    case "unreachable":
      return {
        verdict: "unknown",
        route: null,
        message: "We could not reach that address. Check the spelling, or continue if you know the site is live.",
      };
    default:
      return {
        verdict: "unknown",
        route: null,
        message: "We could not tell what your site is built on.",
      };
  }
}

export function labelFor(platform: Platform): string {
  switch (platform) {
    case "wordpress":
      return "WordPress";
    case "wix":
      return "Wix";
    case "squarespace":
      return "Squarespace";
    case "shopify":
      return "Shopify";
    case "webflow":
      return "Webflow";
    case "framer":
      return "Framer";
    case "ghost":
      return "Ghost";
    case "hubspot":
      return "HubSpot";
    case "weebly":
      return "Weebly";
    case "godaddy":
      return "GoDaddy";
    case "duda":
      return "Duda";
    case "jimdo":
      return "Jimdo";
    case "tilda":
      return "Tilda";
    case "strikingly":
      return "Strikingly";
    case "googlesites":
      return "Google Sites";
    case "blogger":
      return "Blogger";
    case "substack":
      return "Substack";
    case "medium":
      return "Medium";
    case "bigcommerce":
      return "BigCommerce";
    case "hostinger":
      return "Hostinger";
    case "nextjs":
      return "Next.js";
    case "static":
      return "a code-built site";
    case "unreachable":
      return "an unreachable site";
    default:
      return "something we could not identify";
  }
}

// Pure-ish Open Graph / Twitter Card analysis behind the Open Graph Tag
// Checker widget. Parses pasted page HTML with DOMParser (browser-only - no
// fetch, no backend, nothing pasted ever leaves the tab) and checks it
// against ogp.me's four required properties, Facebook's published image
// sizing guidance, and the standard twitter: tag fallback-to-og: behavior.
// The actual og:image load/dimension check happens in the widget component,
// since that needs a live <img> element - this file only reasons about the
// tags themselves.

export type IssueSeverity = "error" | "warning" | "info";

export type Finding = {
  severity: IssueSeverity;
  title: string;
  detail: string;
};

export type ParsedTags = {
  title: string | null;
  type: string | null;
  image: string | null;
  url: string | null;
  description: string | null;
  siteName: string | null;
  imageWidth: string | null;
  imageHeight: string | null;
  imageAlt: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  twitterSite: string | null;
};

// What a Facebook/Slack-style unfurl and an X-style card actually resolve to,
// once the standard OG fallback rules are applied - the same values used to
// render the live preview.
export type ResolvedCard = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string | null;
};

export type OgCheckResult = {
  looksLikeHtml: boolean;
  tags: ParsedTags;
  findings: Finding[];
  facebook: ResolvedCard;
  twitter: ResolvedCard;
  /** Absolute base derived from og:url, used to fix a relative og:image. */
  origin: string | null;
};

const TWITTER_CARD_VALUES = new Set(["summary", "summary_large_image", "app", "player"]);
const MAX_HTML_CHARS = 300000;

function metaContent(doc: Document, attr: "property" | "name", value: string): string | null {
  const el = doc.querySelector(`meta[${attr}="${value}"]`);
  const content = el?.getAttribute("content")?.trim();
  return content ? content : null;
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function originOf(absoluteUrl: string): string | null {
  try {
    return new URL(absoluteUrl).origin;
  } catch {
    return null;
  }
}

export function extractTags(doc: Document): ParsedTags {
  return {
    title: metaContent(doc, "property", "og:title"),
    type: metaContent(doc, "property", "og:type"),
    image: metaContent(doc, "property", "og:image"),
    url: metaContent(doc, "property", "og:url"),
    description: metaContent(doc, "property", "og:description"),
    siteName: metaContent(doc, "property", "og:site_name"),
    imageWidth: metaContent(doc, "property", "og:image:width"),
    imageHeight: metaContent(doc, "property", "og:image:height"),
    imageAlt: metaContent(doc, "property", "og:image:alt"),
    twitterCard: metaContent(doc, "name", "twitter:card"),
    twitterTitle: metaContent(doc, "name", "twitter:title"),
    twitterDescription: metaContent(doc, "name", "twitter:description"),
    twitterImage: metaContent(doc, "name", "twitter:image"),
    twitterSite: metaContent(doc, "name", "twitter:site"),
  };
}

export function analyzeOgTags(html: string): OgCheckResult {
  const doc = new DOMParser().parseFromString(html.slice(0, MAX_HTML_CHARS), "text/html");
  const looksLikeHtml = doc.querySelectorAll("*").length > 0;
  const tags = extractTags(doc);

  const origin = tags.url && isAbsoluteUrl(tags.url) ? originOf(tags.url) : null;

  const findings: Finding[] = [];

  if (!looksLikeHtml) {
    findings.push({
      severity: "info",
      title: "That doesn't look like HTML",
      detail:
        'Paste your page\'s HTML source, not plain text - right-click the page and choose "View Page Source" (or copy the <head> markup from dev tools), then paste the whole thing in.',
    });
    return { looksLikeHtml, tags, findings, facebook: emptyCard(), twitter: emptyCard(), origin };
  }

  // ogp.me's four required properties - every crawler that reads Open Graph
  // expects all four; missing any one degrades to a bare link on most platforms.
  if (!tags.title) {
    findings.push({
      severity: "error",
      title: "Missing og:title",
      detail: "Required by the Open Graph spec. Without it, most platforms fall back to your <title> tag or the raw URL.",
    });
  }
  if (!tags.type) {
    findings.push({
      severity: "error",
      title: "Missing og:type",
      detail: 'Required by the Open Graph spec. "website" is the safe default for most pages, "article" for a blog post.',
    });
  }
  if (!tags.url) {
    findings.push({
      severity: "error",
      title: "Missing og:url",
      detail: "Required by the Open Graph spec - the canonical URL for this page. Without it, shares can end up crediting a different URL (with query params, a trailing slash, etc.) than the one you meant.",
    });
  }
  if (!tags.image) {
    findings.push({
      severity: "error",
      title: "Missing og:image",
      detail: "Required by the Open Graph spec. Without it, shared links render as plain text with no preview image on Facebook, Slack, LinkedIn, and most other platforms.",
    });
  } else if (!isAbsoluteUrl(tags.image)) {
    findings.push({
      severity: "error",
      title: "og:image isn't an absolute URL",
      detail: `"${tags.image}" is a relative path. A browser resolves that against the page it's on, but the crawlers that build link previews have no page context to resolve it against - they need the full https://... URL or the image silently fails to load.`,
    });
  }

  if (!tags.description) {
    findings.push({
      severity: "warning",
      title: "Missing og:description",
      detail: "Not one of the four required properties, but every platform that renders a preview card uses it - without it, most fall back to the first text found on the page, which is rarely what you'd choose.",
    });
  } else if (tags.description.length > 300) {
    findings.push({
      severity: "info",
      title: `og:description is long (${tags.description.length} characters)`,
      detail: "Facebook doesn't publish an exact cutoff, but descriptions much beyond this commonly get truncated with an ellipsis in the feed. Consider tightening it.",
    });
  }

  if (tags.title && tags.title.length > 100) {
    findings.push({
      severity: "info",
      title: `og:title is long (${tags.title.length} characters)`,
      detail: "No published hard limit, but a title this long is likely to get cut off in a compact card layout (X's summary card especially).",
    });
  }

  if (!tags.siteName) {
    findings.push({
      severity: "info",
      title: "Missing og:site_name",
      detail: "Optional, but it's what shows as the small caption above the title on most unfurls (e.g. \"DISPATCHSEO.COM\"). Worth adding for brand recognition.",
    });
  }

  if (tags.imageWidth || tags.imageHeight) {
    const w = Number(tags.imageWidth);
    const h = Number(tags.imageHeight);
    if (tags.imageWidth && tags.imageHeight && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      const ratio = w / h;
      if (w < 200 || h < 200) {
        findings.push({
          severity: "warning",
          title: `Declared image size ${w}x${h} is below Facebook's 200x200 minimum`,
          detail: "Facebook's own sharing guidelines list 200x200 as the floor. Below that, some platforms won't render the image at all.",
        });
      } else if (Math.abs(ratio - 1200 / 630) > 0.15) {
        findings.push({
          severity: "info",
          title: `Declared image aspect ratio is ${ratio.toFixed(2)}:1`,
          detail: "Facebook recommends close to 1.91:1 (e.g. 1200x630) so the full image shows in Feed without cropping. Yours will likely get cropped.",
        });
      }
    }
  } else {
    findings.push({
      severity: "info",
      title: "Missing og:image:width / og:image:height",
      detail: "Optional, but declaring them lets Facebook's crawler render your preview immediately instead of downloading the image first to measure it.",
    });
  }

  // Twitter/X: twitter:title, twitter:description and twitter:image all fall
  // back to their og: equivalent when absent - only twitter:card itself has
  // no Open Graph equivalent, so its absence is the one gap og: tags alone
  // can't cover.
  if (!tags.twitterCard) {
    findings.push({
      severity: "warning",
      title: "Missing twitter:card",
      detail: 'twitter:title, twitter:description and twitter:image all fall back to your og: tags when absent - but twitter:card has no Open Graph equivalent. Without it, X may not render a rich image card at all even though your og: tags are complete. Add <meta name="twitter:card" content="summary_large_image" />.',
    });
  } else if (!TWITTER_CARD_VALUES.has(tags.twitterCard)) {
    findings.push({
      severity: "warning",
      title: `Unrecognized twitter:card value "${tags.twitterCard}"`,
      detail: `Valid values are ${[...TWITTER_CARD_VALUES].join(", ")}. An unrecognized value is likely to be ignored.`,
    });
  } else if (tags.twitterCard === "summary_large_image" && !tags.twitterImage && !tags.image) {
    findings.push({
      severity: "error",
      title: "summary_large_image card with no image to show",
      detail: "twitter:card is set to summary_large_image, but there's no twitter:image and no og:image to fall back to - the card will render with no image at all.",
    });
  }

  const facebook: ResolvedCard = {
    title: tags.title,
    description: tags.description,
    image: tags.image,
    siteName: tags.siteName,
    url: tags.url,
  };
  const twitter: ResolvedCard = {
    title: tags.twitterTitle ?? tags.title,
    description: tags.twitterDescription ?? tags.description,
    image: tags.twitterImage ?? tags.image,
    siteName: tags.siteName,
    url: tags.url,
  };

  return { looksLikeHtml, tags, findings, facebook, twitter, origin };
}

function emptyCard(): ResolvedCard {
  return { title: null, description: null, image: null, siteName: null, url: null };
}

/** Rewrites a relative og:image against the page's own og:url origin, when possible. */
export function suggestAbsoluteImageUrl(image: string, origin: string | null): string | null {
  if (!origin || isAbsoluteUrl(image)) return null;
  try {
    return new URL(image, origin).toString();
  } catch {
    return null;
  }
}

/** Builds a ready-to-paste <meta> block for every tag a finding flagged as missing. */
export function buildFixSnippet(tags: ParsedTags): string {
  const lines: string[] = [];
  if (!tags.title) lines.push('<meta property="og:title" content="Your page title" />');
  if (!tags.type) lines.push('<meta property="og:type" content="website" />');
  if (!tags.url) lines.push('<meta property="og:url" content="https://example.com/your-page" />');
  if (!tags.image) lines.push('<meta property="og:image" content="https://example.com/path/to/image.png" />');
  if (!tags.description) lines.push('<meta property="og:description" content="One or two sentences describing the page." />');
  if (!tags.siteName) lines.push('<meta property="og:site_name" content="Your Site Name" />');
  if (!tags.twitterCard) lines.push('<meta name="twitter:card" content="summary_large_image" />');
  return lines.join("\n");
}

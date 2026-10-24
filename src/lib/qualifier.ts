import { db } from "./db";
import { detectPlatform, labelFor, qualifySite, type PlatformResult } from "./site-platform";
import { type AiChoice, type SiteKind } from "./qualifier-options";

export type { AiChoice, SiteKind };

// The pre-checkout gate. Two questions, asked before the card is charged:
// what kind of site it is, and which AI will drive it. Both are structural -
// a WordPress site has no repo to open a pull request against, and an owner
// with no coding agent has nothing to run the builder - so both were already
// deciding who churns. They were just being asked five minutes too late, on a
// wizard screen that sits past checkout.
//
// Since 2026-08-20 the site question is a CHOICE (WordPress, or built with
// code on GitHub) with the domain optional beside it. The owner's answer is
// what the wizard branches on; the domain probe is the safety net - it still
// refuses a Wix/Squarespace/... site behind a confident click, and it still
// tells them what we saw.
//
// EVERYTHING THAT DECIDES "CAN WE SERVE THIS PERSON" LIVES IN THIS FILE, in
// the two tables below. When WordPress publishing lands, one entry flips from
// "building" to "ready" - not a hunt through page components.

/** How far along support for a thing is. Only "ready" reaches checkout. */
type Support = "ready" | "building" | "no";

// --- What the site is built on ------------------------------------------
//
// "building" is not a euphemism for "no": it is the honest state of the
// WordPress publisher while it is being written, and it changes the message
// the owner reads (a date-less "we are building this" rather than a flat
// "never"). No email capture on either - the standing decision is to say it
// isn't supported and let people go, not to farm a waitlist.
const PLATFORM_SUPPORT: Record<string, Support> = {
  nextjs: "ready", // a code-built site: the repo path works today
  static: "ready",
  // Ready since 2026-08-19: connect, crawl, finish, publish and verify all
  // proven end to end against a live site, plus five fixture installs
  // (vanilla, Elementor, Yoast, RankMath, and one with REST locked down).
  // Self-hosted WordPress specifically - a wordpress.com-hosted site still
  // reaches the connect screen, where it fails by name rather than here.
  wordpress: "ready",
  wix: "no",
  squarespace: "no",
  shopify: "no",
  webflow: "no",
  framer: "no",
  // The docs named Ghost unsupported from day one; the detector just couldn't
  // see one, so Ghost owners fell into "unknown" and were waved through to
  // checkout - the exact churn the qualifier exists to prevent.
  ghost: "no",
  unknown: "ready", // we could not tell; our probe is not good enough to refuse someone on
  unreachable: "ready", // ditto - a new domain that is not live yet is a normal case
};

// --- What will drive it --------------------------------------------------

const AI_SUPPORT: Record<AiChoice, Support> = {
  // Our own writer: nothing on the owner's side to connect, so nothing here
  // can refuse them - the site question is the whole qualifier on cloud.
  hosted: "ready",
  "claude-code": "ready",
  codex: "ready",
  cursor: "ready",
  // ChatGPT's custom-connector behaviour on a Plus plan (URL-key auth? write
  // tools?) is unverified - the hand-test in docs-private decides whether it
  // ships as-is or needs OAuth first. Until that test is recorded, someone
  // whose only AI is ChatGPT genuinely cannot run this.
  chatgpt: "building",
  // Ready since 2026-08-20: the ordinary claude.ai app connects through the
  // same MCP door with ?client=chat, writes on the owner's own subscription,
  // and hands the article to submit_article; our server finishes and
  // publishes it. Publishing goes to WordPress or, for a code-built site, to
  // its GitHub repo as a pull request our server opens - so the chat app
  // needs no coding agent on either platform. LAUNCH GATE: flipped in code
  // ahead of Neo's own claude.ai hand-test (docs-private/
  // claude-connector-test-result.md); do not deploy before that file says
  // PASS.
  "claude-web": "ready",
  // Gemini's consumer app has no way to connect a third-party tool at all
  // (verified 2026-08-18), so this is a structural no, not a roadmap item.
  gemini: "no",
  none: "no",
};

export type QualifierVerdict = {
  ok: boolean;
  /** The single sentence the owner reads first. */
  headline: string;
  /** Why, in their words. One or two sentences, no jargon. */
  detail: string;
  /** True when the blocker is something we are actively building. */
  building: boolean;
};

/** The platform record used when the owner gave no domain: nothing probed,
 *  nothing to refuse on. */
export const UNPROBED: PlatformResult = {
  platform: "unknown",
  confidence: "low",
  url: null,
  signals: [],
};

/** The owner's own words for the route their choice implies, used when the
 *  probe has nothing more specific to say. */
function messageForKind(kind: SiteKind, ai: AiChoice | null = null): string {
  if (ai === "hosted") {
    return kind === "wordpress"
      ? "WordPress it is - we write the articles and post them straight to your site with an application password, no plugin needed."
      : "A code-built site it is - we write the articles and publish them through your GitHub repo, or serve your /blog for you if the site has none.";
  }
  return kind === "wordpress"
    ? "WordPress it is - articles publish straight to your site with an application password, no repo or plugin needed."
    : "A code-built site it is - articles arrive as pull requests in your GitHub repo, and nothing ships until you merge.";
}

export function verdictFor(
  platform: PlatformResult,
  ai: AiChoice,
  siteKind: SiteKind | null = null,
): QualifierVerdict {
  const probed = qualifySite(platform);
  // With an explicit choice the probe only matters when it contradicts the
  // choice with a platform we can never publish to; otherwise the owner's
  // answer wins and the probe's sentence is kept only when it adds something
  // (a WordPress version, a REST heads-up).
  const site =
    siteKind && platform.platform !== "wordpress" && probed.verdict !== "unsupported"
      ? { ...probed, message: messageForKind(siteKind, ai) }
      : siteKind && platform.platform === "wordpress" && siteKind === "code"
        ? {
            ...probed,
            message:
              "We found WordPress on that address. Publishing to a repo still works if that is really how the site is built - but if it is a WordPress site, pick WordPress above: it is the shorter path.",
          }
        : probed;
  const platformSupport = PLATFORM_SUPPORT[platform.platform] ?? "ready";
  const aiSupport = AI_SUPPORT[ai] ?? "no";

  // Platform first: it is the harder wall, and the one both WordPress churns
  // hit. An owner told "WordPress isn't ready" does not also need to hear
  // about agents in the same breath.
  if (platformSupport === "building") {
    return {
      ok: false,
      building: true,
      headline: `We can't set up a ${labelFor(platform.platform)} site yet`,
      detail: site.message,
    };
  }
  if (platformSupport === "no") {
    return {
      ok: false,
      building: false,
      headline: `We don't support ${labelFor(platform.platform)} sites`,
      detail:
        "There's no way for us to publish pages to one. Rather than take your money for a setup that can't finish, we'd rather say so now.",
    };
  }

  if (aiSupport === "building") {
    return {
      ok: false,
      building: true,
      headline: "We can't connect the ChatGPT app yet",
      detail:
        "Right now the work runs through the Claude app or a coding agent (Claude Code, Codex or Cursor). Connecting ChatGPT is being built. If you also have one of those, pick it above and you're good to go.",
    };
  }
  if (aiSupport === "no") {
    return {
      ok: false,
      building: false,
      headline: ai === "gemini" ? "Gemini can't drive this yet" : "You'll need an AI assistant",
      detail:
        ai === "gemini"
          ? "Google's Gemini app has no way to connect an outside tool like ours, so it can't run your SEO. The Claude app, Claude Code, Codex and Cursor all work today."
          : "DispatchSEO doesn't write with our own AI, it drives yours. You'll need the Claude app, Claude Code, Codex or Cursor to use it today.",
    };
  }

  return {
    ok: true,
    building: false,
    headline: "You're set up to use this",
    detail: site.message,
  };
}

// --- Storage -------------------------------------------------------------

export type QualifierRow = {
  id: string;
  user_id: string;
  /** Null since 2026-08-20 when the owner skipped the optional domain. */
  domain: string | null;
  /** "wordpress" | "code" since 2026-08-20; null on older rows. */
  site_kind: string | null;
  platform: string;
  confidence: string | null;
  signals: string[];
  wordpress: Record<string, unknown> | null;
  ai_choice: string;
  verdict: string;
  route: string | null;
  proceeded: boolean;
  created_at: string;
};

/** Run the check and keep the answer. Never throws: a storage hiccup must not
 *  block a signup, so the verdict is still returned when the insert fails. */
export async function runQualifier(
  userId: string,
  domain: string | null,
  ai: AiChoice,
  siteKind: SiteKind,
): Promise<{ platform: PlatformResult; verdict: QualifierVerdict }> {
  const platform = domain ? await detectPlatform(domain) : UNPROBED;
  const verdict = verdictFor(platform, ai, siteKind);
  // The route the WIZARD will take: the owner's choice, not the probe's guess.
  const route = siteKind === "wordpress" ? "wordpress" : "repo";
  try {
    await db()
      .from("signup_qualifiers")
      .insert({
        user_id: userId,
        domain: domain ? domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : null,
        site_kind: siteKind,
        platform: platform.platform,
        confidence: platform.confidence,
        signals: platform.signals,
        wordpress: platform.wordpress ?? null,
        ai_choice: ai,
        verdict: verdict.ok ? "supported" : verdict.building ? "building" : "unsupported",
        route,
        proceeded: verdict.ok,
      });
  } catch {
    // Counting is valuable; charging correctly is more valuable. Swallow.
  }
  return { platform, verdict };
}

/** The newest answer for this user, or null if they have never been asked.
 *  A DB error reads as "not asked" so a hiccup can never lock someone out of
 *  checkout - the gate is here to stop a doomed signup, not to become one. */
export async function latestQualifier(userId: string): Promise<QualifierRow | null> {
  try {
    const { data, error } = await db()
      .from("signup_qualifiers")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as QualifierRow) ?? null;
  } catch {
    return null;
  }
}

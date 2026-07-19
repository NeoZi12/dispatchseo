// Deterministic generated cover art for the /blog index. Posts have no
// images, so every card gets an accent-tinted "plate" (rendered by
// src/components/blog/CoverArt.tsx). This module owns the ASSIGNMENT.
//
// Motif is topic-driven (regex over keyword/slug/title) because it carries
// meaning - an MCP post should always get the plug glyph. Accent does NOT
// follow topic: two posts about the same thing would then always get the
// same color block, and back-to-back identical plates reads as a repeated
// placeholder rather than a designed family. So accent is a slug-hash pick
// across the full wheel, assigned in one pass over the posts currently on
// screen with a de-dupe against the immediately preceding card - two MCP
// posts can land on violet/plug and sky/plug next to each other: same glyph
// family (still MCP), different color block. That's why coversForPosts
// takes the whole, in-order post list rather than being called per-card -
// de-duping needs to see neighbors.

export type CoverAccent = "violet" | "sky" | "emerald" | "amber" | "rose";

export type CoverMotif = "plug" | "loop" | "gauge" | "layers" | "brackets";

export type CoverSpec = { accent: CoverAccent; motif: CoverMotif };

const ACCENTS: CoverAccent[] = ["violet", "sky", "emerald", "amber", "rose"];

// First matching rule wins - order encodes priority. A post can legitimately
// be "about MCP" AND list examples (mcp-server-examples.mdx is both); MCP is
// the more specific, load-bearing topic, so it's checked first.
const MOTIF_RULES: [RegExp, CoverMotif][] = [
  [/\bmcp\b/, "plug"],
  [/github action|\bcron\b|automat|schedul/, "loop"],
  [/\bseo\b|rank|serp|search console|\bgsc\b|backlink/, "gauge"],
  [/example|checklist|comparison|\bvs\b|list of/, "layers"],
  [/how to|\bbuild\b|guide|setup|install/, "brackets"],
];

// Fallback wheel for a post that matches no motif rule: hash the slug into
// one of these so a brand-new topic still gets a stable glyph.
const MOTIF_FALLBACKS: CoverMotif[] = ["plug", "loop", "gauge", "layers", "brackets"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function motifForPost(post: { slug: string; title: string; keyword?: string }): CoverMotif {
  const text = `${post.keyword ?? ""} ${post.slug} ${post.title}`.toLowerCase();
  for (const [re, motif] of MOTIF_RULES) if (re.test(text)) return motif;
  return MOTIF_FALLBACKS[hash(post.slug) % MOTIF_FALLBACKS.length];
}

/**
 * Assigns a cover to every post in the given display order, in one pass.
 * Motif is purely topic-driven per post; accent is a slug-hash pick that
 * steps forward around the wheel whenever it would repeat the previous
 * card's accent, so the rendered list never shows the same color block
 * twice in a row.
 */
export function coversForPosts<T extends { slug: string; title: string; keyword?: string }>(
  posts: T[],
): Map<string, CoverSpec> {
  const result = new Map<string, CoverSpec>();
  let prevAccent: CoverAccent | null = null;
  for (const post of posts) {
    const motif = motifForPost(post);
    const start = hash(post.slug) % ACCENTS.length;
    let accent = ACCENTS[start];
    for (let step = 0; accent === prevAccent && step < ACCENTS.length - 1; step++) {
      accent = ACCENTS[(start + step + 1) % ACCENTS.length];
    }
    result.set(post.slug, { accent, motif });
    prevAccent = accent;
  }
  return result;
}

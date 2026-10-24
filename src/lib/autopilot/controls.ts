import { db } from "@/lib/db";
import { getProjectById, type Project } from "@/lib/projects";
import { loadSiteProfile } from "@/lib/site-profile";
import { HOUSE_RULES_MAX } from "@/lib/content-prefs";
import { mergeContentPrefs } from "@/lib/content-prefs-store";
import { findDuplicateSuggestion, isDuplicateKeyError } from "@/lib/suggestion-dedupe";
import { isProjectUrl } from "@/lib/url-guard";
import { jaccard } from "@/lib/writer/evidence";
import { cleanTopicList, DUPLICATE_JACCARD, FIT_MIN, matchesBlockedTopic, normalizeKeyword, sentenceTitle } from "./math";
import { blockedTopicsOf } from "./prefs";
import { judgeCandidates } from "./research";

export { pauseWriter, resumeWriter } from "./pause";

// The owner's controls on a hosted project - ALL of them (decision 7 of the
// 2026-10-23 spec): pause/resume, the brand text, the tone, topics to avoid,
// suggesting a topic, and the byline. Cadence, models, keyword picking and
// draft approval are deliberately not here; the autopilot decides those.
//
// Every control is validated HERE, once, and called from both doors: the
// dashboard's server actions (src/app/autopilot-actions.ts) and the MCP tools
// (the parity rule). Callers have already resolved and authorized the
// project; these functions trust the id they are given.

export type ControlResult = { ok: true } | { ok: false; error: string };

export type BrandInput = { tagline?: string; short?: string; long?: string; categories?: string[] };
export type AuthorInput = { name?: string | null; bio?: string | null; url?: string | null };

export type SuggestTopicResult =
  | { accepted: true; suggestionId: string; title: string }
  | { rejected: string };

export const BRAND_LIMITS = { tagline: 60, short: 160, long: 1000, categories: 8, category: 40 } as const;
export const AUTHOR_LIMITS = { name: 80, bio: 500, url: 300 } as const;
export const TOPIC_LIMITS = { min: 3, max: 120, perDay: 20 } as const;

const fail = (error: string): ControlResult => ({ ok: false, error });
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

/** Raw content_prefs keys, merged atomically (content-prefs-store.ts). */
async function mergePrefs(projectId: string, patch: Record<string, unknown>): Promise<string | null> {
  return mergeContentPrefs(projectId, patch);
}

async function projectOr(projectId: string): Promise<Project | null> {
  return getProjectById(projectId);
}

/**
 * The brand text: what the site is, in the owner's words. Writes site_profile
 * and LOCKS it, so the model that drafted it (profile.ts) never rewrites it.
 * Fields left undefined keep their current value.
 */
export async function setBrand(projectId: string, input: BrandInput): Promise<ControlResult> {
  const project = await projectOr(projectId);
  if (!project) return fail("No such site.");
  const { profile, error: readError } = await loadSiteProfile(project);
  // Fields left out keep their stored value - which must not be a skeleton
  // read during a blip, or saving the tagline would blank the rest.
  if (readError) return fail("Couldn't read the current brand text. Try again in a minute.");
  const tagline = input.tagline !== undefined ? tidy(input.tagline) : profile.tagline;
  const short = input.short !== undefined ? tidy(input.short) : profile.short;
  const long = input.long !== undefined ? input.long.trim() : profile.long;
  let categories = profile.categories;
  if (input.categories !== undefined) {
    if (!Array.isArray(input.categories)) return fail("Categories must be a list.");
    categories = [...new Set(input.categories.map((c) => (typeof c === "string" ? tidy(c) : "")).filter(Boolean))];
  }
  if (tagline.length > BRAND_LIMITS.tagline) return fail(`The tagline is ${tagline.length} characters; keep it to ${BRAND_LIMITS.tagline}.`);
  if (!short) return fail("The short description can't be empty: it's how the writer decides what is on-topic for your site.");
  if (short.length > BRAND_LIMITS.short) return fail(`The short description is ${short.length} characters; keep it to ${BRAND_LIMITS.short}.`);
  if (long.length > BRAND_LIMITS.long) return fail(`The long description is ${long.length} characters; keep it to ${BRAND_LIMITS.long}.`);
  if (categories.length === 0) return fail("Add at least one category: research uses them to find topics.");
  if (categories.length > BRAND_LIMITS.categories) return fail(`At most ${BRAND_LIMITS.categories} categories.`);
  const longCat = categories.find((c) => c.length > BRAND_LIMITS.category);
  if (longCat) return fail(`"${longCat.slice(0, 30)}..." is too long for a category (${BRAND_LIMITS.category} characters max).`);

  const { error } = await db()
    .from("site_profile")
    .upsert(
      {
        project_id: project.id,
        name: profile.name || project.name,
        url: profile.url || `https://${project.domain}`,
        tagline,
        short_description: short,
        long_description: long,
        categories,
        tags: profile.tags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
  if (error) return fail(`Couldn't save that: ${error.message}`);
  const lockError = await mergePrefs(project.id, { profile_locked: true });
  if (lockError) return fail(`Saved, but couldn't lock it against regeneration: ${lockError}`);
  return { ok: true };
}

/** House rules: free text the writer follows on every article (max 2000). */
export async function setTone(projectId: string, houseRules: string): Promise<ControlResult> {
  if (typeof houseRules !== "string") return fail("Send the tone as text.");
  const text = houseRules.trim();
  if (text.length > HOUSE_RULES_MAX) return fail(`That's ${text.length} characters; the limit is ${HOUSE_RULES_MAX}.`);
  const error = await mergePrefs(projectId, { house_rules: text });
  return error ? fail(`Couldn't save that: ${error}`) : { ok: true };
}

/**
 * Topics the site must never be written about. Replaces the whole list.
 * Ideas already queued under a newly blocked topic are taken off the queue
 * now (rejected, with the reason), so "Up next" never shows something the
 * owner just ruled out; the writer refuses them at pick as a backstop.
 */
export async function setBlockedTopics(projectId: string, topics: string[]): Promise<ControlResult> {
  const cleaned = cleanTopicList(topics);
  if ("error" in cleaned) return fail(cleaned.error);
  const error = await mergePrefs(projectId, { blocked_topics: cleaned.topics });
  if (error) return fail(`Couldn't save that: ${error}`);
  if (cleaned.topics.length) {
    const { data } = await db()
      .from("suggestions")
      .select("id, title, primary_keyword")
      .eq("project_id", projectId)
      .eq("type", "guide")
      .eq("status", "approved");
    for (const row of (data ?? []) as { id: string; title: string; primary_keyword: string | null }[]) {
      const hit = matchesBlockedTopic(row.primary_keyword ?? row.title, cleaned.topics);
      if (!hit) continue;
      await db()
        .from("suggestions")
        .update({ status: "rejected", decided_at: new Date().toISOString(), rationale: `[removed: falls under the blocked topic "${hit}"]` })
        .eq("id", row.id)
        .eq("status", "approved");
    }
  }
  return { ok: true };
}

/**
 * The byline. A name makes the article schema a Person (with the page URL
 * when given) and shows it on the hosted blog; no name = the site itself, an
 * Organization. The page URL must be on the site's own domain: a byline link
 * to anywhere else is an outbound link we would be adding to every article.
 */
export async function setAuthor(projectId: string, input: AuthorInput): Promise<ControlResult> {
  const project = await projectOr(projectId);
  if (!project) return fail("No such site.");
  const pick = (v: string | null | undefined, current: string | null) => (v === undefined ? current : v === null ? null : tidy(v) || null);
  const name = pick(input.name, project.author_name);
  const bio = input.bio === undefined ? project.author_bio : input.bio === null ? null : input.bio.trim() || null;
  const url = pick(input.url, project.author_url);
  if (name && name.length > AUTHOR_LIMITS.name) return fail(`Keep the name to ${AUTHOR_LIMITS.name} characters.`);
  if (bio && bio.length > AUTHOR_LIMITS.bio) return fail(`The bio is ${bio.length} characters; keep it to ${AUTHOR_LIMITS.bio}.`);
  if (url) {
    if (url.length > AUTHOR_LIMITS.url) return fail("That address is too long.");
    if (!isProjectUrl(url, project.domain)) {
      return fail(`The author page has to be on ${project.domain} (for example https://${project.domain}/about).`);
    }
  }
  const { error } = await db().from("projects").update({ author_name: name, author_bio: bio, author_url: url }).eq("id", project.id);
  if (error) return fail(/author_/.test(error.message) ? "This database hasn't run migration 0066 yet." : `Couldn't save that: ${error.message}`);
  return { ok: true };
}

/**
 * "Write about this": the owner's own topic, through the same gate research
 * uses - on the site's subject (the judge), not a blocked topic, not
 * something the site already has or has queued. Passes = an APPROVED idea
 * the scheduler will write in turn; fails = a sentence saying why.
 */
export async function suggestTopic(projectId: string, text: string): Promise<SuggestTopicResult> {
  const project = await projectOr(projectId);
  if (!project) return { rejected: "No such site." };
  const topic = normalizeKeyword(typeof text === "string" ? text.replace(/[?!.]+$/, "") : "");
  if (topic.length < TOPIC_LIMITS.min) return { rejected: "Type a topic, like a search someone would make." };
  if (topic.length > TOPIC_LIMITS.max) return { rejected: `Keep it to ${TOPIC_LIMITS.max} characters - a search phrase, not a brief.` };

  // A per-site daily ceiling: each suggestion costs a judge call, and the
  // queue is meant to be steered, not filled by hand.
  const since = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { count: today } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("source", "owner")
    .gte("created_at", since);
  if ((today ?? 0) >= TOPIC_LIMITS.perDay) return { rejected: `That's ${TOPIC_LIMITS.perDay} topics today, the daily limit. Try again tomorrow.` };

  const blocked = matchesBlockedTopic(topic, blockedTopicsOf(project));
  if (blocked) return { rejected: `That falls under "${blocked}", which is on your topics-to-avoid list.` };

  const dup = await findDuplicateSuggestion(project.id, "guide", topic);
  if (dup.active) return { rejected: `It's already queued as "${dup.active.title}".` };
  if (dup.shipped) return { rejected: `You already have an article on it: "${dup.shipped.title}".` };
  const [{ data: pages }, { data: queued }] = await Promise.all([
    db().from("pages").select("title, primary_keyword").eq("project_id", project.id).limit(2000),
    db().from("suggestions").select("title, primary_keyword").eq("project_id", project.id).eq("type", "guide").in("status", ["approved", "in_progress", "done"]).limit(2000),
  ]);
  for (const r of [...((pages ?? []) as { title: string | null; primary_keyword: string | null }[]), ...((queued ?? []) as { title: string | null; primary_keyword: string | null }[])]) {
    const near = [r.primary_keyword, r.title].find((t) => t && jaccard(t, topic) >= DUPLICATE_JACCARD);
    if (near) return { rejected: `That's too close to "${r.title ?? near}", which the site already has or has queued.` };
  }

  const { profile } = await loadSiteProfile(project);
  let fit: number;
  try {
    const verdict = await judgeCandidates(project, profile, [{ keyword: topic, volume: 0, kd: null }]);
    fit = verdict.results[0]?.fit ?? 0;
  } catch {
    return { rejected: "We couldn't check that topic just now. Try again in a minute." };
  }
  if (fit < FIT_MIN) {
    // Kept as a rejected idea: it counts toward the daily limit (the judge
    // call was spent) and research will not propose it again.
    await db().from("suggestions").insert({
      project_id: project.id,
      type: "guide",
      status: "rejected",
      title: sentenceTitle(topic),
      primary_keyword: topic,
      rationale: `suggested by the owner, judged off-topic: fit ${fit.toFixed(2)} (needs ${FIT_MIN})`,
      source: "owner",
      decided_at: new Date().toISOString(),
    });
    return { rejected: `That doesn't look like something ${profile.name} can credibly write about. Try a topic closer to what the site offers.` };
  }

  const title = sentenceTitle(topic);
  const { data, error } = await db()
    .from("suggestions")
    .insert({
      project_id: project.id,
      type: "guide",
      status: "approved",
      title,
      primary_keyword: topic,
      rationale: `suggested by the owner: fit ${fit.toFixed(2)}`,
      source: "owner",
      decided_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (isDuplicateKeyError(error)) return { rejected: "It's already queued." };
    return { rejected: `Couldn't save it: ${error.message}` };
  }
  return { accepted: true, suggestionId: (data as { id: string }).id, title };
}

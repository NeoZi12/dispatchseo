import { db } from "@/lib/db";
import { planGate, projectPlan } from "@/lib/billing";
import { isCloudMode } from "@/lib/cloud";
import { platformBudgetGate } from "@/lib/dataforseo-usage";
import { publishRoute } from "@/lib/job-handlers/draft-status";
import { credsForProject, type KeywordIdea } from "@/lib/dataforseo";
import { cachedKeywordSuggestions, cachedRelatedKeywords } from "@/lib/keyword-research-cache";
import { getDomainRating } from "@/lib/domain-rating";
import { kdZones } from "@/lib/kd-zones";
import { loadSiteProfile, type SiteProfile } from "@/lib/site-profile";
import { isDuplicateKeyError } from "@/lib/suggestion-dedupe";
import { judge, JUDGE_MAX_QUESTIONS_PER_CALL, choiceOf, isDryRun, missingCredentials, type Answer, type Question } from "@/lib/writer/models";
import { writerMode, type Project } from "@/lib/projects";
import {
  DAY_MS,
  EVERGREEN_MIN,
  FIT_MIN,
  filterCandidates,
  ideasNeeded,
  normalizeKeyword,
  passesJudge,
  sentenceTitle,
  WIDEN_KD_BY,
  WIDEN_MIN_VOLUME,
  type Candidate,
  type JudgedCandidate,
} from "./math";
import { blockedTopicsOf } from "./prefs";

// Keyword research without an agent.
//
// The agent path's research was a prompt: the owner's AI read the playbook,
// called keyword_ideas, reasoned, and proposed ideas for the owner to approve.
// A hosted project has neither the agent nor an owner who wants to approve
// anything (decision 3: picking is automatic), so the same job is code:
//
//   seeds      what the site is about (profile categories + tags), what it is
//              already seen for (top Search Console queries), and the heads of
//              its best queued keywords - at most 8.
//   expand     DataForSEO Labs suggestions + related keywords per seed,
//              through the 30-day cross-tenant cache (a seed two sites share is
//              bought once a month).
//   filter     in code, cheapest first: volume >= 50, KD under the ceiling
//              this site's Domain Rating can win, the site's language, the
//              owner's blocked topics, and nothing the site already has or
//              queued (exact or near-duplicate).
//   judge      Jev, in batches of at most 40 questions, best opportunities
//              first, stopping as soon as enough have passed: does it fit the
//              site, is the intent one an article answers, will it still be
//              searched next year.
//   queue      the survivors land APPROVED - the queue tops up to six ideas,
//              never more - and are tracked for rank checks.
//
// Every paid call is already metered where it happens (model_calls,
// dataforseo_usage); this module adds no ledger of its own.

const MAX_SEEDS = 8;
const LABS_LIMIT = 50;
/** Three questions per candidate, so 13 candidates fill one Jev call. */
const QUESTIONS_PER_CANDIDATE = 3;
const CANDIDATES_PER_CALL = Math.floor(JUDGE_MAX_QUESTIONS_PER_CALL / QUESTIONS_PER_CANDIDATE);
/** The most candidates one research run will send to the judge: nine Jev
 *  calls. Judging goes past the first batches only while they keep failing;
 *  every rejection is stored, so the next run starts on fresh keywords. */
const MAX_JUDGED = CANDIDATES_PER_CALL * 9;

/** Research re-runs after this long - and an empty result is not retried any
 *  sooner. 6.5 days, not 7, so a daily cron at a fixed hour never slips a
 *  whole extra day past the week. */
export const RESEARCH_EVERY_MS = 6.5 * DAY_MS;

/** Prefix of the skip reason when the shared DataForSEO budget is spent -
 *  health.ts makes it loud when it persists. */
export const BUDGET_SKIP = "keyword data budget used up";

export type ResearchOutcome =
  | { skipped: string }
  | {
      seeds: string[];
      candidates: number;
      dropped: Record<string, number>;
      judged: number;
      added: Array<{ id: string; keyword: string; volume: number; kd: number | null; fit: number }>;
      rejected: number;
      /** The normal filter kept nothing and the one widened pass ran. */
      widened?: boolean;
      costUsd: number;
      dataforseoUsd: number;
    };

/** Prefix of the skip reason when the platform's DAILY DataForSEO ceiling is
 *  reached: temporary by construction (UTC midnight), so never loud. */
export const DAILY_CEILING_SKIP = "DataForSEO ceiling reached; retrying tomorrow";

/**
 * Why the platform-billed keyword data is unavailable to this site right
 * now, or null when it is available (or the site brings its own account, or
 * this is self-host). Shared by research and the scheduler, which checks it
 * BEFORE claiming a slot so a run is never started into a spent budget.
 */
export async function keywordDataBlocked(project: Project): Promise<string | null> {
  if (!isCloudMode() || project.dataforseo_login) return null;
  if (await credsForProject(project)) return null;
  const budget = await platformBudgetGate(project.id);
  if (budget.allowed) return null; // no platform account at all: a setup state, said elsewhere
  return /daily ceiling/i.test(budget.reason) ? DAILY_CEILING_SKIP : `${BUDGET_SKIP} for this month`;
}

/** The quiet preconditions, shared with the scheduler and the MCP tool. */
export async function researchReadiness(project: Project): Promise<{ ready: true } | { ready: false; skipped: string }> {
  if (writerMode(project) !== "hosted") return { ready: false, skipped: "not a hosted project" };
  // Dry run answers every judge question "yes": queuing those as approved
  // ideas on a real site would hand the writer junk. Never in dry run.
  if (isDryRun()) return { ready: false, skipped: "dry run" };
  if (project.writer_paused_at) return { ready: false, skipped: "paused" };
  // Ideas for a site that cannot publish, or a deploy that cannot write, are
  // DataForSEO spend with nothing downstream. The missing-keys case is
  // reported once per cron run by the route, not here per project.
  if (publishRoute(project) === "blocked") return { ready: false, skipped: "setup incomplete: nowhere to publish yet" };
  if (missingCredentials().length) return { ready: false, skipped: "the writer has no model credentials on this deploy" };
  const gate = await planGate(project.id);
  if (!gate.allowed) return { ready: false, skipped: `plan inactive: ${gate.reason}` };
  return { ready: true };
}

export async function runResearch(project: Project, now = new Date()): Promise<ResearchOutcome> {
  const ready = await researchReadiness(project);
  if (!ready.ready) return { skipped: ready.skipped };
  const creds = await credsForProject(project);
  if (!creds) {
    // Told apart from "no source at all": a spent budget is temporary and
    // becomes loud if it lasts (health.ts), a missing source is setup - and
    // the daily ceiling (resets at midnight) apart from the monthly budget
    // (resets on the 1st), because "retrying tomorrow" is only true of one.
    const blocked = await keywordDataBlocked(project);
    return { skipped: blocked ?? "no keyword source" };
  }
  const { profile, fromDb, error: profileError } = await loadSiteProfile(project);
  if (profileError) return { skipped: `could not read the site profile: ${profileError}` };
  if (!fromDb) return { skipped: "no site profile yet" };

  const stamp = () => db().from("projects").update({ last_research_at: now.toISOString() }).eq("id", project.id);

  const { count: approvedCount } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("type", "guide")
    .eq("status", "approved");
  const plan = await projectPlan(project.id);
  const needed = ideasNeeded(approvedCount ?? 0, plan.articlesPerWeek);
  if (needed === 0) {
    await stamp();
    return { skipped: "the idea queue is already full" };
  }

  // Fewer seeds when few ideas are needed: every seed is two Labs calls, and
  // topping a queue up by one idea never needed eight of them.
  const seeds = (await seedsFor(project, profile)).slice(0, Math.min(MAX_SEEDS, 2 + needed));
  if (seeds.length === 0) return { skipped: "nothing to research from yet (the profile has no categories or tags)" };

  // Expand every seed through both Labs endpoints. A seed that fails is
  // skipped, not fatal: one 5xx from DataForSEO must not cost the whole run.
  let dataforseoUsd = 0;
  const raw: Candidate[] = [];
  const failures: string[] = [];
  await Promise.all(
    seeds.flatMap((seed) =>
      [cachedKeywordSuggestions, cachedRelatedKeywords].map(async (fn) => {
        try {
          const r = await fn(seed, creds, LABS_LIMIT, project.location_code, project.language_code);
          dataforseoUsd += r.cost ?? 0;
          raw.push(...r.ideas.map(toCandidate));
        } catch (e) {
          failures.push(`${seed}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    ),
  );
  if (raw.length === 0 && failures.length) {
    // Every call failed: that is a fault worth retrying loudly, not a state.
    throw new Error(`keyword research failed for every seed - ${failures[0]}`);
  }

  const dr = await getDomainRating(project.id, project.domain, creds).catch(() => null);
  // The auto-approve ceiling, not the "propose and ask" one: nobody approves
  // anything on a hosted site, so only keywords research would have approved
  // on its own may land approved. Unknown DR reads as DR 0 (kd-zones does).
  const kdCeiling = kdZones(dr?.dr ?? null).autoApprove;
  const existing = await existingTopics(project.id);
  const filterCtx = {
    kdCeiling,
    languageCode: project.language_code,
    blockedTopics: blockedTopicsOf(project),
    takenKeywords: existing.keywords,
    existingTexts: existing.texts,
  };
  let { kept, dropped } = filterCandidates(raw, filterCtx);
  // Nothing survived the normal bar: widen ONCE (math.ts WIDEN_*). Same raw
  // rows, no extra DataForSEO call - only the two thresholds move.
  let widened = false;
  if (kept.length === 0 && raw.length > 0) {
    ({ kept, dropped } = filterCandidates(raw, { ...filterCtx, kdCeiling: kdCeiling + WIDEN_KD_BY, minVolume: WIDEN_MIN_VOLUME }));
    widened = true;
  }

  // Judge best-first in Jev-sized batches; stop as soon as enough passed.
  const passed: Array<Candidate & JudgedCandidate> = [];
  const failedJudge: Array<Candidate & JudgedCandidate> = [];
  let costUsd = 0;
  let judged = 0;
  const pool = kept.slice(0, MAX_JUDGED);
  for (let i = 0; i < pool.length && passed.length < needed; i += CANDIDATES_PER_CALL) {
    const batch = pool.slice(i, i + CANDIDATES_PER_CALL);
    const verdicts = await judgeCandidates(project, profile, batch);
    costUsd += verdicts.costUsd;
    judged += batch.length;
    batch.forEach((c, j) => {
      const v = verdicts.results[j];
      if (v && passesJudge(v)) passed.push({ ...c, ...v });
      else if (v) failedJudge.push({ ...c, ...v });
    });
  }

  const added: Array<{ id: string; keyword: string; volume: number; kd: number | null; fit: number }> = [];
  for (const c of passed.slice(0, needed)) {
    const { data, error } = await db()
      .from("suggestions")
      .insert({
        project_id: project.id,
        type: "guide",
        status: "approved",
        title: sentenceTitle(c.keyword),
        primary_keyword: c.keyword,
        keyword_volume: c.volume,
        keyword_difficulty: c.kd,
        rationale: `autopilot research: fit ${c.fit.toFixed(2)}, volume ${c.volume}, KD ${c.kd ?? "?"}`,
        source: "autopilot",
        spec: { intent: c.intent },
        decided_at: now.toISOString(),
      })
      .select("id")
      .maybeSingle();
    // The unique index on live keywords is the race backstop: another run
    // queued it first, which is the outcome we wanted anyway.
    if (error) {
      if (isDuplicateKeyError(error)) continue;
      throw new Error(`could not queue "${c.keyword}": ${error.message}`);
    }
    added.push({ id: (data as { id: string }).id, keyword: c.keyword, volume: c.volume, kd: c.kd, fit: Math.round(c.fit * 100) / 100 });
  }

  // NOT tracked for rank checks here (audit 2026-10-24, cost): a queued idea
  // has no page, and a weekly paid SERP check of a keyword the site has not
  // published for is money that buys "not ranking" every Monday. The keyword
  // is tracked the moment its article goes live (autopilot/tracking.ts,
  // called from the publish success paths).
  // Judged-and-refused keywords are kept as rejected ideas so the next run
  // excludes them (existingTopics reads every status) instead of paying Jev
  // to refuse them again every week. Rejected rows sit outside the live-
  // keyword unique index, so they never block a later owner suggestion.
  let rejected = 0;
  if (failedJudge.length) {
    const { error } = await db()
      .from("suggestions")
      .insert(
        failedJudge.map((c) => ({
          project_id: project.id,
          type: "guide",
          status: "rejected",
          title: sentenceTitle(c.keyword),
          primary_keyword: c.keyword,
          keyword_volume: c.volume,
          keyword_difficulty: c.kd,
          rationale: `autopilot research rejected: ${rejectionReason(c)}`,
          source: "autopilot",
          spec: { intent: c.intent },
          decided_at: now.toISOString(),
        })),
      );
    if (error) console.warn(`[autopilot] rejected ideas not stored for ${project.slug}: ${error.message}`);
    else rejected = failedJudge.length;
  }

  await stamp();
  return {
    seeds,
    candidates: raw.length,
    dropped: { ...dropped, ...(failures.length ? { seed_failures: failures.length } : {}) },
    ...(widened ? { widened: true } : {}),
    judged,
    added,
    rejected,
    costUsd: Math.round(costUsd * 10_000) / 10_000,
    dataforseoUsd: Math.round(dataforseoUsd * 10_000) / 10_000,
  };
}

function rejectionReason(c: JudgedCandidate): string {
  const why: string[] = [];
  if (c.fit < FIT_MIN) why.push(`fit ${c.fit.toFixed(2)} (needs ${FIT_MIN})`);
  if (c.intent !== "informational" && c.intent !== "commercial") why.push(`${c.intent ?? "unclear"} intent`);
  if (c.evergreen < EVERGREEN_MIN) why.push(`not evergreen (${c.evergreen.toFixed(2)})`);
  return why.join(", ") || "did not pass the judge";
}

function toCandidate(i: KeywordIdea): Candidate {
  return {
    keyword: i.keyword,
    volume: i.search_volume ?? 0,
    kd: i.keyword_difficulty,
    detectedLanguage: i.detected_language,
    isAnotherLanguage: i.is_another_language,
  };
}

/** "what is X" / "מה זה X" / "qué es X" ... -> "X". Longest match first. */
const QUESTION_LEADS = [
  "what is the", "what are the", "what is a", "what is an", "what is", "what are", "how to", "how do i", "how does", "why is", "why do",
  "מה זה", "מה זאת", "מהו", "מהי", "איך", "למה", "מה הם",
  "qué es", "que es", "qué son", "cómo", "como", "por qué",
  "was ist", "was sind", "wie", "warum",
  "qu'est-ce que", "qu'est-ce qu'", "c'est quoi", "comment", "pourquoi",
  "cos'è", "cosa è", "cosa sono", "come",
  "o que é", "o que são", "como",
  "wat is", "wat zijn", "hoe",
  "что такое", "как", "почему",
  "什么是", "怎么", "为什么",
  "とは", "なぜ",
  "คืออะไร", "ทำไม",
];
export function stripQuestionLead(keyword: string | null | undefined): string {
  let k = (keyword ?? "").trim().replace(/[?？]+$/, "").trim();
  for (let i = 0; i < 2; i++) {
    const lower = k.toLowerCase();
    const lead = QUESTION_LEADS.find((q) => lower === q || lower.startsWith(q + " ") || (q.endsWith("'") && lower.startsWith(q)));
    if (!lead) break;
    k = k.slice(lead.length).trim();
  }
  // "X とは" / "X คืออะไร": the lead sits at the end in these languages.
  k = k.replace(/\s*(とは|คืออะไร)\s*$/u, "").trim();
  return k;
}

async function seedsFor(project: Project, profile: SiteProfile): Promise<string[]> {
  const [gscRes, approvedRes, trackedRes] = await Promise.all([
    db().from("gsc_stats").select("top_queries").eq("project_id", project.id).order("date", { ascending: false }).limit(1).maybeSingle(),
    db()
      .from("suggestions")
      .select("primary_keyword, keyword_volume")
      .eq("project_id", project.id)
      .eq("type", "guide")
      .in("status", ["approved", "in_progress", "done"])
      .not("primary_keyword", "is", null)
      .order("keyword_volume", { ascending: false, nullsFirst: false })
      .limit(3),
    // The site's own tracked keywords: its target list, in its own language.
    // Paperbot's profile tags are English ("document management") while its
    // market is Hebrew, so Labs answered with English heads in Israel and the
    // research found nothing; its tracked keywords ("איסוף מסמכים מלקוחות")
    // are the topics it exists for.
    db()
      .from("keywords")
      .select("keyword, search_volume")
      .eq("project_id", project.id)
      .eq("status", "tracking")
      .order("search_volume", { ascending: false, nullsFirst: false })
      .limit(4),
  ]);
  const queries = (((gscRes.data as { top_queries: { query: string; impressions: number }[] | null } | null)?.top_queries ?? []) as { query: string; impressions: number }[])
    .slice()
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 3)
    .map((q) => q.query);
  // A "head" is the keyword's first two words: "crm for startups 2026" seeds
  // "crm for", which Labs expands far wider than the full phrase would. A
  // leading "what is" is not a head: "what is automation" would seed "what
  // is", and Labs answers with every "what is X" in the country (Paperbot's
  // first research: 46 candidates, 45 off-topic). The question words come
  // off first, in the languages the writer serves.
  const heads = ((approvedRes.data ?? []) as { primary_keyword: string }[])
    .map((r) => stripQuestionLead(r.primary_keyword).split(/\s+/).filter(Boolean).slice(0, 2).join(" "))
    .filter((h) => h.length >= 3);
  // What the site is seen for comes first: it is the strongest evidence of
  // what Google already trusts it on.
  // One-word profile tags and categories ("guides", "tips", "software") seed
  // Labs with the whole language's head terms - thousands of rows for any
  // site, none of them winnable - so they are dropped unless the word is the
  // site's own (its name or domain label: "notion" on notion.so is a real
  // seed). Search Console queries and queued heads keep one-word seeds: they
  // are evidence, not guesses.
  const siteTerms = new Set(
    [profile.name, project.domain.replace(/^www\./, "").split(".")[0]]
      .flatMap((t) => normalizeKeyword(t ?? "").split(" "))
      .filter((t) => t.length >= 3),
  );
  const profileSeeds = [...profile.categories, ...profile.tags].filter((t) => {
    const words = normalizeKeyword(t ?? "").split(" ").filter(Boolean);
    return words.length > 1 || words.some((w) => siteTerms.has(w));
  });
  const tracked = ((trackedRes.data ?? []) as { keyword: string }[]).map((r) => r.keyword);
  const ordered = [...queries, ...tracked, ...profile.categories.filter((c) => profileSeeds.includes(c)), ...heads, ...profile.tags.filter((t) => profileSeeds.includes(t))];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of ordered) {
    // Hyphen and space variants are one seed ("e-commerce" / "e commerce" /
    // "ecommerce" would buy the same Labs rows three times).
    const k = normalizeKeyword((s ?? "").replace(/[-_]+/g, " "));
    const variant = k.replace(/\s+/g, "");
    if (k.length < 3 || seen.has(k) || seen.has(variant)) continue;
    seen.add(variant);
    // A Search Console query can be a whole pasted error message ("autocompact
    // is thrashing: the context refilled…", 40 words, real impressions). Labs
    // expands a head term, not a sentence: anything over six words is skipped.
    if (k.split(" ").length > 6) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= MAX_SEEDS) break;
  }
  return out;
}

/** Everything the site already has or queued, as normalized keywords (for
 *  the exact check) and raw titles/keywords (for the near-duplicate check). */
async function existingTopics(projectId: string): Promise<{ keywords: Set<string>; texts: string[] }> {
  const [sugg, pages, drafts] = await Promise.all([
    db().from("suggestions").select("title, primary_keyword").eq("project_id", projectId).eq("type", "guide").limit(2000),
    db().from("pages").select("title, primary_keyword").eq("project_id", projectId).limit(2000),
    db().from("article_drafts").select("title, primary_keyword").eq("project_id", projectId).neq("status", "discarded").limit(2000),
  ]);
  const keywords = new Set<string>();
  const texts: string[] = [];
  for (const res of [sugg, pages, drafts]) {
    for (const r of (res.data ?? []) as { title: string | null; primary_keyword: string | null }[]) {
      if (r.primary_keyword) {
        keywords.add(normalizeKeyword(r.primary_keyword));
        texts.push(r.primary_keyword);
      }
      if (r.title) texts.push(r.title);
    }
  }
  return { keywords, texts };
}

/**
 * Ask the judge about up to 13 candidates in one call (3 questions each).
 * Exported for suggestTopic, which runs the owner's topic through the same
 * gate with a batch of one.
 */
export async function judgeCandidates(
  project: Project,
  profile: SiteProfile,
  batch: Array<Pick<Candidate, "keyword" | "volume" | "kd">>,
): Promise<{ results: Array<JudgedCandidate | null>; costUsd: number }> {
  if (batch.length === 0) return { results: [], costUsd: 0 };
  const questions: Record<string, Question> = {};
  batch.forEach((c, i) => {
    questions[`fit_${i}`] = {
      type: "noul",
      instructions: `Candidate ${i} ("${c.keyword}"): a reader of this site would search this, and the site can credibly answer it with an article.`,
      criteria: { true: "on the site's subject and within what it can speak to", false: "off-topic, or something the site has no standing to answer" },
    };
    questions[`intent_${i}`] = {
      type: "choice",
      instructions: `Candidate ${i} ("${c.keyword}"): what does the person searching this want?`,
      criteria: {
        informational: "to learn or understand something",
        commercial: "to compare or evaluate options before deciding",
        transactional: "to buy, sign up or download right now",
        navigational: "to reach one specific site or page",
      },
    };
    questions[`evergreen_${i}`] = {
      type: "noul",
      instructions: `Candidate ${i} ("${c.keyword}"): people will still search this a year from now (not a passing news event or a dated version).`,
    };
  });
  const verdict = await judge({
    projectId: project.id,
    runId: null,
    state: {
      site: { name: profile.name, url: profile.url, about: profile.short, details: profile.long, categories: profile.categories },
      candidates: batch.map((c, i) => ({ id: i, keyword: c.keyword, monthly_searches: c.volume, difficulty: c.kd })),
    },
    questions,
    dry: () => {
      const a: Record<string, Answer> = {};
      batch.forEach((_, i) => {
        a[`fit_${i}`] = { type: "noul", noul: 0.82 };
        a[`intent_${i}`] = { type: "choice", choice: "informational", confidence: 0.9, probabilities: { informational: 0.9, commercial: 0.1 } };
        a[`evergreen_${i}`] = { type: "noul", noul: 0.8 };
      });
      return a;
    },
  });
  const num = (a: Answer | undefined) => (a?.type === "noul" ? a.noul : 0);
  return {
    costUsd: verdict.costUsd,
    results: batch.map((_, i) => ({
      fit: num(verdict.answers[`fit_${i}`]),
      intent: choiceOf(verdict.answers[`intent_${i}`]),
      evergreen: num(verdict.answers[`evergreen_${i}`]),
    })),
  };
}

import { timingSafeEqual } from "node:crypto";
import { db } from "./db";

// The tenant axis. Every operational table carries a project_id; this module
// is the single place that resolves "which project" for the three entry
// points: the dashboard (cookie -> getActiveProject in active-project.ts),
// the MCP server (bearer token -> getProjectByToken), and the crons
// (listProjects loop).

export type Project = {
  id: string;
  slug: string;
  name: string;
  domain: string; // bare domain, e.g. clockedcode.com
  gsc_site_url: string | null; // GSC property (sc-domain:... or https://...)
  github_repo: string | null; // owner/repo content PRs land in
  // Onboarding's "does the site have a blog?" answer (migration 0017) - a
  // HINT the setup workflow reconciles against the actual repo (the repo
  // wins on conflict, and a second content system is never created).
  // 'existing' = yes (content_path_hint optionally says where), 'create' =
  // scaffold one during setup, 'detect' = agent inspects and decides.
  content_mode: "existing" | "create" | "detect";
  content_path_hint: string | null;
  // Free-tier DIY: each project brings its own DataForSEO account. Null =
  // not connected; only the default project falls back to the env creds
  // (see credsForProject in dataforseo.ts).
  dataforseo_login: string | null;
  dataforseo_password: string | null;
  // Where keyword/rank data comes from - the onboarding wizard's choice.
  // 'dataforseo' = paid; 'serpapi' = free BYO key; 'gsc' = Search Console only.
  keyword_source: "dataforseo" | "serpapi" | "gsc";
  serpapi_key: string | null; // encrypted at rest, like dataforseo_password
  powerups_skipped: string[]; // wizard power-ups the user unchecked
  location_code: number; // DataForSEO market
  language_code: string;
  // 'semi'/'auto' mean their preset regardless of the flag columns below;
  // 'custom' means the five automation flags are the source of truth. Use
  // effectiveAutomations() instead of reading either directly.
  mode: "semi" | "auto" | "custom";
  auto_approve: boolean;
  auto_approve_tools: boolean;
  auto_build_guides: boolean;
  auto_build_tools: boolean;
  auto_merge: boolean;
  // When the trend scan last ran (stamped by the record_trend_scan MCP tool);
  // shown on the Trend radar. The scan itself is manual-only - the dashboard's
  // Scan now button is the only trigger, and every find waits as pending
  // (approve-idea-first, like tools), so there is no auto_trend flag. The
  // 0013 auto_trend column stays in the DB, unread.
  last_trend_scan_at: string | null;
  // When the SITE went live (not when it joined DispatchSEO) - feeds the
  // site-age readout (Journey, pacing.ts's siteAgeDays). Backfilled from
  // created_at by migration 0015; owner-correctable on Settings.
  site_launched_at: string | null;
  // Stamped by the mark_pipeline_installed MCP tool (the install workflow's
  // final step, migration 0018); the Home install card flips green on it.
  pipeline_installed_at: string | null;
  // Owner content preferences (migration 0019) - raw JSONB; always read it
  // through normalizeContentPrefs (content-prefs.ts), never directly.
  content_prefs: unknown;
  // Google OAuth refresh token from the Connect GSC button (migration 0023),
  // encrypted like serpapi_key. Null = not connected; the service-account
  // path in gsc.ts works regardless.
  gsc_oauth_refresh_token: string | null;
  // GitHub App installation (migration 0034, cloud onboarding). Null = the
  // App is not installed for this project; github.ts then falls back to the
  // instance-wide merge token.
  github_installation_id: number | null;
  github_app_installed_at: string | null;
  // Agent-reported install-step stamps (migration 0036): { step: ISO-8601 },
  // merged by the mark_install_step MCP tool and read by the onboarding
  // finale's live checklist + collapse. MUST be in COLS - the read path is the
  // whole point of the write. NOT NULL DEFAULT '{}', so real rows always have it.
  install_progress: Record<string, string>;
  // The wizard screen the owner last stood on (migration 0030) - written by
  // setWizardScreen as the wizard advances, stamped server-side at creation
  // (c1/s1) and at the cloud finale (c5, in runPipelineInstall). Null only on
  // rows that predate screen persistence. onboarding-gate keys the cloud
  // dashboard unlock on this: the finale, not "a repo got connected".
  onboarding_screen: string | null;
  // mark_pipeline_installed's verifyPipelinePrereqs outcome (migration 0040) -
  // null on rows from before this column existed, or when github_repo was
  // empty at stamp time. false means the stamp went through on the agent's
  // word alone (typically: no merge/dispatch token configured, so nothing
  // GitHub-side could actually be checked) - see pipeline_installed_at above.
  pipeline_verified: boolean | null;
  // The cloud tenant who owns this project (migration 0031). Null on self-host
  // and on the operator's own pre-cloud rows - which is load-bearing, not
  // incidental: "has an owner" is what distinguishes a CUSTOMER's project from
  // the operator's, and gsc.ts uses exactly that to decide whether the shared
  // service account may be used for it.
  owner_user_id: string | null;
  // Which coding agent drives this project's builders (migration 0044).
  // NULLABLE, and never to be read directly: it is absent both on a database
  // that hasn't run 0044 and on the COLS_PRE_0044 fallback tier, where the
  // cast would leave it undefined behind a non-optional type. Read it through
  // projectAgent() in @/lib/agents, which resolves absence to Claude - true by
  // construction, since the column only exists because a second agent does.
  agent: string | null;
  // Opt-in: may the guide builder EDIT already-published posts to add internal
  // links back to a new guide (migration 0045)? Every other builder behaviour
  // is additive, so this is the one flag that governs touching content the
  // owner already shipped - it defaults false and is deliberately NOT part of
  // the semi/auto/custom presets, because "how much do I automate" and "may
  // you rewrite my published pages" are different questions.
  // NULLABLE for the same reason as `agent`: absent both on a DB that hasn't
  // run 0045 and on the COLS_PRE_0045 fallback tier. Read it through
  // internalLinkingEnabled() below, which resolves absence to OFF.
  internal_linking: boolean | null;

  // --- Where this site's content goes, and how we get in (migration 0055) ---
  //
  // Every field here is NULLABLE for the same reason as `agent` and
  // `internal_linking`: absent both on a DB that hasn't run 0055 and on the
  // COLS_PRE_0055 fallback tier. Read publish_target through publishTarget()
  // below, which resolves absence to "github" - what every project was before
  // WordPress existed.
  publish_target: string | null;
  wp_url: string | null;
  wp_username: string | null;
  /** Encrypted (src/lib/crypto.ts). Never render, log, or return this. */
  wp_app_password: string | null;
  wp_connected_at: string | null;
  wp_seo_plugin: string | null;
  /** What the connected WordPress user may do, captured at connect time:
   *  { edit_posts, publish_posts, upload_files, edit_others_posts }. */
  wp_capabilities: Record<string, boolean> | null;
  /** Site-local hour (0-23) a finished draft is flipped live. Null = default. */
  publish_hour: number | null;

  // --- The adaptive wizard (migration 0060) ---
  //
  // Both NULLABLE for the same reason as the 0055 set: absent on a DB that
  // hasn't run 0060 and on the COLS_PRE_0060 fallback tier.
  /** Which AI the owner said will write - a qualifier id (claude-web, chatgpt,
   *  claude-code, codex, cursor; src/lib/qualifier-options.ts). Null = never
   *  said. Distinct from `agent`, which is the coding agent the repo builders
   *  run and has no value for a chat app. */
  ai_choice: string | null;
  /** Last MCP request that arrived with ?client=chat - the "Connected" light
   *  for the Claude/ChatGPT app, stamped at most every ten minutes. */
  chat_last_seen_at: string | null;

  // --- The setup path (migration 0062) ---
  //
  // Absent on a DB that hasn't run 0062 and on the COLS_PRE_0062 fallback tier.
  /** Last MCP request from a coding agent - the "agent connected" light,
   *  mirror of chat_last_seen_at. */
  agent_last_seen_at: string | null;
  /** When the coding agent's repo credential was saved (or first seen). */
  agent_credential_at: string | null;
  /** When the connect phase of the setup path finished. Null = still in it. */
  setup_connected_at: string | null;
  /** Setup-path step ids the owner parked with "I'll do this later". */
  setup_deferred: string[];

  created_at: string;
};

/** Where a project's articles go. Absence - a DB pre-0055, the COLS_PRE_0055
 *  fallback tier, or a project that never connected anything - resolves to
 *  "github", which is what every project was before WordPress and the only
 *  answer that cannot publish somewhere the owner did not intend. */
export function publishTarget(p: Pick<Project, "publish_target">): "github" | "wordpress" | "manual" {
  const t = p.publish_target;
  return t === "wordpress" || t === "manual" ? t : "github";
}

// The five automations a project owner can toggle (migrations 0011 + 0028).
// Locked automations - weekly research, rank checks, GSC snapshots, tool
// validation, IndexNow - deliberately have no flags: they collect data or gate
// safety and publish nothing by themselves.
export type AutomationFlags = {
  auto_approve: boolean; // guide ideas (research runs)
  auto_approve_tools: boolean; // tool ideas - split out because tools are new code pages
  auto_build_guides: boolean;
  auto_build_tools: boolean;
  auto_merge: boolean;
};

export const SEMI_PRESET: AutomationFlags = {
  auto_approve: false, // researched ideas wait for the owner
  auto_approve_tools: false,
  auto_build_guides: true, // approved work still builds itself
  auto_build_tools: true,
  auto_merge: false, // the owner clicks Merge
};

export const AUTO_PRESET: AutomationFlags = {
  auto_approve: true,
  auto_approve_tools: true,
  auto_build_guides: true,
  auto_build_tools: true,
  auto_merge: true,
};

// What actually runs for this project, whatever the mode label says.
export function effectiveAutomations(p: Project): AutomationFlags {
  if (p.mode === "semi") return SEMI_PRESET;
  if (p.mode === "auto") return AUTO_PRESET;
  return {
    auto_approve: p.auto_approve,
    // Pre-0028 rows come back undefined - read as true (the column default)
    // so a custom-mode project keeps today's behavior until the migration runs.
    auto_approve_tools: p.auto_approve_tools ?? true,
    auto_build_guides: p.auto_build_guides,
    auto_build_tools: p.auto_build_tools,
    auto_merge: p.auto_merge,
  };
}

// May the guide builder edit already-published posts to link back to a new
// guide? Deliberately NOT part of effectiveAutomations: the semi/auto/custom
// presets answer "how much do I automate", and flipping a project to Auto must
// never silently grant permission to rewrite pages the owner already shipped.
// Absence (a DB pre-0045, or the COLS_PRE_0045 fallback tier) resolves to OFF -
// the conservative direction, and the only safe one for a capability whose
// blast radius is live content.
export function internalLinkingEnabled(p: Project): boolean {
  return p.internal_linking === true;
}

// A flag set that exactly matches a preset IS that preset - "custom" is only
// the leftover state, never something the user picks directly.
export function modeForFlags(flags: AutomationFlags): "semi" | "auto" | "custom" {
  const same = (a: AutomationFlags, b: AutomationFlags) =>
    a.auto_approve === b.auto_approve &&
    a.auto_approve_tools === b.auto_approve_tools &&
    a.auto_build_guides === b.auto_build_guides &&
    a.auto_build_tools === b.auto_build_tools &&
    a.auto_merge === b.auto_merge;
  if (same(flags, AUTO_PRESET)) return "auto";
  if (same(flags, SEMI_PRESET)) return "semi";
  return "custom";
}

export const DEFAULT_PROJECT_SLUG = "clockedcode";
// Fixed id from migration 0004 - also the column default on every table, so
// writes from pre-projects code keep landing on ClockedCode.
export const DEFAULT_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
// The slug the SYNTHETIC env-fallback project answers to. Not the seeded row's
// slug: the fallback is a stand-in that exists precisely when no row can be
// read, so it names itself neutrally. Shared with getProjectBySlug because the
// dashboard hands this slug straight back to every server action.
const FALLBACK_PROJECT_SLUG = "default";

// mcp_token deliberately excluded - only fetchProjectToken exposes it.
const COLS =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, pipeline_verified, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, agent, internal_linking, publish_target, wp_url, wp_username, wp_app_password, wp_connected_at, wp_seo_plugin, wp_capabilities, publish_hour, ai_choice, chat_last_seen_at, agent_last_seen_at, agent_credential_at, setup_connected_at, setup_deferred, created_at";

// COLS minus 0062's setup-path columns, for a DB that hasn't run that migration
// yet. Newest columns, so they are the FIRST thing dropped - a DB lagging only
// 0062 keeps everything else and simply reads as "no agent seen, nothing
// parked, connect phase not stamped".
const COLS_PRE_0062 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, pipeline_verified, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, agent, internal_linking, publish_target, wp_url, wp_username, wp_app_password, wp_connected_at, wp_seo_plugin, wp_capabilities, publish_hour, ai_choice, chat_last_seen_at, created_at";

// COLS minus 0060's ai_choice + chat_last_seen_at, for a DB that hasn't run
// that migration yet. Newest columns, so they are the FIRST thing dropped - a
// DB lagging only 0060 keeps everything else and simply reads as "the owner
// never said which AI" and "no chat app seen yet", both of which every
// consumer already treats as the neutral default.
const COLS_PRE_0060 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, pipeline_verified, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, agent, internal_linking, publish_target, wp_url, wp_username, wp_app_password, wp_connected_at, wp_seo_plugin, wp_capabilities, publish_hour, created_at";

// COLS minus 0055's WordPress publishing columns, for a DB that hasn't run
// that migration yet. Newest columns, so they are the FIRST thing dropped - a
// DB lagging only 0055 keeps everything else and simply reads as "this project
// publishes through GitHub", which is what every project was before WordPress
// existed and is the safe default for any project that has not connected one.
const COLS_PRE_0055 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, pipeline_verified, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, agent, internal_linking, created_at";

// COLS minus 0045's internal_linking, for a DB that hasn't run that migration
// yet. Newest column, so it is the FIRST thing dropped - a DB lagging only
// 0045 keeps everything else and simply reads as "back-linking off", which is
// the safe default anyway.
const COLS_PRE_0045 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, pipeline_verified, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, agent, created_at";

// COLS minus 0044's agent, for a DB that hasn't run that migration yet.
// Newest column, so it is the FIRST thing dropped - a DB lagging only 0044
// keeps everything else and simply reads as an all-Claude install, which is
// exactly what it is.
const COLS_PRE_0044 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, pipeline_verified, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, created_at";

// COLS minus 0040's pipeline_verified, for a DB that hasn't run that
// migration yet. A distinct tier so a DB missing only 0040 keeps
// install_progress et al; falls back further only if that still 404s.
const COLS_PRE_0040 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, install_progress, onboarding_screen, owner_user_id, created_at";

// COLS minus 0036's install_progress, for a DB that hasn't run that migration
// yet (migrations are applied manually, so code can reach prod first). A
// distinct tier from COLS_PRE_0028 so a DB that HAS 0028/0034 but not 0036
// degrades only the finale's install checklist, never github_installation_id.
const COLS_PRE_0036 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, content_prefs, gsc_oauth_refresh_token, github_installation_id, github_app_installed_at, onboarding_screen, owner_user_id, created_at";

// COLS minus 0028's auto_approve_tools, for databases where that migration
// hasn't run yet (migrations are applied manually, so code can reach prod
// first). Selecting the new column unconditionally errored EVERY projects
// query on such a database - per-project MCP tokens 401'd and crons collapsed
// to the env-fallback project (2026-07-21 deploy check caught it live).
const COLS_PRE_0028 =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, content_prefs, gsc_oauth_refresh_token, created_at";

// Every projects select goes through this: try the full column list, and if
// the database says a column doesn't exist (a pending migration), retry with
// the pre-migration list - effectiveAutomations defaults the missing flag, so
// rows stay coherent. A pending migration must degrade one toggle, never gate
// the whole tenant axis.
async function selectProjects<T>(
  run: (cols: string) => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const missingCol = (e: { message: string } | null) =>
    Boolean(e && e.message.includes("does not exist"));
  const first = await run(COLS);
  if (!missingCol(first.error)) return first;
  // Drop the newest columns (0062's setup-path set) first.
  const pathless = await run(COLS_PRE_0062);
  if (!missingCol(pathless.error)) return pathless;
  // Then 0060's wizard pair.
  const choiceless = await run(COLS_PRE_0060);
  if (!missingCol(choiceless.error)) return choiceless;
  // Then 0055's WordPress publishing set, so a DB
  // that lags 0055 alone keeps everything else and simply reads as "publishes
  // through GitHub" - which is what every project was before WordPress, and
  // the safe answer for any project that has not connected one.
  const wpless = await run(COLS_PRE_0055);
  if (!missingCol(wpless.error)) return wpless;
  // Then 0045's internal_linking, so a DB that lags 0045 too keeps everything
  // else and simply reads as back-linking-off.
  const linkless = await run(COLS_PRE_0045);
  if (!missingCol(linkless.error)) return linkless;
  // Then 0044's agent, so a DB that lags 0044 too keeps everything else and
  // simply reads as all-Claude.
  const agentless = await run(COLS_PRE_0044);
  if (!missingCol(agentless.error)) return agentless;
  // Then 0040, same reasoning one tier down; fall back further only if that
  // still 404s.
  const second = await run(COLS_PRE_0040);
  if (!missingCol(second.error)) return second;
  const third = await run(COLS_PRE_0036);
  if (!missingCol(third.error)) return third;
  return run(COLS_PRE_0028);
}

// Until migration 0004 runs, the projects table doesn't exist. Synthesizing a
// project from env keeps the deployed dashboard working in that window - the
// same tolerance pattern site_profile and playbook_status use. Mirrors the
// NEUTRAL 0004 seed row: this object can surface in ANY install's dashboard
// during a DB error, so nothing here may carry another site's branding -
// site facts come only from env (domain is derived from GSC_SITE_URL).
function envFallbackProject(): Project {
  const gscSiteUrl = process.env.GSC_SITE_URL ?? null;
  return {
    id: DEFAULT_PROJECT_ID,
    slug: FALLBACK_PROJECT_SLUG,
    name: "Your site",
    domain: gscSiteUrl?.replace(/^(sc-domain:|https?:\/\/)/, "").replace(/\/+$/, "") ?? "",
    gsc_site_url: gscSiteUrl,
    github_repo: process.env.SEO_TARGET_REPO ?? null,
    content_mode: "detect",
    content_path_hint: null,
    dataforseo_login: null,
    dataforseo_password: null,
    keyword_source: "dataforseo",
    serpapi_key: null,
    powerups_skipped: [],
    location_code: 2840,
    language_code: "en",
    mode: "auto",
    auto_approve: true,
    auto_approve_tools: true,
    auto_build_guides: true,
    auto_build_tools: true,
    auto_merge: true,
    last_trend_scan_at: null,
    site_launched_at: null,
    pipeline_installed_at: null,
    pipeline_verified: null,
    content_prefs: {},
    gsc_oauth_refresh_token: null,
    github_installation_id: null,
    github_app_installed_at: null,
    install_progress: {},
    // Null = grandfathered in onboarding-gate, so a DB outage that surfaces
    // this synthetic row still fails OPEN and never locks the owner out.
    onboarding_screen: null,
    // Ownerless on purpose: this synthetic row stands in for the OPERATOR's
    // env-backed project, never a tenant's, so it keeps service-account access
    // (see gscClientForProject).
    owner_user_id: null,
    // Null, not "claude": this synthetic row stands in during a DB error, and
    // projectAgent() already resolves null to Claude. Asserting a choice here
    // would claim the owner made one.
    agent: null,
    // Null, resolving to OFF. This synthetic row appears during a DB error, and
    // "we couldn't read your settings" must never be the reason an agent starts
    // editing already-published pages.
    internal_linking: null,
    // The env-backed operator project publishes the way it always has. This
    // synthetic row stands in during a DB error, and "we couldn't read your
    // settings" must never be the reason an article is posted to a WordPress
    // site - or to anywhere else the owner didn't choose.
    publish_target: "github",
    wp_url: null,
    wp_username: null,
    wp_app_password: null,
    wp_connected_at: null,
    wp_seo_plugin: null,
    wp_capabilities: null,
    publish_hour: null,
    // Never said, never seen: this synthetic row stands in during a DB error
    // and must not claim the owner made a choice or that a chat app connected.
    ai_choice: null,
    chat_last_seen_at: null,
    // No agent seen, no credential, connect phase unstamped, nothing parked.
    agent_last_seen_at: null,
    agent_credential_at: null,
    setup_connected_at: null,
    setup_deferred: [],
    created_at: new Date(0).toISOString(),
  };
}

// Result-returning variant for callers that must treat a real DB failure as an
// ERROR rather than silently running the synthetic fallback (the crons +
// deploy-check). `degraded` is non-null ONLY when the projects query failed for
// a NON-schema reason (a transient blip / outage) - meaning we fell back to the
// synthetic default project and may be SKIPPING real tenants. A genuinely-
// absent table (pre-0004) returns degraded:null with the fallback, because that
// IS the correct answer during first-boot, before migration 0004 runs.
export async function listProjectsChecked(): Promise<{
  projects: Project[];
  degraded: string | null;
}> {
  const { data, error } = await selectProjects((cols) =>
    db().from("projects").select(cols).order("created_at", { ascending: true }),
  );
  if (error) {
    if (/does not exist|could not find|PGRST205|42P01/i.test(error.message)) {
      return { projects: [envFallbackProject()], degraded: null };
    }
    console.error(
      `[projects] listProjects collapsed to the synthetic fallback on a non-schema error: ${error.message}`,
    );
    return { projects: [envFallbackProject()], degraded: error.message };
  }
  if (!data || data.length === 0) return { projects: [envFallbackProject()], degraded: null };
  return { projects: data as unknown as Project[], degraded: null };
}

// The tolerant array form every non-cron caller uses (dashboard layout,
// active-project): never throws, always returns at least the synthetic fallback
// so the UI keeps working through first-boot or a hiccup. Crons that need to
// alert on a collapse use listProjectsChecked() instead.
export async function listProjects(): Promise<Project[]> {
  return (await listProjectsChecked()).projects;
}

// CLOUD_MODE only: the projects one signed-in user owns (0031). No synthetic
// fallback - a fresh account genuinely has zero projects, and the dashboard
// funnels that to the onboarding wizard. Requires migration 0031; a missing
// column comes back as an empty list, never a cross-tenant leak.
export async function listProjectsForOwner(userId: string): Promise<Project[]> {
  return (await listProjectsForOwnerChecked(userId)).projects;
}

// The checked form, mirroring listProjectsChecked: "this account owns nothing"
// and "we could not read this account" are DIFFERENT ANSWERS, and collapsing
// them into [] was a customer-facing lie. A single transient read error on a
// paying customer with a live site sent them to /onboarding, and if the
// subscriptions read blipped too, on to /plans - the pricing page - as though
// they had never signed up. The crons have had this distinction since 0004;
// the cloud read path was the one place still throwing it away.
//
// A genuinely absent column/table (pre-0031) is NOT degraded: that is the
// correct "no projects" answer during first boot, exactly as in
// listProjectsChecked.
export async function listProjectsForOwnerChecked(
  userId: string,
): Promise<{ projects: Project[]; degraded: string | null }> {
  const { data, error } = await selectProjects((cols) =>
    db()
      .from("projects")
      .select(cols)
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true }),
  );
  if (error) {
    if (/does not exist|could not find|PGRST205|42P01/i.test(error.message)) {
      return { projects: [], degraded: null };
    }
    console.error(
      `[projects] listProjectsForOwner failed for ${userId} on a non-schema error: ${error.message}`,
    );
    return { projects: [], degraded: error.message };
  }
  return { projects: (data ?? []) as unknown as Project[], degraded: null };
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { data, error } = await selectProjects((cols) =>
    db().from("projects").select(cols).eq("slug", slug).maybeSingle(),
  );
  if (data) return data as unknown as Project;
  // The synthetic project's OWN slug has to resolve back to it, or the state
  // the fallback exists to survive is half-broken: the dashboard renders fine
  // off envFallbackProject() while every server action that takes a slug -
  // setAgent, setProjectMode, setAutomationToggle, setInternalLinking,
  // getAgentCredentialStatuses - throws "Unknown project." on the slug the
  // page just handed it. Only ever reached when the real row is missing, so a
  // genuine project named "default" still wins above.
  if (slug === FALLBACK_PROJECT_SLUG) return envFallbackProject();
  // No row and no error is a real miss for anything else; only the seeded
  // default keeps the older read-failed tolerance.
  return error && slug === DEFAULT_PROJECT_SLUG ? envFallbackProject() : null;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await selectProjects((cols) =>
    db().from("projects").select(cols).eq("id", id).maybeSingle(),
  );
  if (error) return id === DEFAULT_PROJECT_ID ? envFallbackProject() : null;
  return (data as unknown as Project) ?? null;
}

// Resolve an MCP bearer to its project. Per-project tokens first; the env
// MCP_API_KEY stays valid for ClockedCode so existing CI secrets keep working
// without rotation.
export async function getProjectByToken(token: string): Promise<Project | null> {
  if (!token) return null;
  const { data, error } = await selectProjects((cols) =>
    db().from("projects").select(cols).eq("mcp_token", token).maybeSingle(),
  );
  if (!error && data) return data as unknown as Project;
  const legacy = process.env.MCP_API_KEY;
  if (legacy) {
    const a = Buffer.from(token);
    const b = Buffer.from(legacy);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      // By fixed id, not slug: the wizard renames the seeded default row
      // when the first site claims it, but its id never changes.
      return getProjectById(DEFAULT_PROJECT_ID);
    }
  }
  return null;
}

// The one place the per-project token is read - the setup checklist shows it
// so the user can paste it into their repo's CI secrets.
export async function fetchProjectToken(projectId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("projects")
    .select("mcp_token")
    .eq("id", projectId)
    .maybeSingle();
  if (error) return null;
  return (data?.mcp_token as string | undefined) ?? null;
}

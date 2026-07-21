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
  created_at: string;
};

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

// mcp_token deliberately excluded - only fetchProjectToken exposes it.
const COLS =
  "id, slug, name, domain, gsc_site_url, github_repo, content_mode, content_path_hint, dataforseo_login, dataforseo_password, keyword_source, serpapi_key, powerups_skipped, location_code, language_code, mode, auto_approve, auto_approve_tools, auto_build_guides, auto_build_tools, auto_merge, last_trend_scan_at, site_launched_at, pipeline_installed_at, content_prefs, gsc_oauth_refresh_token, created_at";

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
  const first = await run(COLS);
  if (!first.error || !first.error.message.includes("does not exist")) return first;
  return run(COLS_PRE_0028);
}

// Until migration 0004 runs, the projects table doesn't exist. Synthesizing
// ClockedCode from env keeps the deployed dashboard working in that window -
// the same tolerance pattern site_profile and playbook_status use.
function envFallbackProject(): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    slug: DEFAULT_PROJECT_SLUG,
    name: "ClockedCode",
    domain: "clockedcode.com",
    gsc_site_url: process.env.GSC_SITE_URL ?? null,
    github_repo: process.env.SEO_TARGET_REPO ?? "NeoZi12/clockedcode",
    content_mode: "existing", // ClockedCode has its blog already
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
    content_prefs: {},
    gsc_oauth_refresh_token: null,
    created_at: new Date(0).toISOString(),
  };
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await selectProjects((cols) =>
    db().from("projects").select(cols).order("created_at", { ascending: true }),
  );
  if (error) {
    // A genuinely-absent projects table (pre-0004) is the expected fallback.
    // Any OTHER error (transient blip, timeout) must not pass silently:
    // collapsing a populated multi-tenant install to the single synthetic
    // project makes a cron skip every real tenant yet still report success.
    // Log loudly so it surfaces in platform logs; the fuller fix propagates
    // this to the cron's hadError so it alerts. (2026-07-21 audit.)
    if (!/does not exist|could not find|PGRST205|42P01/i.test(error.message)) {
      console.error(
        `[projects] listProjects collapsed to the synthetic fallback on a non-schema error: ${error.message}`,
      );
    }
    return [envFallbackProject()];
  }
  if (!data || data.length === 0) return [envFallbackProject()];
  return data as unknown as Project[];
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { data, error } = await selectProjects((cols) =>
    db().from("projects").select(cols).eq("slug", slug).maybeSingle(),
  );
  if (error) return slug === DEFAULT_PROJECT_SLUG ? envFallbackProject() : null;
  return (data as unknown as Project) ?? null;
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
      return getProjectBySlug(DEFAULT_PROJECT_SLUG);
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

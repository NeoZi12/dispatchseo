import { db } from "./db";

// Schema completeness probe (2026-07-20 audit, findings A3/C5). Migrations
// are applied by hand in the Supabase SQL editor, and the old setup gate
// only verified the LAST file's table - a mid-sequence paste slip read as
// "fully migrated" and surfaced days later as features that mysteriously
// never activate (or worse: the projects env-fallback silently answering
// with the wrong tenant). This probes one distinctive artifact per
// migration (or migration cluster) so both the /setup wizard and the
// post-deploy smoke test can name exactly which migration is missing.
//
// RULE: every new migration adds a probe here, same discipline as bumping
// INSTRUCTIONS_VERSION. Probe = the migration's most distinctive artifact.
//
// Column probes select the column with limit(0): PostgREST answers 42703 /
// "column ... does not exist" without transferring rows. Table probes use a
// head count. Any transient DB error reads as "present" - this check must
// name missing migrations, never manufacture them during a hiccup.

type Probe = { migration: string; table: string; column?: string };

const PROBES: Probe[] = [
  { migration: "0001_init", table: "suggestions" },
  { migration: "0002_playbook_status", table: "playbook_status" },
  { migration: "0003_site_profile", table: "site_profile" },
  { migration: "0004_projects", table: "projects" },
  { migration: "0005_index_requested", table: "pages", column: "index_requested_at" },
  { migration: "0007_dataforseo_per_project", table: "projects", column: "dataforseo_login" },
  { migration: "0008_domain_ratings", table: "domain_ratings" },
  { migration: "0009_keyword_source", table: "projects", column: "keyword_source" },
  { migration: "0010_indexed_verification", table: "pages", column: "indexed_at" },
  { migration: "0011_automation_toggles", table: "projects", column: "auto_merge" },
  { migration: "0012_conventions", table: "conventions" },
  { migration: "0013_trend_radar", table: "suggestions", column: "source" },
  { migration: "0014_manual_queue", table: "suggestions", column: "queue_position" },
  { migration: "0015_site_launched_at", table: "projects", column: "site_launched_at" },
  { migration: "0016_trend_topics", table: "trend_topics" },
  { migration: "0017_content_surface", table: "projects", column: "content_mode" },
  { migration: "0018_pipeline_installed", table: "projects", column: "pipeline_installed_at" },
  { migration: "0019_content_prefs", table: "projects", column: "content_prefs" },
  { migration: "0020_cron_runs", table: "cron_runs" },
  { migration: "0021_login_lockout", table: "login_attempts" },
  { migration: "0022_waitlist", table: "waitlist_signups" },
  { migration: "0023_gsc_oauth", table: "projects", column: "gsc_oauth_refresh_token" },
  { migration: "0024_waitlist_rate_limit", table: "waitlist_attempts" },
  { migration: "0025_ai_visibility", table: "ai_snapshots" },
  { migration: "0026_instance_settings", table: "instance_settings" },
  { migration: "0027_reliability", table: "suggestions", column: "started_at" },
  { migration: "0028_auto_approve_tools", table: "projects", column: "auto_approve_tools" },
  { migration: "0029_gsc_service_account_in_db", table: "instance_settings", column: "gsc_service_account_json" },
  { migration: "0030_wizard_owns_setup", table: "instance_settings", column: "gh_merge_token" },
  // 0031's auth.users foreign keys are Supabase-only (DO-block guarded), but
  // the subscriptions table itself is created on both platforms - safe probe.
  { migration: "0031_cloud_users", table: "subscriptions" },
  { migration: "0032_builder_heartbeat", table: "instance_settings", column: "builder_last_seen_at" },
  { migration: "0033_page_liveness", table: "pages", column: "live_at" },
  { migration: "0034_github_app", table: "projects", column: "github_installation_id" },
  { migration: "0035_dataforseo_usage", table: "dataforseo_usage" },
];

async function probeMissing(p: Probe): Promise<boolean> {
  try {
    const { error } = await db()
      .from(p.table)
      .select(p.column ?? "*", { count: "exact", head: true })
      .limit(0);
    if (!error) return false;
    // Missing table (42P01 / PGRST205) or missing column (42703): the
    // migration genuinely hasn't run. Anything else is a DB hiccup - treat
    // as present so an outage can't paint the whole schema as missing.
    const code = (error as { code?: string }).code ?? "";
    const msg = error.message ?? "";
    return (
      code === "42P01" ||
      code === "PGRST205" ||
      code === "42703" ||
      /does not exist/i.test(msg) ||
      /could not find/i.test(msg)
    );
  } catch {
    return false;
  }
}

// Names of migrations whose artifacts are absent, in order. Empty = schema
// complete (as far as the probe list knows).
export async function missingMigrations(): Promise<string[]> {
  const results = await Promise.all(PROBES.map(probeMissing));
  return PROBES.filter((_, i) => results[i]).map((p) => p.migration);
}

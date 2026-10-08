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
// If a migration has no queryable artifact (constraints, policies), record it
// in UNPROBEABLE below with the reason instead. The rule was previously honor-
// system and four migrations had quietly skipped it, so it is now enforced:
// `node scripts/generate-setup-sql.mjs --check` (pnpm build + the vanilla-
// postgres CI job) fails on any migration missing from both lists.
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
  // 0030 adds TWO columns; probe the load-bearing one. gh_merge_token is a
  // self-host merge nicety, but onboarding_screen is what the whole wizard
  // resume relies on - and a PARTIAL apply that left only it missing sailed
  // through the old gh_merge_token probe, silently breaking mode-persistence in
  // prod until 2026-07-24. Probe the column whose absence actually hurts.
  { migration: "0030_wizard_owns_setup", table: "projects", column: "onboarding_screen" },
  // 0031's auth.users foreign keys are Supabase-only (DO-block guarded), but
  // the subscriptions table itself is created on both platforms - safe probe.
  { migration: "0031_cloud_users", table: "subscriptions" },
  { migration: "0032_builder_heartbeat", table: "instance_settings", column: "builder_last_seen_at" },
  { migration: "0033_page_liveness", table: "pages", column: "live_at" },
  { migration: "0034_github_app", table: "projects", column: "github_installation_id" },
  { migration: "0035_dataforseo_usage", table: "dataforseo_usage" },
  { migration: "0036_install_progress", table: "projects", column: "install_progress" },
  { migration: "0037_builder_claude_token", table: "instance_settings", column: "builder_claude_token" },
  // 0039's absence is the one that bites hardest and shows least: every
  // reportCronRun insert sends claimed_only, so a missing column made EVERY
  // cron_runs write fail - and that insert tolerates its own error by design
  // (a logging failure must never fail the cron). Result on 2026-07-27: ~5.5h
  // where crons ran fine, returned 200, and their outcomes were discarded -
  // no banner, no alert emails, the whole alerting rail silently dead while
  // this very file (which had no probe for 0039) reported the schema complete.
  { migration: "0039_cron_claim_marker", table: "cron_runs", column: "claimed_only" },
  { migration: "0040_pipeline_verified", table: "projects", column: "pipeline_verified" },
  { migration: "0041_backlink_status_changed", table: "backlink_prospects", column: "status_changed_at" },
  { migration: "0042_serp_tasks", table: "serp_tasks" },
  // The column, not the CHECK constraint or the instance_settings sibling:
  // projects.agent is the one artifact of 0044 PostgREST can actually see, and
  // it is the one every read path depends on.
  { migration: "0044_project_agent", table: "projects", column: "agent" },
  // 0045 adds exactly one column and nothing else, so it probes cleanly.
  {
    migration: "0045_project_internal_linking",
    table: "projects",
    column: "internal_linking",
  },
  // The feedback board's two tables. Probing the parent is enough - a database
  // that has `feedback` ran the whole file, and `feedback_votes` is created
  // eleven lines below it.
  { migration: "0046_feedback", table: "feedback" },
  // Pending-cancellation flag on the billing row. Worth probing loudly despite
  // being one column: without it the cancel button can't tell anyone their
  // cancellation landed, and the webhook is writing a column the database
  // doesn't have.
  {
    migration: "0047_subscription_cancel_at_period_end",
    table: "subscriptions",
    column: "cancel_at_period_end",
  },
  // The third-site GitHub Actions cost acknowledgement. githubCostGate treats
  // an absent column as "don't gate", so a missing 0048 degrades to the old
  // dismissible-notice behaviour rather than blocking anyone - but it does mean
  // the step silently never appears, which is exactly what this probe is for.
  {
    migration: "0048_github_cost_ack",
    table: "subscriptions",
    column: "github_cost_ack_at",
  },
  // The heartbeat's install id. Its absence is harmless to the owner - the
  // ping just reports "no stable install id" and sends nothing - so this probe
  // is here for the coverage rule and to explain a count that stopped growing,
  // not because a missing column hurts the install.
  {
    migration: "0049_install_id",
    table: "instance_settings",
    column: "install_id",
  },
  { migration: "0051_domain_rating_history", table: "domain_rating_history" },
  // Nothing reads this column yet - Cursor is registered with
  // headlessBuilder: false and every builderAgentToken() caller sits behind a
  // builderAgents() filter. It is probed anyway because the column has to
  // EXIST before that flag flips, and this probe is what says so out loud
  // rather than leaving it to be found by a self-host instance whose
  // credential save quietly writes nowhere.
  {
    migration: "0053_builder_cursor_key",
    table: "instance_settings",
    column: "builder_cursor_key",
  },
  { migration: "0054_signup_qualifier", table: "signup_qualifiers" },
  // 0055 adds several projects columns AND two tables; probe the column whose
  // absence actually changes behaviour. Without publish_target every project
  // silently reads as "publishes through GitHub", which is exactly the
  // half-applied state that must be named rather than guessed at.
  { migration: "0055_wordpress_publishing", table: "projects", column: "publish_target" },
  { migration: "0056_jobs", table: "jobs" },
  { migration: "0057_site_link_candidates", table: "site_digests", column: "link_candidates" },
  { migration: "0058_research_notes", table: "research_notes" },
  // 0060 adds two projects columns and four article_drafts columns; probe one
  // of each so a half-applied migration is still caught.
  { migration: "0060_ai_choice_repo_publishing", table: "projects", column: "ai_choice" },
  { migration: "0060_ai_choice_repo_publishing", table: "article_drafts", column: "pr_url" },
  { migration: "0061_qualifier_site_kind", table: "signup_qualifiers", column: "site_kind" },
  { migration: "0062_setup_path", table: "projects", column: "setup_connected_at" },
  { migration: "0063_keyword_research_cache", table: "keyword_research_cache", column: "seed" },
];

// Migrations that genuinely CANNOT be probed through this mechanism, with the
// reason. db() speaks PostgREST, which can only ask "does this table/column
// answer a select?" - a migration whose entire artifact is a constraint, a
// policy, or a function is invisible to it. Listed explicitly rather than
// omitted so the coverage guard in scripts/generate-setup-sql.mjs can tell a
// deliberate exemption from the oversight that let 0039 slip through, and so
// nobody re-audits these two every time the list is reviewed.
export const UNPROBEABLE: Record<string, string> = {
  // Rewrites foreign keys to ON DELETE CASCADE. No table or column changes -
  // its artifact lives in pg_constraint. Failure mode if unapplied is a
  // failed project delete (loud, immediate, user-facing), not silent drift.
  "0006_cascade_deletes":
    "FK constraint changes only - artifact is in pg_constraint, not queryable via PostgREST",
  // Creates RLS policies + project_owned_by_caller(), Supabase-only and
  // DO-block guarded. Inert by construction: every caller today is the
  // service-role key, which bypasses RLS regardless of policy count, so
  // there is no behavior for a probe to detect even in principle.
  "0038_rls_owner_policies":
    "RLS policies + function, artifact is in pg_policies; inert under the service-role key anyway",
  // Adds a partial unique index on suggestions - artifact lives in pg_indexes,
  // invisible to PostgREST. Unapplied it costs nothing: suggestion-dedupe.ts
  // does the same check in app code before every insert, and this index only
  // backstops the read-then-insert race.
  "0043_suggestion_keyword_unique":
    "partial unique index - artifact is in pg_indexes, not queryable via PostgREST",
  // DROPS the projects.agent CHECK constraint so new agents need no migration.
  // Artifact is an absence in pg_constraint - nothing for PostgREST to see.
  // Unapplied it costs nothing until a THIRD agent exists; at that point a
  // set_agent to the new agent errors loudly (constraint violation surfaced
  // by setProjectAgent), never silently.
  "0050_agent_check_open":
    "drops a CHECK constraint - artifact is an absence in pg_constraint, not queryable via PostgREST",
  "0052_refresh_source":
    "widens the suggestions_source_check CHECK constraint - constraints are not queryable via PostgREST",
  // Recreates the one-live-draft-per-suggestion partial unique index so that
  // blocked_setup counts as live. Artifact is in pg_indexes. Unapplied, the
  // app-side checks in submit_article (which do the same test before every
  // insert) still hold the line; this index only backstops the race.
  "0059_blocked_setup_is_live":
    "partial unique index rebuild - artifact is in pg_indexes, not queryable via PostgREST",
};

async function probeMissing(p: Probe): Promise<boolean> {
  try {
    // Column probes must NOT combine head:true with count:"exact": verified
    // 2026-07-27 that PostgREST/supabase-js optimizes that combination into a
    // bare `SELECT count(*)` and never validates the select list against it -
    // a definitely-nonexistent column produced the identical no-error result
    // as a real one. Every column probe in this file was silently a no-op,
    // always reporting "present" regardless of the column's actual existence
    // - the exact false-success shape this file exists to prevent. A plain
    // (non-head) select still transfers zero rows via limit(0) but forces
    // real column validation. Table-only probes (no column) keep the cheap
    // head+count existence check - a genuinely missing table still errors
    // regardless of select-list handling.
    const { error } = p.column
      ? await db().from(p.table).select(p.column).limit(0)
      : await db().from(p.table).select("*", { count: "exact", head: true }).limit(0);
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

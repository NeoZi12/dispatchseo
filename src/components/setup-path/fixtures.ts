// Synthetic SetupSnapshots for every row of the setup-path step catalogue.
//
// Two consumers: scripts/setup-path-test.mjs (asserts the engine) and the
// dev-only /onboarding/preview?step=<id> route (eyeballs each card without
// live data). One fixture per catalogue row per branch where the row applies;
// the key is the step id the engine must return for it (legacy fixtures carry
// their expectation in LEGACY_EXPECT).
//
// Same rule as setup-path-core.ts [R12]: NO value imports - type imports only,
// so `node --experimental-strip-types` can load this file directly.

import type {
  SetupCounts,
  SetupHealth,
  SetupProjectSnapshot,
  SetupSnapshot,
  StepId,
} from "@/lib/setup-path-core";

/** Fixed clock: every fixture is "now" = this instant. */
export const FIXTURE_NOW = Date.parse("2026-10-05T12:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
/** ISO timestamp `msAgo` before FIXTURE_NOW. */
export const ago = (msAgo: number): string => new Date(FIXTURE_NOW - msAgo).toISOString();

export type SnapshotOverrides = {
  project?: Partial<SetupProjectSnapshot> | null;
  counts?: Partial<SetupCounts>;
  health?: Partial<SetupHealth>;
  branch_hint?: SetupSnapshot["branch_hint"];
  origin?: string;
  mcpToken?: string | null;
  now?: number;
};

const BASE_PROJECT: SetupProjectSnapshot = {
  slug: "acme",
  name: "Acme",
  domain: "acme.com",
  publish_target: "github",
  ai_choice: "claude-code",
  agent: "claude",
  github_installation_id: null,
  github_repo: null,
  repo_token_allowed: false,
  installation_repo_count: null,
  agent_credential_at: null,
  agent_last_seen_at: null,
  chat_last_seen_at: null,
  wp_connected: false,
  gsc_oauth_connected: false,
  gsc_site_url: null,
  gsc_property_in_list: null,
  gsc_property_count: null,
  setup_connected_at: null,
  setup_deferred: [],
  install_progress: {},
  pipeline_installed_at: null,
  mode: "semi",
  auto_approve: false,
  auto_build_guides: true,
  auto_merge: false,
  created_at: ago(2 * HOUR),
};

const BASE_COUNTS: SetupCounts = {
  site_profile: 0, conventions: 0, suggestions: 0, approved: 0,
  keywords: 0, rank_checks: 0, pages: 0, pages_live: 0,
  pages_with_pr: 0, drafts: 0, drafts_published: 0, drafts_finished: 0, drafts_accepted: 0,
  drafts_blocked_setup: 0, gsc_rows: 0,
};

const BASE_HEALTH: SetupHealth = {
  setup_ok: null,
  setup_last_run_at: null,
  actions_toggle_ok: null,
  ranks_possible: true,
};

/** Merge `o` onto `base`. `project` and its `install_progress` merge one level
 *  deep; `project: null` means "no project yet". */
export function applyOverrides(base: SetupSnapshot, o: SnapshotOverrides): SetupSnapshot {
  let project: SetupProjectSnapshot | null = base.project;
  if (o.project === null) project = null;
  else if (o.project) {
    const from = base.project ?? BASE_PROJECT;
    project = {
      ...from,
      ...o.project,
      install_progress: { ...from.install_progress, ...(o.project.install_progress ?? {}) },
    };
  }
  return {
    project,
    branch_hint: o.branch_hint !== undefined ? o.branch_hint : base.branch_hint,
    counts: { ...base.counts, ...(o.counts ?? {}) },
    health: { ...base.health, ...(o.health ?? {}) },
    origin: o.origin ?? base.origin,
    mcpToken: o.mcpToken !== undefined ? o.mcpToken : base.mcpToken,
    now: o.now ?? base.now,
  };
}

/** A fresh github x coding project, nothing connected. */
export function baseSnapshot(overrides: SnapshotOverrides = {}): SetupSnapshot {
  return applyOverrides(
    {
      project: { ...BASE_PROJECT, install_progress: {}, setup_deferred: [] },
      branch_hint: null,
      counts: { ...BASE_COUNTS },
      health: { ...BASE_HEALTH },
      origin: "https://dispatchseo.com",
      mcpToken: "tok_fixture",
      now: FIXTURE_NOW,
    },
    overrides,
  );
}

/** Apply a list of overrides in order. */
export function chain(base: SetupSnapshot, ...patches: SnapshotOverrides[]): SetupSnapshot {
  return patches.reduce(applyOverrides, base);
}

// ---- evidence patches (each makes one catalogue row's evidence true) -------

export const EVIDENCE = {
  github_app: { project: { github_installation_id: 4242 } },
  github_repo: { project: { github_repo: "acme/site" } },
  wordpress: { project: { wp_connected: true } },
  agent_credential: { project: { agent_credential_at: ago(90 * MIN) } },
  agent_connect: { project: { agent_last_seen_at: ago(80 * MIN) } },
  chat_connect: { project: { chat_last_seen_at: ago(80 * MIN) } },
  google_connect: { project: { gsc_oauth_connected: true, gsc_site_url: "sc-domain:acme.com" } },
  gsc_property: { project: { gsc_property_in_list: true, gsc_property_count: 2 } },
  connected: { project: { setup_connected_at: ago(60 * MIN) } },
  // The install landed as a PR that also needs the Actions toggle.
  pipeline_install: {
    project: {
      install_progress: {
        install_attempted_at: ago(20 * MIN),
        install_fired: ago(20 * MIN),
        install_pr_url: "https://github.com/acme/site/pull/1",
        actions_toggle_needed: ago(20 * MIN),
      },
    },
    health: { open_install_pr: { url: "https://github.com/acme/site/pull/1", title: "Install DispatchSEO" } },
  },
  install_pr_merge: { health: { open_install_pr: null } },
  actions_toggle: { health: { actions_toggle_ok: true } },
  setup_running: { project: { pipeline_installed_at: ago(10 * MIN) }, counts: { site_profile: 1 }, health: { setup_ok: true, setup_last_run_at: ago(10 * MIN) } },
  first_research: { counts: { suggestions: 5, keywords: 12 } },
  approve_idea: { counts: { approved: 1 } },
  first_ranks: { counts: { rank_checks: 12 } },
  first_build: { counts: { pages: 1, pages_with_pr: 1 } },
  merge_first_pr: { counts: { pages_live: 1 } },
  chat_setup: { counts: { site_profile: 1 } },
  agent_setup: { counts: { site_profile: 1 } },
  chat_research: { counts: { suggestions: 5 } },
  agent_research: { counts: { suggestions: 5 } },
  write_first: { counts: { drafts: 1 } },
  publishing: { counts: { drafts_published: 1, drafts_accepted: 1 } },
  publishing_manual: { counts: { drafts_accepted: 1 } },
} satisfies Record<string, SnapshotOverrides>;

// ---- branches -----------------------------------------------------------

export type BranchKey =
  | "github_coding" | "github_chat"
  | "wordpress_coding" | "wordpress_chat"
  | "manual_coding" | "manual_chat";

const BRANCH_PROJECT: Record<BranchKey, Partial<SetupProjectSnapshot>> = {
  github_coding: { publish_target: "github", ai_choice: "claude-code", agent: "claude" },
  github_chat: { publish_target: "github", ai_choice: "claude-web", agent: null },
  wordpress_coding: { publish_target: "wordpress", ai_choice: "codex", agent: "codex" },
  wordpress_chat: { publish_target: "wordpress", ai_choice: "claude-web", agent: null },
  manual_coding: { publish_target: "manual", ai_choice: "cursor", agent: "cursor" },
  manual_chat: { publish_target: "manual", ai_choice: "claude-web", agent: null },
};

/** The order a branch's steps appear in as evidence arrives, each paired
 *  with the patch that completes it. `walk(branch)` yields the snapshot at
 *  every stage. `let_us_publish` appears twice (App, then repo pick). */
export const WALK: Record<BranchKey, { expect: StepId; done: SnapshotOverrides }[]> = {
  github_coding: [
    { expect: "github_app", done: EVIDENCE.github_app },
    { expect: "github_repo", done: EVIDENCE.github_repo },
    { expect: "agent_credential", done: EVIDENCE.agent_credential },
    { expect: "google_connect", done: EVIDENCE.google_connect },
    { expect: "gsc_property", done: EVIDENCE.gsc_property },
    { expect: "connected", done: EVIDENCE.connected },
    { expect: "pipeline_install", done: EVIDENCE.pipeline_install },
    { expect: "install_pr_merge", done: EVIDENCE.install_pr_merge },
    { expect: "actions_toggle", done: EVIDENCE.actions_toggle },
    { expect: "setup_running", done: EVIDENCE.setup_running },
    { expect: "first_research", done: EVIDENCE.first_research },
    { expect: "approve_idea", done: EVIDENCE.approve_idea },
    { expect: "first_ranks", done: EVIDENCE.first_ranks },
    { expect: "first_build", done: EVIDENCE.first_build },
    { expect: "merge_first_pr", done: EVIDENCE.merge_first_pr },
    { expect: "complete", done: {} },
  ],
  github_chat: [
    { expect: "chat_connect", done: EVIDENCE.chat_connect },
    { expect: "google_connect", done: EVIDENCE.google_connect },
    { expect: "gsc_property", done: EVIDENCE.gsc_property },
    { expect: "connected", done: EVIDENCE.connected },
    { expect: "let_us_publish", done: EVIDENCE.github_app },
    { expect: "let_us_publish", done: EVIDENCE.github_repo },
    { expect: "chat_setup", done: EVIDENCE.chat_setup },
    { expect: "chat_research", done: EVIDENCE.chat_research },
    { expect: "approve_idea", done: EVIDENCE.approve_idea },
    { expect: "write_first", done: EVIDENCE.write_first },
    { expect: "publishing", done: EVIDENCE.publishing },
    { expect: "complete", done: {} },
  ],
  wordpress_coding: [
    { expect: "wordpress", done: EVIDENCE.wordpress },
    { expect: "agent_connect", done: EVIDENCE.agent_connect },
    { expect: "google_connect", done: EVIDENCE.google_connect },
    { expect: "gsc_property", done: EVIDENCE.gsc_property },
    { expect: "connected", done: EVIDENCE.connected },
    { expect: "agent_setup", done: EVIDENCE.agent_setup },
    { expect: "agent_research", done: EVIDENCE.agent_research },
    { expect: "approve_idea", done: EVIDENCE.approve_idea },
    { expect: "write_first", done: EVIDENCE.write_first },
    { expect: "publishing", done: EVIDENCE.publishing },
    { expect: "complete", done: {} },
  ],
  wordpress_chat: [
    { expect: "wordpress", done: EVIDENCE.wordpress },
    { expect: "chat_connect", done: EVIDENCE.chat_connect },
    { expect: "google_connect", done: EVIDENCE.google_connect },
    { expect: "gsc_property", done: EVIDENCE.gsc_property },
    { expect: "connected", done: EVIDENCE.connected },
    { expect: "chat_setup", done: EVIDENCE.chat_setup },
    { expect: "chat_research", done: EVIDENCE.chat_research },
    { expect: "approve_idea", done: EVIDENCE.approve_idea },
    { expect: "write_first", done: EVIDENCE.write_first },
    { expect: "publishing", done: EVIDENCE.publishing },
    { expect: "complete", done: {} },
  ],
  manual_coding: [
    { expect: "agent_connect", done: EVIDENCE.agent_connect },
    { expect: "google_connect", done: EVIDENCE.google_connect },
    { expect: "gsc_property", done: EVIDENCE.gsc_property },
    { expect: "connected", done: EVIDENCE.connected },
    { expect: "agent_setup", done: EVIDENCE.agent_setup },
    { expect: "agent_research", done: EVIDENCE.agent_research },
    { expect: "approve_idea", done: EVIDENCE.approve_idea },
    { expect: "write_first", done: EVIDENCE.write_first },
    { expect: "publishing", done: EVIDENCE.publishing_manual },
    { expect: "complete", done: {} },
  ],
  manual_chat: [
    { expect: "chat_connect", done: EVIDENCE.chat_connect },
    { expect: "google_connect", done: EVIDENCE.google_connect },
    { expect: "gsc_property", done: EVIDENCE.gsc_property },
    { expect: "connected", done: EVIDENCE.connected },
    { expect: "chat_setup", done: EVIDENCE.chat_setup },
    { expect: "chat_research", done: EVIDENCE.chat_research },
    { expect: "approve_idea", done: EVIDENCE.approve_idea },
    { expect: "write_first", done: EVIDENCE.write_first },
    { expect: "publishing", done: EVIDENCE.publishing_manual },
    { expect: "complete", done: {} },
  ],
};

/** A branch's fresh project (site step done, nothing else). */
export function branchStart(branch: BranchKey): SetupSnapshot {
  return baseSnapshot({ project: BRANCH_PROJECT[branch] });
}

/** The snapshot at every stage of a branch's walk, in order. */
export function walk(branch: BranchKey): { expect: StepId; snapshot: SetupSnapshot }[] {
  const out: { expect: StepId; snapshot: SetupSnapshot }[] = [];
  let snap = branchStart(branch);
  for (const stage of WALK[branch]) {
    out.push({ expect: stage.expect, snapshot: snap });
    snap = applyOverrides(snap, stage.done);
  }
  return out;
}

/** One fixture per catalogue row per branch, keyed by the step id the engine
 *  must return. Where a row appears twice in a walk (let_us_publish), the
 *  first stage wins and the second gets a `__2` key. Plus `site`. */
function byStep(branch: BranchKey): Record<string, SetupSnapshot> {
  const out: Record<string, SetupSnapshot> = {
    site: baseSnapshot({ project: null, branch_hint: { publish_target: BRANCH_PROJECT[branch].publish_target!, ai_choice: BRANCH_PROJECT[branch].ai_choice ?? null } }),
  };
  for (const { expect, snapshot } of walk(branch)) {
    const key = expect in out ? `${expect}__2` : expect;
    out[key] = snapshot;
  }
  return out;
}

export const github_coding = byStep("github_coding");
export const github_chat = byStep("github_chat");
export const wordpress_coding = byStep("wordpress_coding");
export const wordpress_chat = byStep("wordpress_chat");
export const manual_coding = byStep("manual_coding");
export const manual_chat = byStep("manual_chat");

export const BRANCH_FIXTURES: Record<BranchKey, Record<string, SetupSnapshot>> = {
  github_coding, github_chat, wordpress_coding, wordpress_chat, manual_coding, manual_chat,
};

// ---- variants: auto-done, slow-after, errors, special rows -----------------

const gc = github_coding;

/** github x coding variants, each with the step it must produce. */
export const variants: Record<string, { expect: StepId; snapshot: SetupSnapshot; note: string }> = {
  // github_repo auto-done: the installation has exactly one repo.
  single_repo_auto: {
    expect: "agent_credential", note: "installation_repo_count === 1 skips github_repo",
    snapshot: applyOverrides(gc.github_repo, { project: { installation_repo_count: 1 } }),
  },
  repo_count_zero: {
    expect: "github_repo", note: "count 0 = error with 'Choose which repos to share'",
    snapshot: applyOverrides(gc.github_repo, { project: { installation_repo_count: 0 } }),
  },
  // gsc_property auto-done: the guessed property is in the list.
  guessed_property_in_list: {
    expect: "connected", note: "guessed sc-domain: in the live list",
    snapshot: applyOverrides(gc.gsc_property, { project: { gsc_property_in_list: true } }),
  },
  gsc_rows_property: {
    expect: "connected", note: "gsc_rows > 0 proves the property",
    snapshot: applyOverrides(gc.gsc_property, { counts: { gsc_rows: 3 } }),
  },
  gsc_property_not_in_list: {
    expect: "gsc_property", note: "guess missing from the list -> the pick",
    snapshot: applyOverrides(gc.gsc_property, { project: { gsc_property_in_list: false, gsc_property_count: 3 } }),
  },
  gsc_no_properties: {
    expect: "gsc_property", note: "empty list -> error",
    snapshot: applyOverrides(gc.gsc_property, { project: { gsc_property_in_list: false, gsc_property_count: 0 } }),
  },
  auto_approve: {
    expect: "first_ranks", note: "auto_approve skips approve_idea",
    snapshot: applyOverrides(gc.approve_idea, { project: { mode: "auto", auto_approve: true, auto_merge: true } }),
  },
  auto_merge_wait: {
    expect: "merge_first_pr", note: "auto_merge -> wait 'Publishing your first article'",
    snapshot: applyOverrides(gc.merge_first_pr, { project: { mode: "auto", auto_approve: true, auto_merge: true } }),
  },
  ranks_impossible: {
    expect: "first_build", note: "!ranks_possible skips first_ranks",
    snapshot: applyOverrides(gc.first_ranks, { health: { ranks_possible: false } }),
  },
  // install auto-fire around the 10-minute boundary
  install_never_attempted: {
    expect: "pipeline_install", note: "no attempt -> autoFire",
    snapshot: gc.pipeline_install,
  },
  install_attempted_9min: {
    expect: "pipeline_install", note: "attempt 9 min ago -> no autoFire, failed error",
    snapshot: applyOverrides(gc.pipeline_install, { project: { install_progress: { install_attempted_at: ago(9 * MIN) } } }),
  },
  install_attempted_11min: {
    expect: "pipeline_install", note: "attempt 11 min ago -> still no autoFire (Retry only)",
    snapshot: applyOverrides(gc.pipeline_install, { project: { install_progress: { install_attempted_at: ago(11 * MIN) } } }),
  },
  install_in_flight: {
    expect: "pipeline_install", note: "attempt 30 s ago -> in flight, no error, no autoFire",
    snapshot: applyOverrides(gc.pipeline_install, { project: { install_progress: { install_attempted_at: ago(30_000) } } }),
  },
  install_direct_commit: {
    expect: "setup_running", note: "no PR hint and no toggle -> straight to setup_running (cheap pass)",
    snapshot: applyOverrides(gc.pipeline_install, {
      project: { install_progress: { install_attempted_at: ago(5 * MIN), install_fired: ago(5 * MIN) } },
    }),
  },
  // setup_running slow-after
  setup_44min: {
    expect: "setup_running", note: "44 min, no run -> still a wait",
    snapshot: applyOverrides(gc.setup_running, { project: { install_progress: { install_fired: ago(44 * MIN) } } }),
  },
  setup_46min_never_ran: {
    expect: "setup_running", note: "46 min, no run at all -> do 'Start setup again'",
    snapshot: applyOverrides(gc.setup_running, { project: { install_progress: { install_fired: ago(46 * MIN) } } }),
  },
  setup_46min_running: {
    expect: "setup_running", note: "46 min but a run exists -> stays a wait (slow hint)",
    snapshot: applyOverrides(gc.setup_running, {
      project: { install_progress: { install_fired: ago(46 * MIN) } },
      health: { setup_last_run_at: ago(10 * MIN) },
    }),
  },
  research_29min: {
    expect: "first_research", note: "29 min -> wait",
    snapshot: applyOverrides(gc.first_research, { health: { setup_last_run_at: ago(29 * MIN) } }),
  },
  research_31min: {
    expect: "first_research", note: "31 min -> do 'Run research now'",
    snapshot: applyOverrides(gc.first_research, { health: { setup_last_run_at: ago(31 * MIN) } }),
  },
  // reconnect_app outranks every wait
  reconnect_over_wait: {
    expect: "reconnect_app", note: "repo set, installation gone, mid first_build wait",
    snapshot: applyOverrides(gc.first_build, { project: { github_installation_id: null } }),
  },
  reconnect_github_chat: {
    expect: "reconnect_app", note: "github x chat after let_us_publish, installation gone",
    snapshot: applyOverrides(github_chat.chat_setup, { project: { github_installation_id: null } }),
  },
};

// ---- deferral ------------------------------------------------------------

export const deferral: Record<string, { expect: StepId; snapshot: SetupSnapshot; note: string }> = {
  connect_skips_parked_google: {
    expect: "connected", note: "google parked -> connect phase skips google + property",
    snapshot: applyOverrides(gc.google_connect, { project: { setup_deferred: ["google_connect"] } }),
  },
  parked_google_over_wait: {
    expect: "google_connect", note: "parked google surfaces over setup_running wait",
    snapshot: applyOverrides(gc.setup_running, { project: { gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["google_connect"] } }),
  },
  parked_google_not_over_do: {
    expect: "approve_idea", note: "parked google does NOT outrank a do",
    snapshot: applyOverrides(gc.approve_idea, { project: { gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["google_connect"] } }),
  },
  parked_google_blocks_complete: {
    expect: "google_connect", note: "unmet parked google blocks complete",
    snapshot: applyOverrides(gc.complete, { project: { gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["google_connect"] } }),
  },
  parked_met_does_not_block: {
    expect: "complete", note: "a parked id whose evidence is now true is ignored",
    snapshot: applyOverrides(gc.complete, { project: { setup_deferred: ["google_connect"] } }),
  },
  non_deferrable_ignored: {
    expect: "agent_credential", note: "agent_credential in setup_deferred is not deferrable",
    snapshot: applyOverrides(gc.agent_credential, { project: { setup_deferred: ["agent_credential"] } }),
  },
  wordpress_parked_over_publishing: {
    expect: "wordpress", note: "parked wordpress surfaces over the publishing wait",
    snapshot: applyOverrides(wordpress_chat.publishing, { project: { wp_connected: false, setup_deferred: ["wordpress"] } }),
  },
  wordpress_blocked_unparked: {
    expect: "wordpress", note: "drafts blocked on setup + no WordPress -> wordpress, even unparked",
    snapshot: applyOverrides(wordpress_chat.publishing, { project: { wp_connected: false }, counts: { drafts_blocked_setup: 1 } }),
  },
  // A handed-in draft proves the connector, so a parked chat_connect can no
  // longer sit unmet under the publishing wait; it surfaces over the chat_*
  // steps that need it instead (see the "needs a parked connector" rule).
  chat_parked_over_chat_setup: {
    expect: "chat_connect", note: "parked chat_connect outranks chat_setup (a do that needs it)",
    snapshot: applyOverrides(manual_chat.chat_setup, { project: { chat_last_seen_at: null, setup_deferred: ["chat_connect"] } }),
  },
  chat_parked_over_chat_research: {
    expect: "chat_connect", note: "parked chat_connect outranks chat_research",
    snapshot: applyOverrides(github_chat.chat_research, { project: { chat_last_seen_at: null, setup_deferred: ["chat_connect"] }, counts: { site_profile: 0, conventions: 1 } }),
  },
  agent_parked_over_agent_setup: {
    expect: "agent_connect", note: "parked agent_connect outranks agent_setup",
    snapshot: applyOverrides(manual_coding.agent_setup, { project: { agent_last_seen_at: null, setup_deferred: ["agent_connect"] } }),
  },
  agent_parked_over_agent_research: {
    expect: "agent_connect", note: "parked agent_connect outranks agent_research",
    snapshot: applyOverrides(wordpress_coding.agent_research, { project: { agent_last_seen_at: null, setup_deferred: ["agent_connect"] } }),
  },
};

// ---- legacy rows -----------------------------------------------------------

export const legacy: Record<string, SetupSnapshot> = {
  /** Pre-ai_choice row: reads as coding (github x coding chain). */
  null_ai_choice: applyOverrides(gc.agent_credential, { project: { ai_choice: null } }),
  /** Connected legacy row with Google seeded as deferred (T2): mid-wait, the
   *  hero asks for Google. */
  connected_with_deferred_google: applyOverrides(gc.first_build, {
    project: { gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["google_connect"] },
  }),
  /** Connected legacy row with NO connect evidence at all: setup_connected_at
   *  set, so it must never land on a connect-phase step. */
  connected_no_evidence: baseSnapshot({
    project: { github_installation_id: 4242, github_repo: "acme/site", setup_connected_at: ago(30 * 24 * HOUR), pipeline_installed_at: ago(30 * 24 * HOUR) },
    counts: { site_profile: 1, suggestions: 3, approved: 1, rank_checks: 4, pages_with_pr: 1, pages_live: 2 },
  }),
  /** Legacy installed row with no install_progress keys at all. */
  installed_no_install_progress: baseSnapshot({
    project: { github_installation_id: 4242, github_repo: "acme/site", setup_connected_at: ago(10 * 24 * HOUR), pipeline_installed_at: ago(10 * 24 * HOUR) },
    counts: { site_profile: 1 },
  }),
  /** Legacy wordpress x chat row, everything parked by the T2 seed. */
  wordpress_chat_seeded: applyOverrides(wordpress_chat.chat_setup, {
    project: { wp_connected: false, chat_last_seen_at: null, gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["wordpress", "chat_connect", "google_connect"] },
  }),
};

export const LEGACY_EXPECT: Record<keyof typeof legacy, StepId> = {
  null_ai_choice: "agent_credential",
  connected_with_deferred_google: "google_connect",
  connected_no_evidence: "complete",
  installed_no_install_progress: "first_research",
  // The seeded chat_connect is unmet and chat_setup runs through it.
  wordpress_chat_seeded: "chat_connect",
};

/** Every fixture once, for the preview route and the "exactly one step" sweep. */
export function allFixtures(): { name: string; snapshot: SetupSnapshot; expect: StepId | null }[] {
  const out: { name: string; snapshot: SetupSnapshot; expect: StepId | null }[] = [];
  for (const [branch, map] of Object.entries(BRANCH_FIXTURES)) {
    for (const [key, snapshot] of Object.entries(map)) {
      out.push({ name: `${branch}.${key}`, snapshot, expect: key.split("__")[0] as StepId });
    }
  }
  for (const [key, v] of Object.entries(variants)) out.push({ name: `variants.${key}`, snapshot: v.snapshot, expect: v.expect });
  for (const [key, v] of Object.entries(deferral)) out.push({ name: `deferral.${key}`, snapshot: v.snapshot, expect: v.expect });
  for (const [key, snapshot] of Object.entries(legacy)) out.push({ name: `legacy.${key}`, snapshot, expect: LEGACY_EXPECT[key as keyof typeof legacy] });
  return out;
}

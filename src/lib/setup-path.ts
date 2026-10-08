// The setup path's server half: load the evidence the pure engine
// (setup-path-core.ts) reads, run the few live remote reads it needs, and
// answer "what is the ONE step in front of this customer".
//
// Server-only: db.ts (service role), GitHub, Google. Never import this from a
// client component - the card renders from setup-path-core.ts's types and
// fetches steps from /api/setup/step.
//
// Three callers, one function (the parity rule): the /api/setup/step poll, the
// MCP tools get_setup_step / defer_setup_step, and server renders (the
// /onboarding page, and Home + the dashboard layout through
// getSetupStepCached).
//
// Reads only, with three deliberate write-throughs, each one making a stored
// fact agree with evidence we just saw (never inventing one):
//   - a parked step whose evidence is now true is dropped from setup_deferred
//   - agent_credential_at is backfilled when the repo secret is verifiably
//     there (a key pasted through some other door) [R15]
//   - a guessed Search Console property / sole installation repo that the
//     live list confirms is saved, exactly as the picker would save it
// Everything else with a side effect lives in src/app/setup-actions.ts.

import { cache } from "react";
import { db } from "@/lib/db";
import {
  effectiveAutomations,
  getProjectBySlug,
  publishTarget,
  fetchProjectToken,
  type Project,
} from "@/lib/projects";
import { credsForProject } from "@/lib/dataforseo";
import { projectAgent } from "@/lib/agents";
import { openInstallPr } from "@/lib/install-pr";
import { instanceTokenAllowedFor } from "@/lib/github";
import {
  computeSetupStep,
  DEFERRABLE,
  deriveConnectedAt,
  expandDeferral,
  type PublishTarget,
  type SetupCounts,
  type SetupHealth,
  type SetupProjectSnapshot,
  type SetupSnapshot,
  type SetupStep,
  type StepId,
} from "@/lib/setup-path-core";

export type BranchHint = { publish_target: PublishTarget; ai_choice: string | null };

export type LoadOptions = {
  /** Run the live remote reads (GitHub repo list / secret / PR / prereqs,
   *  Google property list) for the step that is current. Only the poll, the
   *  MCP tool and the /onboarding render pass true; page renders never do
   *  [R14]. */
  live: boolean;
  /** Only read when `project` is null: the qualifier row's branch. */
  branchHint?: BranchHint | null;
  /** The project's MCP key for paste payloads. `undefined` = fetch it only
   *  when the step is agent_connect / chat_connect; `null` = never (the MCP
   *  tool: the key must not appear in a chat transcript). */
  mcpToken?: string | null;
};

/** The deferrable ids as a tuple, for zod enums and validation messages. */
export const DEFERRABLE_IDS = [...DEFERRABLE] as [StepId, ...StepId[]];

const ZERO_COUNTS: SetupCounts = {
  site_profile: 0, conventions: 0, suggestions: 0, approved: 0,
  keywords: 0, rank_checks: 0, pages: 0, pages_live: 0,
  pages_with_pr: 0, drafts: 0, drafts_published: 0, drafts_finished: 0, drafts_accepted: 0,
  drafts_blocked_setup: 0, gsc_rows: 0,
};

// ---- live-read memo -------------------------------------------------------
//
// Per PROJECT id (not the status route's old single-entry cache) [R17]:
// several owners' pollers interleave on one lambda, and each poll is every
// 5 s. Per-lambda and best-effort, like install-reconcile.ts's lastAttempt.
// A throw is memoised too (as `undefined`), so a GitHub outage costs one call
// per minute per project, not one per poll.
const LIVE_TTL_MS = 60_000;
const liveMemo = new Map<string, { at: number; value: unknown }>();

async function memo<T>(key: string, load: () => Promise<T>): Promise<T | undefined> {
  const hit = liveMemo.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value as T | undefined;
  let value: T | undefined;
  try {
    value = await load();
  } catch {
    value = undefined;
  }
  if (liveMemo.size > 2000) {
    for (const [k, v] of liveMemo) if (Date.now() - v.at >= LIVE_TTL_MS) liveMemo.delete(k);
  }
  liveMemo.set(key, { at: Date.now(), value });
  return value;
}

/** Drop a project's memoised live reads - after a write that changes what
 *  they would answer (a repo picked, a key saved). */
export function forgetLiveReads(projectId: string): void {
  for (const k of liveMemo.keys()) if (k.startsWith(`${projectId}:`)) liveMemo.delete(k);
}

// ---- snapshot ---------------------------------------------------------------

function asStepIds(v: unknown): StepId[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as StepId[]) : [];
}

async function headCount(
  table: string,
  projectId: string,
  refine?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  try {
    let q = db().from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (refine) q = refine(q);
    const { count, error } = await q;
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

async function loadCounts(projectId: string): Promise<SetupCounts> {
  const [
    site_profile, conventions, suggestions, approved, keywords, rank_checks,
    pages, pages_live, pages_with_pr, drafts, drafts_published, drafts_finished, drafts_accepted,
    drafts_blocked_setup, gsc_rows,
  ] = await Promise.all([
    headCount("site_profile", projectId),
    headCount("conventions", projectId),
    headCount("suggestions", projectId),
    headCount("suggestions", projectId, (q) => q.in("status", ["approved", "in_progress", "done"])),
    headCount("keywords", projectId),
    headCount("rank_checks", projectId),
    headCount("pages", projectId),
    headCount("pages", projectId, (q) => q.not("live_at", "is", null)),
    headCount("pages", projectId, (q) => q.not("pr_url", "is", null)),
    // "Handed in": anything their AI submitted that is still alive. A
    // rejected draft failed the gate and a discarded one was thrown away -
    // neither is an article on its way out.
    headCount("article_drafts", projectId, (q) => q.not("status", "in", "(discarded,rejected)")),
    headCount("article_drafts", projectId, (q) => q.eq("status", "published")),
    headCount("article_drafts", projectId, (q) => q.eq("status", "finished")),
    headCount("article_drafts", projectId, (q) => q.in("status", ["accepted", "finished", "published"])),
    headCount("article_drafts", projectId, (q) => q.eq("status", "blocked_setup")),
    headCount("gsc_stats", projectId),
  ]);
  return {
    site_profile, conventions, suggestions, approved, keywords, rank_checks,
    pages, pages_live, pages_with_pr, drafts, drafts_published, drafts_finished, drafts_accepted,
    drafts_blocked_setup, gsc_rows,
  };
}

/** ONE direct cron_runs read for the setup run's report - never getCronHealth,
 *  which scans thousands of rows [R14]. Same query shape as setup-retry.ts. */
async function loadSetupRun(slug: string): Promise<{ ok: boolean | null; at: string | null }> {
  try {
    const { data, error } = await db()
      .from("cron_runs")
      .select("ok, created_at")
      .eq("job", `seo-setup--${slug}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { ok: null, at: null };
    const row = data as { ok: boolean; created_at: string };
    return { ok: row.ok, at: row.created_at };
  } catch {
    return { ok: null, at: null };
  }
}

function projectSnapshot(p: Project): SetupProjectSnapshot {
  const flags = effectiveAutomations(p); // never the raw columns [R13]
  // A database that hasn't run 0062 reads through projects.ts's fallback
  // column list, so the four 0062 columns come back `undefined` (absent),
  // never null. Each is tolerated: setup_connected_at is derived with the
  // migration's own backfill rule, the rest read as "not yet".
  type Cols0062 = "setup_connected_at" | "setup_deferred" | "agent_last_seen_at" | "agent_credential_at";
  const row = p as Omit<Project, Cols0062> & Partial<Pick<Project, Cols0062>>;
  return {
    slug: p.slug,
    name: p.name,
    domain: p.domain,
    publish_target: publishTarget(p),
    ai_choice: p.ai_choice ?? null,
    agent: p.agent ?? null,
    github_installation_id: p.github_installation_id ?? null,
    github_repo: p.github_repo ?? null,
    repo_token_allowed: instanceTokenAllowedFor(p),
    installation_repo_count: null,
    agent_credential_at: row.agent_credential_at ?? null,
    agent_last_seen_at: row.agent_last_seen_at ?? null,
    chat_last_seen_at: p.chat_last_seen_at ?? null,
    wp_connected: Boolean(p.wp_url && p.wp_app_password),
    gsc_oauth_connected: Boolean(p.gsc_oauth_refresh_token),
    gsc_site_url: p.gsc_site_url ?? null,
    gsc_property_in_list: null,
    gsc_property_count: null,
    setup_connected_at: deriveConnectedAt({
      setup_connected_at: row.setup_connected_at,
      pipeline_installed_at: p.pipeline_installed_at,
      onboarding_screen: p.onboarding_screen,
      github_repo: p.github_repo,
      created_at: p.created_at,
    }),
    setup_deferred: asStepIds(row.setup_deferred),
    install_progress: (p.install_progress as Record<string, string> | null) ?? {},
    pipeline_installed_at: p.pipeline_installed_at ?? null,
    mode: p.mode,
    auto_approve: flags.auto_approve,
    auto_build_guides: flags.auto_build_guides,
    auto_merge: flags.auto_merge,
    created_at: p.created_at,
  };
}

// ---- live reads, only for the step that is current ------------------------

/** Which live read (if any) the given cheap-pass step needs. */
type LiveKind = "repos" | "gsc" | "secret" | "pr" | "prereqs";

function liveNeed(step: SetupStep, s: SetupSnapshot, done: Set<LiveKind>): LiveKind | null {
  const p = s.project;
  if (!p) return null;
  let need: LiveKind | null = null;
  switch (step.id) {
    case "github_repo":
      need = "repos";
      break;
    case "let_us_publish":
      // Only the repo-pick half of let_us_publish has anything to look up.
      if (p.github_installation_id != null && p.github_repo == null) need = "repos";
      break;
    case "gsc_property":
      need = "gsc";
      break;
    case "agent_credential":
      need = "secret";
      break;
    case "install_pr_merge":
      need = "pr";
      break;
    case "actions_toggle":
      need = "prereqs";
      break;
  }
  return need && !done.has(need) ? need : null;
}

async function runLive(kind: LiveKind, project: Project, s: SetupSnapshot): Promise<void> {
  const ps = s.project;
  if (!ps) return;
  const id = project.id;

  if (kind === "repos") {
    const installationId = ps.github_installation_id;
    if (installationId == null) return;
    const repos = await memo(`${id}:repos:${installationId}`, async () => {
      const { listInstallationRepos } = await import("@/lib/github-app");
      return listInstallationRepos(installationId);
    });
    if (!repos) return; // unknown: the form loads the list itself
    ps.installation_repo_count = repos.length;
    // Same rule as the install callback: an installation that covers exactly
    // one repo IS the pick. Saved, so every later step (the secret check, the
    // install) has the repo the engine already counts as chosen.
    if (repos.length === 1 && !ps.github_repo) {
      const { error } = await db()
        .from("projects")
        .update({ github_repo: repos[0].full_name })
        .eq("id", id)
        .is("github_repo", null);
      if (!error) {
        ps.github_repo = repos[0].full_name;
        project.github_repo = repos[0].full_name;
      }
    }
    return;
  }

  if (kind === "gsc") {
    const refresh = project.gsc_oauth_refresh_token;
    if (!refresh) return;
    // Keyed on the token too: reconnecting a different Google account must
    // not answer from the previous account's list.
    const sites = await memo(`${id}:gsc:${refresh.slice(-16)}`, async () => {
      const { oauthListSites } = await import("@/lib/gsc-oauth");
      return oauthListSites(refresh);
    });
    if (!sites) return;
    ps.gsc_property_count = sites.length;
    const names = new Set(sites.map((x) => x.siteUrl));
    if (ps.gsc_site_url && names.has(ps.gsc_site_url)) {
      ps.gsc_property_in_list = true;
      return;
    }
    // Onboarding guesses `sc-domain:<domain>`. When that guess is on the
    // account, it is the answer - save it the way the picker would
    // (setTrackedProperty validates the shape) instead of asking.
    const guess = `sc-domain:${project.domain}`;
    if (names.has(guess)) {
      const { setTrackedProperty } = await import("@/lib/gsc-oauth");
      const err = await setTrackedProperty(id, guess);
      if (!err) {
        ps.gsc_site_url = guess;
        project.gsc_site_url = guess;
        ps.gsc_property_in_list = true;
        forgetLiveReads(id);
        return;
      }
    }
    ps.gsc_property_in_list = false;
    return;
  }

  if (kind === "secret") {
    if (ps.agent_credential_at || !project.github_repo) return;
    const secretName = projectAgent(project).credential.repoSecretName;
    // A throw (no token, GitHub down) is "not yet", never an error on the
    // step [R15]; memo() turns it into undefined.
    const present = await memo(`${id}:secret:${project.github_repo}:${secretName}`, async () => {
      const { checkRepoSecret } = await import("@/lib/github-app-secrets");
      return checkRepoSecret(project, secretName);
    });
    if (present !== true) return;
    const at = new Date().toISOString();
    const { error } = await db()
      .from("projects")
      .update({ agent_credential_at: at })
      .eq("id", id)
      .is("agent_credential_at", null);
    // Even if the stamp write fails (pre-0062 DB), the evidence is real.
    ps.agent_credential_at = at;
    if (!error) project.agent_credential_at = at;
    return;
  }

  if (kind === "pr") {
    if (!project.github_repo) return;
    try {
      // openInstallPr memoises per installation + repo itself, and answers
      // `undefined` (unknown) on any GitHub error - then the
      // install_pr_url hint decides, exactly as on the cheap pass.
      s.health.open_install_pr = await openInstallPr(project);
    } catch {
      // Leave it undefined: the install_pr_url hint decides.
    }
    return;
  }

  if (kind === "prereqs") {
    const repo = project.github_repo;
    if (!repo) return;
    const verdict = await memo(`${id}:prereqs:${repo}`, async () => {
      const { verifyPipelinePrereqs } = await import("@/lib/github");
      return verifyPipelinePrereqs(repo, effectiveAutomations(project).auto_merge, project);
    });
    if (!verdict || !verdict.checked) {
      s.health.actions_toggle_ok = null;
      return;
    }
    // Only the "Allow GitHub Actions to create and approve pull requests"
    // half matters to this step; workflows-not-merged-yet is another step's.
    s.health.actions_toggle_ok = !verdict.problems.some((m) =>
      /create and approve pull requests/i.test(m),
    );
  }
}

// ---- deferral evidence (write-through) ------------------------------------

/** Evidence for a deferrable step, from the snapshot. Mirrors the engine's
 *  connect-phase evidence for the DEFERRABLE ids. A not-loaded live field
 *  (gsc_property_in_list null) is never evidence. */
function deferredMet(id: StepId, s: SetupSnapshot): boolean {
  const p = s.project;
  if (!p) return false;
  switch (id) {
    case "wordpress": return p.wp_connected;
    case "agent_connect": return p.agent_last_seen_at != null;
    case "chat_connect":
      return p.chat_last_seen_at != null || s.counts.drafts > 0 || s.counts.site_profile > 0;
    case "google_connect": return p.gsc_oauth_connected || s.counts.gsc_rows > 0;
    case "gsc_property": return s.counts.gsc_rows > 0 || p.gsc_property_in_list === true;
    default: return false;
  }
}

async function dropMetDeferrals(projectId: string, s: SetupSnapshot): Promise<void> {
  const p = s.project;
  if (!p || p.setup_deferred.length === 0) return;
  const keep = p.setup_deferred.filter((id) => !deferredMet(id, s));
  if (keep.length === p.setup_deferred.length) return;
  // Read-merge-write against the CURRENT row, so a deferral added by another
  // tab since this snapshot was read survives [R-Q7].
  try {
    const { data } = await db().from("projects").select("setup_deferred").eq("id", projectId).maybeSingle();
    const current = asStepIds((data as { setup_deferred?: unknown } | null)?.setup_deferred);
    const next = current.filter((id) => !deferredMet(id, s));
    if (next.length !== current.length) {
      await db().from("projects").update({ setup_deferred: next }).eq("id", projectId);
    }
    p.setup_deferred = next;
  } catch {
    // Display is unaffected: the engine already ignores met deferrals.
  }
}

// ---- public API -------------------------------------------------------------

export async function loadSetupSnapshot(
  project: Project | null,
  origin: string,
  opts: LoadOptions,
): Promise<SetupSnapshot> {
  const now = Date.now();
  if (!project) {
    return {
      project: null,
      branch_hint: opts.branchHint ?? null,
      counts: { ...ZERO_COUNTS },
      health: { setup_ok: null, setup_last_run_at: null, actions_toggle_ok: null, ranks_possible: true },
      origin,
      mcpToken: opts.mcpToken ?? null,
      now,
    };
  }

  // A local copy: live reads patch it as they confirm things.
  const p: Project = { ...project };
  const [counts, setupRun, creds] = await Promise.all([
    loadCounts(p.id),
    loadSetupRun(p.slug),
    // Bundled cloud tenants have no own creds but DO get rank checks, so
    // hasDataforseo() is the wrong question here [R4].
    credsForProject(p, { skipBudgetGate: true }).catch(() => null),
  ]);
  const health: SetupHealth = {
    setup_ok: setupRun.ok,
    setup_last_run_at: setupRun.at,
    actions_toggle_ok: null,
    ranks_possible: creds != null,
    // open_install_pr left undefined = not loaded this pass.
  };
  const s: SetupSnapshot = {
    project: projectSnapshot(p),
    branch_hint: null,
    counts,
    health,
    origin,
    mcpToken: typeof opts.mcpToken === "string" ? opts.mcpToken : null,
    now,
  };

  if (opts.live) {
    // Cheap pass first; a live read runs only for the step that is current.
    // Bounded loop: one confirmed fact can make the next step current (the
    // sole repo saved -> agent_credential's secret check), and that step may
    // need its own read. Each kind runs at most once per load.
    const done = new Set<LiveKind>();
    for (let i = 0; i < 4; i++) {
      const need = liveNeed(computeSetupStep(s), s, done);
      if (!need) break;
      done.add(need);
      await runLive(need, p, s);
    }
    await dropMetDeferrals(p.id, s);
  }
  return s;
}

const NEEDS_TOKEN: ReadonlySet<StepId> = new Set<StepId>(["agent_connect", "chat_connect"]);

/** Counts that satisfy every step's evidence: the probe below has already
 *  proven the one fact `complete` rests on, so nothing else is read. */
const DONE_COUNTS: SetupCounts = {
  site_profile: 1, conventions: 1, suggestions: 1, approved: 1,
  keywords: 1, rank_checks: 1, pages: 1, pages_live: 1,
  pages_with_pr: 1, drafts: 1, drafts_published: 1, drafts_finished: 0, drafts_accepted: 1,
  drafts_blocked_setup: 0, gsc_rows: 0,
};

/** The cheap "is setup over?" probe, run before the full load. Every Home
 *  render and every poll of a finished project otherwise pays ~16 count
 *  queries forever to answer `complete`. True when nothing is parked, an
 *  article is out (a live page, a published draft, or - manual publishing,
 *  whose drafts stop at accepted [R3] - an accepted/finished/published one),
 *  and the GitHub App is not missing (reconnect_app outranks complete). */
async function setupComplete(p: Project): Promise<boolean> {
  if (asStepIds((p as { setup_deferred?: unknown }).setup_deferred).length > 0) return false;
  if (p.github_repo && !p.github_installation_id && !instanceTokenAllowedFor(p)) return false;
  const manual = publishTarget(p) === "manual";
  const [live, published, accepted] = await Promise.all([
    headCount("pages", p.id, (q) => q.not("live_at", "is", null)),
    headCount("article_drafts", p.id, (q) => q.eq("status", "published")),
    manual
      ? headCount("article_drafts", p.id, (q) => q.in("status", ["accepted", "finished", "published"]))
      : Promise.resolve(0),
  ]);
  return live > 0 || published > 0 || accepted > 0;
}

export async function getSetupStep(
  project: Project | null,
  origin: string,
  opts: LoadOptions,
): Promise<SetupStep> {
  if (project && (await setupComplete(project))) {
    const ps = projectSnapshot(project);
    const done = computeSetupStep({
      project: {
        ...ps,
        // A finished project is past connect whatever the stamp says.
        setup_connected_at: ps.setup_connected_at ?? ps.created_at,
        setup_deferred: [],
      },
      branch_hint: null,
      counts: { ...DONE_COUNTS },
      health: { setup_ok: true, setup_last_run_at: null, actions_toggle_ok: true, ranks_possible: false, open_install_pr: null },
      origin,
      mcpToken: null,
      now: Date.now(),
    });
    // Defensive: should the engine ever disagree, fall through to the full
    // load rather than hide a real step.
    if (done.id === "complete") return done;
  }
  const s = await loadSetupSnapshot(project, origin, opts);
  let step = computeSetupStep(s);
  // The key only rides on the two steps whose paste payload IS the key, and
  // only when the caller did not opt out with mcpToken: null.
  if (project && opts.mcpToken === undefined && NEEDS_TOKEN.has(step.id) && !s.mcpToken) {
    const token = await fetchProjectToken(project.id);
    if (token) {
      s.mcpToken = token;
      step = computeSetupStep(s);
    }
  }
  return step;
}

/** The page-render read, shared by the dashboard layout and Home in one
 *  request. Keyed on two STRINGS because React's cache() compares arguments
 *  by identity [R19]. Cheap pass only - no GitHub or Google call on a page
 *  render [R14]. Null when the slug names no project. */
export const getSetupStepCached = cache(
  async (slug: string, origin: string): Promise<SetupStep | null> => {
    const project = await getProjectBySlug(slug);
    if (!project) return null;
    return getSetupStep(project, origin, { live: false });
  },
);

// ---- deferral writes (shared by the dashboard actions and the MCP tool) ----

export type DeferResult = { ok: true; deferred: StepId[] } | { error: string };

function validateDeferrable(stepId: string): StepId | null {
  return DEFERRABLE.has(stepId as StepId) ? (stepId as StepId) : null;
}

async function writeDeferred(
  projectId: string,
  change: (current: StepId[]) => StepId[],
): Promise<DeferResult> {
  // Read-merge-write: supabase-js has no array_append [R-Q7].
  const { data, error } = await db()
    .from("projects")
    .select("setup_deferred")
    .eq("id", projectId)
    .maybeSingle();
  if (error) return { error: deferWriteError(error.message) };
  if (!data) return { error: "Unknown project." };
  const current = asStepIds((data as { setup_deferred?: unknown }).setup_deferred);
  const next = [...new Set(change(current))];
  if (next.length === current.length && next.every((id, i) => id === current[i])) {
    return { ok: true, deferred: current };
  }
  const upd = await db().from("projects").update({ setup_deferred: next }).eq("id", projectId);
  if (upd.error) return { error: deferWriteError(upd.error.message) };
  return { ok: true, deferred: next };
}

/** Never the raw Supabase message (table / column / constraint names are
 *  not for the owner): the one cause the owner's operator can fix gets its
 *  own sentence, everything else the generic retry line. */
function deferWriteError(message: string): string {
  return /setup_deferred|column/i.test(message)
    ? "This database hasn't run migration 0062 yet, so steps can't be parked. Apply supabase/migrations/0062_setup_path.sql and try again."
    : "Couldn't save that - reload and try again.";
}

/** Park a step ("I'll do this later"). Only DEFERRABLE ids; idempotent. */
export async function deferStep(projectId: string, stepId: string): Promise<DeferResult> {
  const id = validateDeferrable(stepId);
  if (!id) return { error: `"${stepId}" can't be parked. Parkable steps: ${DEFERRABLE_IDS.join(", ")}.` };
  // Parking Google parks the property pick with it (expandDeferral), so
  // connecting Google later still brings the pick back [#4].
  return writeDeferred(projectId, (current) => [...current, ...expandDeferral(id)]);
}

/** Un-park a step, so it is the next action again when its turn comes. */
export async function undeferStep(projectId: string, stepId: string): Promise<DeferResult> {
  const id = validateDeferrable(stepId);
  if (!id) return { error: `"${stepId}" can't be parked. Parkable steps: ${DEFERRABLE_IDS.join(", ")}.` };
  const ids = new Set(expandDeferral(id));
  return writeDeferred(projectId, (current) => current.filter((x) => !ids.has(x)));
}

// Tests the setup-path step engine (src/lib/setup-path-core.ts) - the pure
// function that picks the ONE step in front of a hosted customer.
//
//   node --experimental-strip-types scripts/setup-path-test.mjs
//
// No env, no network: every snapshot is synthetic (src/components/setup-path/
// fixtures.ts, the same fixtures the dev-only /onboarding/preview route
// renders). Covers: exactly one step per fixture; the per-branch ordering
// (walking a snapshot forward by flipping evidence); auto-done rules; the
// deferral rule; legacy rows; install auto-fire (once, never after an attempt);
// slow-after thresholds; the manual-publish completion rule [R3]; and
// reconnect_app outranking waits.
import {
  computeSetupStep,
  connectSteps,
  DEFERRABLE,
  aiKindOf,
  deriveConnectedAt,
  expandDeferral,
} from "../src/lib/setup-path-core.ts";
import {
  allFixtures,
  applyOverrides,
  ago,
  baseSnapshot,
  BRANCH_FIXTURES,
  deferral,
  github_chat,
  github_coding,
  legacy,
  LEGACY_EXPECT,
  manual_chat,
  manual_coding,
  variants,
  walk,
  WALK,
  wordpress_chat,
  wordpress_coding,
} from "../src/components/setup-path/fixtures.ts";

let failed = 0;
let passed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) {
    console.log(`✗ ${name}${detail ? ` - ${detail}` : ""}`);
    failed++;
  } else {
    passed++;
    if (process.env.VERBOSE) console.log(`✓ ${name}${detail ? ` - ${detail}` : ""}`);
  }
};
const section = (t) => console.log(`\n== ${t}`);

const CONNECT_IDS = new Set([
  "site", "github_app", "github_repo", "wordpress", "agent_credential",
  "agent_connect", "chat_connect", "google_connect", "gsc_property", "connected",
]);
const KINDS = new Set(["do", "wait", "done"]);
const PHASES = new Set(["connect", "launch", "first-article", "complete"]);

// ---- 1. every fixture: exactly one well-formed step -------------------------
section("every fixture yields exactly one well-formed step");
const fixtures = allFixtures();
for (const f of fixtures) {
  let step;
  try {
    step = computeSetupStep(f.snapshot);
  } catch (e) {
    check(`${f.name}: computes`, false, String(e));
    continue;
  }
  const one =
    step && typeof step === "object" && !Array.isArray(step) &&
    typeof step.id === "string" && KINDS.has(step.kind) && PHASES.has(step.phase);
  check(`${f.name}: one step`, one, JSON.stringify(step?.id));
  if (!one) continue;
  check(`${f.name}: expected ${f.expect}`, step.id === f.expect, `got ${step.id}`);
  check(`${f.name}: has a title`, step.id === "complete" || step.title.length > 0);
  check(`${f.name}: primary present`, step.primary && typeof step.primary.kind === "string");
  check(
    `${f.name}: waits have no button`,
    step.kind !== "wait" || step.primary.kind === "none",
  );
  check(
    `${f.name}: waits carry timing`,
    step.kind !== "wait" || (step.waiting && step.waiting.slowAfterMs > 0 && step.waiting.typical),
  );
  check(`${f.name}: waits poll`, step.kind !== "wait" || step.polls === true);
  // In the connect phase every DEFERRABLE do step offers "later"; after it,
  // a DEFERRABLE step only ever shows because it is parked (or is the
  // blocked-WordPress case), so "later" would do nothing there [#9].
  check(
    `${f.name}: deferrable only where parking does something`,
    step.deferrable === (step.kind === "do" && DEFERRABLE.has(step.id) && step.phase === "connect"),
    `deferrable=${step.deferrable} ${step.kind}/${step.phase}`,
  );
  check(
    `${f.name}: rail well-formed`,
    step.rail.total === step.rail.labels.length && step.rail.index >= 0 && step.rail.index <= step.rail.total,
  );
  check(
    `${f.name}: copy primaries carry text`,
    step.primary.kind !== "copy" || step.primary.text.length > 0,
  );
}
check("fixture count is substantial", fixtures.length >= 80, `${fixtures.length} fixtures`);

// ---- 2. ordering: walk each branch forward by flipping evidence -------------
section("per-branch ordering (walk forward)");
const EXPECTED_CONNECT = {
  github_coding: ["site", "github_app", "github_repo", "agent_credential", "google_connect", "gsc_property", "connected"],
  github_chat: ["site", "chat_connect", "google_connect", "gsc_property", "connected"],
  wordpress_coding: ["site", "wordpress", "agent_connect", "google_connect", "gsc_property", "connected"],
  wordpress_chat: ["site", "wordpress", "chat_connect", "google_connect", "gsc_property", "connected"],
  manual_coding: ["site", "agent_connect", "google_connect", "gsc_property", "connected"],
  manual_chat: ["site", "chat_connect", "google_connect", "gsc_property", "connected"],
};
const EXPECTED_LAUNCH = {
  github_coding: ["pipeline_install", "install_pr_merge", "actions_toggle", "setup_running", "first_research", "approve_idea", "first_ranks", "first_build", "merge_first_pr", "complete"],
  github_chat: ["let_us_publish", "let_us_publish", "chat_setup", "chat_research", "approve_idea", "write_first", "publishing", "complete"],
  wordpress_coding: ["agent_setup", "agent_research", "approve_idea", "write_first", "publishing", "complete"],
  wordpress_chat: ["chat_setup", "chat_research", "approve_idea", "write_first", "publishing", "complete"],
  manual_coding: ["agent_setup", "agent_research", "approve_idea", "write_first", "publishing", "complete"],
  manual_chat: ["chat_setup", "chat_research", "approve_idea", "write_first", "publishing", "complete"],
};
for (const branch of Object.keys(EXPECTED_CONNECT)) {
  const [publish, kind] = branch.split("_");
  const cs = connectSteps(publish, kind);
  check(`${branch}: connectSteps`, JSON.stringify(cs) === JSON.stringify(EXPECTED_CONNECT[branch]), cs.join(" → "));

  // site step from the qualifier hint, then the walk
  const siteStep = computeSetupStep(BRANCH_FIXTURES[branch].site);
  check(`${branch}: no project → site`, siteStep.id === "site" && siteStep.primary.kind === "form" && siteStep.primary.form === "site");
  check(`${branch}: site rail = branch labels`, siteStep.rail.total === cs.length && siteStep.rail.index === 0);

  const seq = ["site", ...walk(branch).map(({ snapshot }) => computeSetupStep(snapshot).id)];
  const want = [...EXPECTED_CONNECT[branch], ...EXPECTED_LAUNCH[branch]];
  check(`${branch}: full sequence`, JSON.stringify(seq) === JSON.stringify(want), `\n    got  ${seq.join(" → ")}\n    want ${want.join(" → ")}`);

  // Every connect-phase stage: phase connect + rail index == its position.
  for (const { snapshot } of walk(branch)) {
    const st = computeSetupStep(snapshot);
    if (snapshot.project.setup_connected_at == null) {
      check(`${branch}/${st.id}: connect phase`, st.phase === "connect");
      check(`${branch}/${st.id}: rail index`, st.rail.labels.length === cs.length && st.rail.index === cs.indexOf(st.id), `${st.rail.index} vs ${cs.indexOf(st.id)}`);
    } else {
      check(`${branch}/${st.id}: post-connect is never a connect step`, !CONNECT_IDS.has(st.id) && st.phase !== "connect", `${st.id}/${st.phase}`);
    }
  }
  check(`${branch}: WALK ends at complete`, WALK[branch].at(-1).expect === "complete");
}

// github x chat: no github_app/github_repo in connect (T10); let_us_publish copy.
{
  const cs = connectSteps("github", "chat");
  check("github×chat: connect omits github_app/github_repo", !cs.includes("github_app") && !cs.includes("github_repo"));
  const a = computeSetupStep(github_chat.let_us_publish);
  check("let_us_publish (App): title", a.title === "Let us publish to your repo");
  check("let_us_publish (App): why", a.why === "Your Claude writes; we open the pull request. One click on GitHub lets us.");
  check("let_us_publish (App): install link", a.primary.kind === "link" && a.primary.href === "/api/github/install/start?slug=acme");
  check("let_us_publish (App): launch phase", a.phase === "launch");
  const b = computeSetupStep(github_chat.let_us_publish__2);
  check("let_us_publish (repo): repo form", b.primary.kind === "form" && b.primary.form === "github_repo");
  check("let_us_publish (repo): same title", b.title === "Let us publish to your repo");
}

// ---- 3. auto-done rules -----------------------------------------------------
section("auto-done rules");
for (const [name, v] of Object.entries(variants)) {
  const st = computeSetupStep(v.snapshot);
  check(`variant ${name}: ${v.note}`, st.id === v.expect, `got ${st.id}`);
}
{
  const st = computeSetupStep(variants.repo_count_zero.snapshot);
  check("repo count 0: error + 'Choose which repos to share'", st.error != null && st.primary.kind === "link" && st.primary.label === "Choose which repos to share");
  const nl = computeSetupStep(variants.gsc_no_properties.snapshot);
  check("no GSC properties: error message", nl.error?.message === "We don't see any properties on this Google account" && Boolean(nl.error.fixHref));
  check("no GSC properties: 'Skip, connect later'", nl.instructions.some((i) => i.text === "Skip, connect later"));
  const pick = computeSetupStep(variants.gsc_property_not_in_list.snapshot);
  check("guess not in list: radio form, no error", pick.primary.kind === "form" && pick.primary.form === "gsc_property" && pick.error == null);
  const am = computeSetupStep(variants.auto_merge_wait.snapshot);
  check("auto_merge: wait 'Publishing your first article'", am.kind === "wait" && am.title === "Publishing your first article");
  const mm = computeSetupStep(github_coding.merge_first_pr);
  check("semi: do 'Merge your first article' → /pages", mm.kind === "do" && mm.title === "Merge your first article" && mm.primary.href === "/pages");
  const ap = computeSetupStep(github_coding.approve_idea);
  check("approve_idea: Queue link with count", ap.primary.kind === "link" && ap.primary.href === "/research" && ap.primary.label === "Open the Queue (5 waiting)");
}

// ---- 4. install auto-fire around the 10-minute boundary --------------------
section("install auto-fire");
{
  const never = computeSetupStep(variants.install_never_attempted.snapshot);
  check("never attempted → autoFire true", never.primary.kind === "action" && never.primary.action === "run_pipeline_install" && never.primary.autoFire === true);
  check("never attempted → no error", never.error == null);
  const nine = computeSetupStep(variants.install_attempted_9min.snapshot);
  check("attempted 9 min ago → autoFire false", nine.primary.autoFire === false);
  check("attempted 9 min ago, not fired → error + Retry", nine.error != null && nine.primary.label === "Try again");
  // #7: a stamped attempt never auto-fires again, however old - the owner
  // presses Retry. (Was: re-fire after a 10-minute cooldown.)
  const eleven = computeSetupStep(variants.install_attempted_11min.snapshot);
  check("#7 attempted 11 min ago → autoFire false (Retry only)", eleven.primary.autoFire === false && eleven.primary.label === "Try again");
  const edge = (m) => computeSetupStep(applyOverrides(variants.install_never_attempted.snapshot, { project: { install_progress: { install_attempted_at: ago(m) } } })).primary.autoFire;
  check("#7 attempted 10 min ago → autoFire false", edge(10 * 60_000) === false);
  check("#7 attempted 3 days ago → autoFire false", edge(3 * 24 * 3600_000) === false);
  const flight = computeSetupStep(variants.install_in_flight.snapshot);
  check("in flight (30 s) → no error, no autoFire", flight.error == null && flight.primary.autoFire === false);
  const msg = computeSetupStep(applyOverrides(variants.install_attempted_9min.snapshot, { project: { install_progress: { install_error: "Repo is archived" } } }));
  check("install_error text surfaces", msg.error?.message === "Repo is archived");
  check("only pipeline_install carries autoFire", fixtures.every((f) => {
    const st = computeSetupStep(f.snapshot);
    return st.primary.kind !== "action" || st.primary.action === "run_pipeline_install" || st.primary.autoFire === undefined;
  }));
}

// ---- 5. slow-after thresholds ---------------------------------------------
section("slow-after thresholds");
{
  const s44 = computeSetupStep(variants.setup_44min.snapshot);
  check("setup 44 min → wait", s44.kind === "wait" && s44.waiting.typical === "5–15 minutes");
  check("setup slowAfter = 45 min", s44.waiting.slowAfterMs === 45 * 60_000);
  check("setup slowHref = repo actions", s44.waiting.slowHref === "https://github.com/acme/site/actions");
  const s46 = computeSetupStep(variants.setup_46min_never_ran.snapshot);
  check("setup 46 min, no run → do retry_setup", s46.kind === "do" && s46.primary.kind === "action" && s46.primary.action === "retry_setup" && s46.primary.label === "Start setup again");
  const s46r = computeSetupStep(variants.setup_46min_running.snapshot);
  check("setup 46 min, run exists → still wait", s46r.kind === "wait");
  const failedRun = computeSetupStep(applyOverrides(variants.setup_44min.snapshot, { health: { setup_ok: false, setup_last_run_at: ago(5 * 60_000) } }));
  check("setup run failed → wait with error", failedRun.kind === "wait" && failedRun.error != null);
  const r29 = computeSetupStep(variants.research_29min.snapshot);
  check("research 29 min → wait", r29.kind === "wait" && r29.waiting.slowAfterMs === 30 * 60_000);
  const r31 = computeSetupStep(variants.research_31min.snapshot);
  check("research 31 min → do retry_research", r31.kind === "do" && r31.primary.action === "retry_research" && r31.primary.label === "Run research now");
  const ranks = computeSetupStep(github_coding.first_ranks);
  check("ranks: typical 'a few minutes', slowAfter 26 h, hint only", ranks.kind === "wait" && ranks.waiting.typical === "a few minutes" && ranks.waiting.slowAfterMs === 26 * 3600_000 && ranks.waiting.slowHint.length > 0);
  const ranksLate = computeSetupStep(applyOverrides(github_coding.first_ranks, { now: github_coding.first_ranks.now + 30 * 3600_000 }));
  check("ranks after 30 h → still a wait (hint only)", ranksLate.kind === "wait");
  const build = computeSetupStep(github_coding.first_build);
  check("build: typical tonight, slowAfter 36 h, Automations", build.waiting.typical === "tonight, after midnight UTC" && build.waiting.slowAfterMs === 36 * 3600_000 && build.waiting.slowHref === "/automations");
}

// ---- 6. deferral rule -----------------------------------------------------
section("deferral rule");
for (const [name, v] of Object.entries(deferral)) {
  const st = computeSetupStep(v.snapshot);
  check(`deferral ${name}: ${v.note}`, st.id === v.expect, `got ${st.id}`);
}
{
  const over = computeSetupStep(deferral.parked_google_over_wait.snapshot);
  check("deferred do over a wait: kind do", over.kind === "do");
  check("deferred do over a wait: meanwhile = the wait's title", over.meanwhile === "Your agent is learning your site", String(over.meanwhile));
  check("deferred do over a wait: phase of the wait", over.phase === "launch");
  check("deferred do over a wait: polls", over.polls === true);
  check("deferred google from Home returns to dashboard", over.primary.href === "/api/oauth/google/start?returnTo=dashboard&slug=acme");
  check("deferred list carries it", JSON.stringify(over.deferred) === '["google_connect"]');
  const blocks = computeSetupStep(deferral.parked_google_blocks_complete.snapshot);
  check("unmet deferred blocks complete", blocks.id !== "complete" && blocks.meanwhile == null);
  check("deferred surfaced at the end is never a connect-phase step", blocks.phase !== "connect");
  const notDo = computeSetupStep(deferral.parked_google_not_over_do.snapshot);
  check("deferred does not outrank a do (no meanwhile)", notDo.meanwhile == null);
  const conn = computeSetupStep(deferral.connect_skips_parked_google.snapshot);
  check("connected screen lists parked steps", conn.instructions.some((i) => i.text === "Parked for later: Search Console"));
  check("connected screen mode note", conn.instructions.some((i) => i.text === "Nothing goes live without you. Prefer hands-off? Flip Auto in the top bar."));
  check("connected: one link to /dashboard", conn.kind === "done" && conn.primary.kind === "link" && conn.primary.href === "/dashboard");
  const wpb = computeSetupStep(deferral.wordpress_blocked_unparked.snapshot);
  check("blocked WordPress draft: meanwhile publishing", wpb.meanwhile === "Checking and publishing your article");
  // A parked gsc_property without Google surfaces as google_connect.
  const gp = computeSetupStep(applyOverrides(github_coding.first_build, { project: { gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["gsc_property"] } }));
  check("parked property without Google → google_connect", gp.id === "google_connect");
  // A parked step from another branch is ignored.
  const other = computeSetupStep(applyOverrides(github_coding.complete, { project: { setup_deferred: ["wordpress"] } }));
  check("deferred id not on this branch is ignored", other.id === "complete");
  // DEFERRABLE membership
  const want = ["wordpress", "agent_connect", "chat_connect", "google_connect", "gsc_property"];
  check("DEFERRABLE set", want.every((id) => DEFERRABLE.has(id)) && DEFERRABLE.size === want.length);
}

// ---- 7. legacy rows ---------------------------------------------------------
section("legacy rows");
for (const [name, snap] of Object.entries(legacy)) {
  const st = computeSetupStep(snap);
  check(`legacy ${name}`, st.id === LEGACY_EXPECT[name], `got ${st.id}`);
  if (snap.project?.setup_connected_at) {
    check(`legacy ${name}: never a connect step`, !CONNECT_IDS.has(st.id) && st.phase !== "connect" || DEFERRABLE.has(st.id) && st.phase !== "connect", `${st.id}/${st.phase}`);
  }
}
check("aiKindOf(null) = coding", aiKindOf(null) === "coding");
check("aiKindOf(undefined) = coding", aiKindOf(undefined) === "coding");
check("aiKindOf('claude-web') = chat", aiKindOf("claude-web") === "chat");
check("aiKindOf('chatgpt') = chat", aiKindOf("chatgpt") === "chat");
check("aiKindOf('codex') = coding", aiKindOf("codex") === "coding");
{
  // null ai_choice on a github project walks github x coding's connect order.
  const seq = walk("github_coding").map(({ snapshot }) =>
    computeSetupStep(applyOverrides(snapshot, { project: { ai_choice: null } })).id);
  check("ai_choice null walks the coding chain", seq[2] === "agent_credential" && seq.includes("pipeline_install"));
  // A connected row with no connect evidence whatsoever, no deferrals.
  const bare = baseSnapshot({ project: { setup_connected_at: ago(3600_000), publish_target: "wordpress", ai_choice: "claude-web", agent: null } });
  const st = computeSetupStep(bare);
  check("connected row, zero evidence → not a connect step", st.phase !== "connect" && !CONNECT_IDS.has(st.id), st.id);
}

// ---- 8. manual completion [R3] ---------------------------------------------
section("manual completion");
{
  const acc = computeSetupStep(applyOverrides(manual_coding.publishing, { counts: { drafts_accepted: 1 } }));
  check("manual: accepted draft → complete", acc.id === "complete");
  check("manual complete: Drafts note", acc.instructions.some((i) => i.text === "Your articles are on the Drafts screen with a Copy button"));
  const accChat = computeSetupStep(applyOverrides(manual_chat.publishing, { counts: { drafts_accepted: 1 } }));
  check("manual × chat: accepted draft → complete", accChat.id === "complete");
  const wpAcc = computeSetupStep(applyOverrides(wordpress_chat.publishing, { counts: { drafts_accepted: 1 } }));
  check("wordpress: accepted (not published) is still publishing", wpAcc.id === "publishing");
  const wpPub = computeSetupStep(applyOverrides(wordpress_coding.publishing, { counts: { drafts_published: 1 } }));
  check("wordpress: published → complete", wpPub.id === "complete" && wpPub.instructions.length === 0);
  const ghDone = computeSetupStep(github_coding.complete);
  check("github × coding: pages_live → complete (done, complete phase)", ghDone.kind === "done" && ghDone.phase === "complete");
}

// ---- 9. reconnect_app -------------------------------------------------------
section("reconnect_app");
{
  for (const f of fixtures) {
    const p = f.snapshot.project;
    if (!p || !p.setup_connected_at) continue;
    const gone = applyOverrides(f.snapshot, { project: { github_repo: p.github_repo ?? "acme/site", github_installation_id: null } });
    const st = computeSetupStep(gone);
    check(`${f.name}: reconnect_app outranks`, st.id === "reconnect_app", st.id);
  }
  const st = computeSetupStep(variants.reconnect_over_wait.snapshot);
  check("reconnect_app: install link", st.primary.kind === "link" && st.primary.href === "/api/github/install/start?slug=acme");
  check("reconnect_app: title", st.title === "Reconnect the GitHub App");
  // Before connect, a repo without installation is just the github_app step.
  const pre = computeSetupStep(applyOverrides(github_coding.github_app, { project: { github_repo: "acme/site" } }));
  check("pre-connect: no reconnect_app", pre.id === "github_app");
}

// ---- 10. copy & polls ------------------------------------------------------
section("copy and polls");
{
  const t = (fx) => computeSetupStep(fx);
  check("site title", t(github_coding.site).title === "What's your website?");
  check("github_app title", t(github_coding.github_app).title === "Install the DispatchSEO GitHub App");
  const app = t(github_coding.github_app);
  check("github_app: 3 steps + not-technical + org line", app.instructions.length === 5 && app.instructions[3].detail?.includes("whoever owns your site's code") && app.instructions[4].text.startsWith("Repo in an organization?"));
  check("github_app polls", app.polls === true);
  check("github_repo title", t(github_coding.github_repo).title === "Which repo is your site?");
  check("wordpress title", t(wordpress_chat.wordpress).title === "Connect your WordPress");
  const cred = t(github_coding.agent_credential);
  check("agent_credential title", cred.title === "Give Claude Code a key to your repo");
  check("agent_credential: setup-token command", cred.instructions.some((i) => i.copy === "claude setup-token"));
  check("agent_credential: install-first link", cred.instructions.some((i) => i.text === "Never used Claude Code before? Install it first"));
  check("agent_credential: different-agent link", cred.instructions.some((i) => i.text === "Using a different agent?"));
  check("agent_credential: does not poll", cred.polls === false);
  const ac = t(manual_coding.agent_connect);
  check("agent_connect title (Cursor)", ac.title === "Connect Cursor to this site");
  check("agent_connect: 3 instructions", ac.instructions.length === 3 && ac.instructions[2].text === "Then open Cursor in that folder and say: `Say hello to DispatchSEO`.");
  check("agent_connect evidence", ac.evidence === "This turns green on its own the moment your agent reaches us.");
  check("agent_connect polls", ac.polls === true);
  const cc = t(wordpress_chat.chat_connect);
  check("chat_connect title", cc.title === "Connect your Claude app");
  check("chat_connect: connector URL", cc.primary.kind === "copy" && cc.primary.text === "https://dispatchseo.com/api/mcp?key=tok_fixture&client=chat");
  check("chat_connect: password line", cc.instructions.some((i) => i.text.startsWith("This address is a password")));
  check("chat_connect: Add custom connector step", cc.instructions.some((i) => i.text.includes("Add custom connector")));
  check("chat_connect polls", cc.polls === true);
  const ccNoTok = t(applyOverrides(wordpress_chat.chat_connect, { mcpToken: null }));
  check("chat_connect without token never leaks a key", ccNoTok.primary.kind === "link");
  const g = t(github_coding.google_connect);
  check("google_connect title", g.title === "Connect Google Search Console");
  check("google_connect: connect-phase returnTo=onboarding + slug (#18)", g.primary.href === "/api/oauth/google/start?returnTo=onboarding&slug=acme");
  check("google_connect: domain in instruction", g.instructions[0].text === "Sign in with the Google account that manages acme.com in Search Console.");
  check("google_connect: Search Console external link", g.instructions.some((i) => i.text === "Not in Search Console yet? Add it there first" && i.external));
  check("google_connect polls", g.polls === true);
  check("gsc_property title", t(github_coding.gsc_property).title === "Which Search Console property is acme.com?");
  check("connected title", t(github_coding.connected).title === "You're connected.");
  const pi = t(github_coding.pipeline_install);
  check("pipeline_install title", pi.title === "Installing your pipeline…");
  const pr = t(github_coding.install_pr_merge);
  check("install_pr_merge → PR url", pr.title === "Merge the install pull request" && pr.primary.href === "https://github.com/acme/site/pull/1");
  const prHint = t(applyOverrides(github_coding.install_pr_merge, { health: { open_install_pr: undefined } }));
  check("install_pr_merge cheap pass uses the jsonb hint", prHint.id === "install_pr_merge" && prHint.primary.href === "https://github.com/acme/site/pull/1");
  const at = t(github_coding.actions_toggle);
  check("actions_toggle title + settings link + polls", at.title === "One GitHub toggle needs your click" && at.primary.href === "https://github.com/acme/site/settings/actions" && at.polls);
  const noToggle = t(applyOverrides(github_coding.actions_toggle, { project: { install_progress: { actions_toggle_needed: "" } } }));
  check("actions_toggle only when actions_toggle_needed", noToggle.id === "setup_running");
  check("setup_running title", t(github_coding.setup_running).title === "Your agent is learning your site");
  check("first_research title", t(github_coding.first_research).title === "Researching your first keywords");
  check("first_ranks title", t(github_coding.first_ranks).title === "Pulling your first rankings");
  check("approve_idea title", t(github_coding.approve_idea).title === "Approve the ideas you like");
  check("first_build title", t(github_coding.first_build).title === "Writing your first article");
  const cs = t(wordpress_chat.chat_setup);
  check("chat_setup title + paste", cs.title === "Let it learn your business" && cs.primary.text === "Use the DispatchSEO connector and run the setup-chat workflow from get_instructions.");
  const as = t(wordpress_coding.agent_setup);
  check("agent_setup paste", as.title === "Let it learn your business" && as.primary.text === "Run the setup-chat workflow from get_instructions.");
  const cr = t(manual_chat.chat_research);
  check("chat_research title + paste", cr.title === "Ask it for article ideas" && cr.primary.text === "Use the DispatchSEO connector and run the research-chat workflow from get_instructions. Find five article ideas and propose them.");
  const wf = t(wordpress_chat.write_first);
  check("write_first title + paste", wf.title === "Ask it to write the first one" && wf.primary.text === "Use the DispatchSEO connector and run the write-guide-chat workflow from get_instructions. Write my next approved article.");
  check("publishing title", t(wordpress_chat.publishing).title === "Checking and publishing your article");
}


// ---- 11. review fixes ---------------------------------------------------------
section("review fixes");
{
  const t = (fx) => computeSetupStep(fx);
  const connectedGh = (o = {}) => applyOverrides(github_coding.pipeline_install, o);

  // #1 legacy repos never auto-install
  const legacyProfile = t(connectedGh({ counts: { site_profile: 1 } }));
  check("#1 legacy: profile, no install stamp → skips install (first_research)", legacyProfile.id === "first_research", legacyProfile.id);
  const legacyIdeas = t(connectedGh({ counts: { suggestions: 4 } }));
  check("#1 legacy: suggestions, no install stamp → approve_idea", legacyIdeas.id === "approve_idea", legacyIdeas.id);
  const legacyPr = t(connectedGh({ counts: { suggestions: 2, approved: 1, rank_checks: 3, pages_with_pr: 1 } }));
  check("#1 legacy: content PR, no install stamp → merge_first_pr", legacyPr.id === "merge_first_pr", legacyPr.id);
  const legacyHint = t(applyOverrides(github_coding.install_pr_merge, { counts: { site_profile: 1 } }));
  check("#1 legacy: stale install PR hint ignored once setup ran", legacyHint.id === "first_research", legacyHint.id);
  const legacyToggle = t(applyOverrides(github_coding.actions_toggle, { counts: { conventions: 1 } }));
  check("#1 legacy: actions_toggle skipped once setup ran", legacyToggle.id === "first_research", legacyToggle.id);
  const fresh = t(connectedGh());
  check("#1 fresh project still installs (autoFire)", fresh.id === "pipeline_install" && fresh.primary.autoFire === true);

  // #3 github x chat on Semi: the finished draft waits in a PR
  const semiFinished = applyOverrides(github_chat.publishing, { counts: { drafts_finished: 1, drafts_published: 0 } });
  const m = t(semiFinished);
  check("#3 github×chat semi, finished draft → merge_first_pr do", m.id === "merge_first_pr" && m.kind === "do", m.id);
  check("#3 merge_first_pr title + why", m.title === "Merge your first article" && m.why === "It's written and checked. It goes live when you merge the pull request.");
  check("#3 merge_first_pr links /drafts", m.primary.kind === "link" && m.primary.href === "/drafts");
  check("#3 merge_first_pr polls", m.polls === true);
  check("#3 done when drafts_published > 0", t(applyOverrides(semiFinished, { counts: { drafts_published: 1 } })).id === "complete");
  check("#3 done when pages_live > 0", t(applyOverrides(semiFinished, { counts: { pages_live: 1 } })).id === "complete");
  const autoFinished = t(applyOverrides(semiFinished, { project: { mode: "auto", auto_approve: true, auto_merge: true } }));
  check("#3 auto_merge keeps the publishing wait", autoFinished.id === "publishing" && autoFinished.kind === "wait", autoFinished.id);
  const wpFinished = t(applyOverrides(wordpress_chat.publishing, { counts: { drafts_finished: 1 } }));
  check("#3 wordpress unaffected (publishing)", wpFinished.id === "publishing", wpFinished.id);

  // #4 parked Google parks the property pick with it
  check("#4 expandDeferral(google_connect) adds gsc_property", JSON.stringify(expandDeferral("google_connect")) === '["google_connect","gsc_property"]');
  check("#4 expandDeferral(wordpress) is itself", JSON.stringify(expandDeferral("wordpress")) === '["wordpress"]');
  // Google connected later (google_connect met and dropped by the loader),
  // property guess not on the account: the pick must come back.
  const pickBack = t(applyOverrides(github_coding.first_build, {
    project: { gsc_oauth_connected: true, gsc_site_url: "sc-domain:acme.com", gsc_property_in_list: false, gsc_property_count: 3, setup_deferred: ["google_connect"] },
  }));
  check("#4 parked google, connected later, property unconfirmed → gsc_property surfaces", pickBack.id === "gsc_property", pickBack.id);
  const pickConnect = t(applyOverrides(github_coding.gsc_property, { project: { setup_deferred: ["google_connect"], gsc_property_in_list: false, gsc_property_count: 3 } }));
  check("#4 connect phase: parked google skips the pick too", pickConnect.id === "connected", pickConnect.id);
  const oneEntry = t(deferral.parked_google_over_wait.snapshot);
  check("#4 parked google lists once (not google + property)", JSON.stringify(oneEntry.deferred) === '["google_connect"]', JSON.stringify(oneEntry.deferred));

  // #5 parked connector surfaces over the steps that need it
  for (const k of ["chat_parked_over_chat_setup", "chat_parked_over_chat_research", "agent_parked_over_agent_setup", "agent_parked_over_agent_research"]) {
    const st = t(deferral[k].snapshot);
    check(`#5 ${k}`, st.id === deferral[k].expect && st.kind === "do" && st.phase !== "connect", `${st.id}/${st.phase}`);
    check(`#5 ${k}: polls`, st.polls === true);
  }
  const notParked = t(applyOverrides(manual_chat.chat_setup, { project: { chat_last_seen_at: null } }));
  check("#5 unparked missing connector does not hijack chat_setup", notParked.id === "chat_setup", notParked.id);

  // #6 deferral evidence that can actually be met
  const svcGsc = t(applyOverrides(github_coding.first_build, { project: { gsc_oauth_connected: false, gsc_site_url: null, setup_deferred: ["google_connect"] }, counts: { gsc_rows: 40 } }));
  check("#6 google_connect met by gsc_rows (service account)", svcGsc.id === "first_build", svcGsc.id);
  const chatByDraft = t(applyOverrides(manual_chat.publishing, { project: { chat_last_seen_at: null, setup_deferred: ["chat_connect"] } }));
  check("#6 chat_connect met by a handed-in draft", chatByDraft.id === "publishing", chatByDraft.id);
  const chatByProfile = t(applyOverrides(manual_chat.chat_research, { project: { chat_last_seen_at: null, setup_deferred: ["chat_connect"] } }));
  check("#6 chat_connect met by site_profile", chatByProfile.id === "chat_research", chatByProfile.id);
  const chatConnectPhase = t(applyOverrides(manual_chat.chat_connect, { counts: { site_profile: 1 } }));
  check("#6 connect phase: site_profile satisfies chat_connect", chatConnectPhase.id === "google_connect", chatConnectPhase.id);

  // #7 failure flags
  const errNoAge = t(applyOverrides(github_coding.pipeline_install, { project: { install_progress: { install_attempted_at: ago(20_000), install_error: "Repo is archived" } } }));
  check("#7 install_error → failed even inside the stall window", errNoAge.error?.message === "Repo is archived" && errNoAge.primary.label === "Try again" && errNoAge.primary.autoFire === false);
  const errNoAttempt = t(applyOverrides(github_coding.pipeline_install, { project: { install_progress: { install_error: "boom" } } }));
  check("#7 install_error with no attempt stamp still shows failed", errNoAttempt.error?.message === "boom");

  // #9 "later" only where it does something
  const parkedSurfaced = t(deferral.parked_google_over_wait.snapshot);
  check("#9 surfaced parked google: not deferrable", parkedSurfaced.deferrable === false);
  const blocked = t(deferral.wordpress_blocked_unparked.snapshot);
  check("#9 blocked-WordPress case: not deferrable", blocked.id === "wordpress" && blocked.deferrable === false);
  const connectGoogle = t(github_coding.google_connect);
  check("#9 connect-phase google: still deferrable", connectGoogle.deferrable === true);
  const connectWp = t(wordpress_chat.wordpress);
  check("#9 connect-phase wordpress: still deferrable", connectWp.deferrable === true);

  // #12 a surfaced parked step polls on its own
  const surfacedGoogleDone = t(deferral.parked_google_blocks_complete.snapshot);
  check("#12 surfaced google (no wait underneath) polls", surfacedGoogleDone.meanwhile == null && surfacedGoogleDone.polls === true);
  const surfacedWp = t(applyOverrides(wordpress_chat.complete, { project: { wp_connected: false, setup_deferred: ["wordpress"] } }));
  check("#12 surfaced wordpress at the end does not poll (form step)", surfacedWp.id === "wordpress" && surfacedWp.polls === false, `${surfacedWp.id} polls=${surfacedWp.polls}`);
  check("#12 surfaced gsc_property polls", pickBack.polls === true);
  const surfacedChat = t(deferral.chat_parked_over_chat_setup.snapshot);
  check("#12 surfaced chat_connect polls", surfacedChat.polls === true);

  // #13 pre-0062 rows: setup_connected_at derived like the 0062 backfill
  const created = "2026-01-01T00:00:00.000Z";
  check("#13 column present + null stays null", deriveConnectedAt({ setup_connected_at: null, pipeline_installed_at: "2026-02-01T00:00:00.000Z", created_at: created }) === null);
  check("#13 column present + set stays", deriveConnectedAt({ setup_connected_at: "2026-03-01T00:00:00.000Z", created_at: created }) === "2026-03-01T00:00:00.000Z");
  check("#13 missing column → pipeline_installed_at", deriveConnectedAt({ pipeline_installed_at: "2026-02-01T00:00:00.000Z", created_at: created }) === "2026-02-01T00:00:00.000Z");
  check("#13 missing column, c5 → created_at", deriveConnectedAt({ onboarding_screen: "c5", created_at: created }) === created);
  check("#13 missing column, repo + no screen → created_at", deriveConnectedAt({ github_repo: "a/b", onboarding_screen: null, created_at: created }) === created);
  check("#13 missing column, mid-wizard c3 → null", deriveConnectedAt({ github_repo: "a/b", onboarding_screen: "c3", created_at: created }) === null);
  check("#13 missing column, nothing → null", deriveConnectedAt({ created_at: created }) === null);

  // #15b operator PAT projects never get reconnect_app
  const operator = t(applyOverrides(github_coding.first_build, { project: { github_installation_id: null, repo_token_allowed: true } }));
  check("#15b repo_token_allowed: no reconnect_app", operator.id === "first_build", operator.id);
  const tenant = t(applyOverrides(github_coding.first_build, { project: { github_installation_id: null, repo_token_allowed: false } }));
  check("#15b tenant without App: reconnect_app", tenant.id === "reconnect_app", tenant.id);
}

console.log(`\n${passed + failed} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);

// The setup path's step engine: one pure function that looks at database
// evidence and answers "what is the ONE thing in front of this customer".
//
// There is no client state machine and no screen pointer. Every step advances
// only on evidence (a column stamped, a row counted), so a reload, a lost POST
// or a second tab can never put the owner on the wrong screen - the old
// wizard's `onboarding_screen` pointer did exactly that.
//
// HARD RULE [R12]: this module has NO value imports at all - type imports only,
// no `enum`. It is client-safe (the step card renders from it) and it is
// unit-tested with `node --experimental-strip-types`, which resolves neither
// `@/` nor extensionless paths. NOTHING SERVER-ONLY MAY EVER BE IMPORTED HERE.
// The server half (snapshot loading, live remote reads) is src/lib/setup-path.ts.

export type SetupPhase = "connect" | "launch" | "first-article" | "complete";
export type StepKind = "do" | "wait" | "done";
export type StepId =
  | "site" | "github_app" | "github_repo" | "wordpress" | "agent_credential"
  | "agent_connect" | "chat_connect" | "google_connect" | "gsc_property"
  | "connected"                                   // the one-screen celebration
  | "pipeline_install" | "install_pr_merge" | "actions_toggle" | "setup_running"
  | "first_research" | "first_ranks"
  | "let_us_publish"                              // github x chat: the App install, in launch
  | "reconnect_app"                               // App uninstalled after connect
  | "chat_setup" | "chat_research" | "agent_setup" | "agent_research"
  | "approve_idea" | "first_build" | "merge_first_pr" | "write_first"
  | "publishing" | "complete";

export type PublishTarget = "github" | "wordpress" | "manual";
export type AiKind = "chat" | "coding";

export type SetupProjectSnapshot = {
  slug: string; name: string; domain: string;
  publish_target: PublishTarget;
  ai_choice: string | null;                   // aiKindOf() decides chat vs coding
  agent: string | null;
  github_installation_id: number | null; github_repo: string | null;
  /** The project may use the INSTANCE GitHub token (instanceTokenAllowedFor:
   *  self-host, or a cloud operator project in GH_MERGE_TOKEN_PROJECTS). Such
   *  a project has a repo and no App installation by design, so it never
   *  gets reconnect_app. */
  repo_token_allowed: boolean;
  installation_repo_count: number | null;     // live, only loaded on github_repo / let_us_publish
  agent_credential_at: string | null;
  agent_last_seen_at: string | null;
  chat_last_seen_at: string | null;
  wp_connected: boolean;
  gsc_oauth_connected: boolean; gsc_site_url: string | null;
  gsc_property_in_list: boolean | null;       // live, only loaded on gsc_property
  /** Live, loaded with the property list: how many properties the Google
   *  account can see. 0 is the "we don't see any properties" error. */
  gsc_property_count?: number | null;
  setup_connected_at: string | null;
  setup_deferred: StepId[];
  // + backend keys install_fired, install_attempted_at, install_pr_url,
  //   actions_toggle_needed, and optionally install_error (last failure text)
  install_progress: Record<string, string>;
  pipeline_installed_at: string | null;
  mode: "semi" | "auto" | "custom";
  // From effectiveAutomations(project), NEVER the raw columns [R13].
  auto_approve: boolean; auto_build_guides: boolean; auto_merge: boolean;
  created_at: string;
};

export type SetupCounts = {
  site_profile: number; conventions: number; suggestions: number; approved: number;
  keywords: number; rank_checks: number; pages: number; pages_live: number;
  pages_with_pr: number; drafts: number; drafts_published: number;
  /** Drafts in `finished`: written, checked, and (github) waiting on the
   *  owner to merge the pull request. */
  drafts_finished: number;
  /** Drafts in accepted / finished / published. A manual-publish project's
   *  drafts stop at `accepted` on purpose (finish.ts), so that is its
   *  "published" [R3]. */
  drafts_accepted: number;
  drafts_blocked_setup: number; gsc_rows: number;
};

export type SetupHealth = {
  setup_ok: boolean | null; setup_last_run_at: string | null;
  /** Live. `undefined` = not loaded this pass (only the poll loads it);
   *  `null` = loaded, no open install PR. */
  open_install_pr?: { url: string; title: string } | null;
  actions_toggle_ok: boolean | null;
  ranks_possible: boolean;
};

export type SetupSnapshot = {
  /** null = no project yet (the `site` step). */
  project: SetupProjectSnapshot | null;
  /** Only read when `project` is null: the branch the qualifier row implies,
   *  so the `site` step's rail shows the right number of dots. */
  branch_hint?: { publish_target: PublishTarget; ai_choice: string | null } | null;
  counts: SetupCounts;
  health: SetupHealth;
  origin: string; mcpToken: string | null;
  now: number;
};

export type Instruction = {
  text: string;
  copy?: string;
  href?: string;
  external?: boolean;
  image?: string;
  /** Collapsed body under `text` (rendered as a <details> summary + body). */
  detail?: string;
};

export type Primary =
  | { kind: "link"; label: string; href: string; external?: boolean }
  | { kind: "form"; label: string; form: "site" | "wordpress" | "agent_credential" | "github_repo" | "gsc_property" }
  | { kind: "copy"; label: string; text: string }
  | {
      kind: "action"; label: string;
      action: "run_pipeline_install" | "retry_setup" | "retry_research";
      /** T6: the hero fires this on mount (behind a useRef latch) only when
       *  true. True only when no install attempt was ever stamped
       *  (install_attempted_at absent) [R10]. */
      autoFire?: boolean;
    }
  | { kind: "none" };

export type SetupStep = {
  id: StepId; kind: StepKind; phase: SetupPhase;
  title: string;
  why: string;
  instructions: Instruction[];
  primary: Primary;
  evidence: string;
  polls: boolean;
  deferrable: boolean;
  deferred: StepId[];
  rail: { index: number; total: number; labels: string[] };
  waiting: { since: string | null; typical: string; slowAfterMs: number; slowHint: string; slowHref?: string } | null;
  error: { message: string; fixHref?: string; fixLabel?: string } | null;
  meanwhile: string | null;
};

// ---- constants ------------------------------------------------------------

const MIN = 60_000;
const HOUR = 60 * MIN;

/** An attempt with no `install_fired` after this long is reported as failed
 *  (a lambda that died mid-install leaves no install_error behind). */
export const INSTALL_STALL_MS = 2 * MIN;
export const SETUP_SLOW_MS = 45 * MIN;
export const RESEARCH_SLOW_MS = 30 * MIN;
export const RANKS_SLOW_MS = 26 * HOUR;
export const BUILD_SLOW_MS = 36 * HOUR;
export const PUBLISH_SLOW_MS = 36 * HOUR;

/** Steps "I'll do this later" may park. */
export const DEFERRABLE: ReadonlySet<StepId> = new Set<StepId>([
  "wordpress",
  "agent_connect",
  "chat_connect",
  "google_connect",
  "gsc_property",
]);

/** The connect-phase steps that poll while current (evidence arrives from
 *  outside: a callback, an MCP request). */
const CONNECT_POLLS: ReadonlySet<StepId> = new Set<StepId>([
  "github_app",
  "agent_connect",
  "chat_connect",
  "google_connect",
]);

const RAIL_LABEL: Partial<Record<StepId, string>> = {
  site: "Your site",
  github_app: "GitHub",
  github_repo: "Repo",
  wordpress: "WordPress",
  agent_credential: "Agent key",
  agent_connect: "Your agent",
  chat_connect: "Claude app",
  google_connect: "Google",
  gsc_property: "Property",
  connected: "Connected",
};

const PARKED_LABEL: Partial<Record<StepId, string>> = {
  wordpress: "WordPress",
  agent_connect: "connecting your agent",
  chat_connect: "the Claude app connector",
  google_connect: "Search Console",
  gsc_property: "Search Console property",
};

const CHAT_PASTE = {
  setup: "Use the DispatchSEO connector and run the setup-chat workflow from get_instructions.",
  research:
    "Use the DispatchSEO connector and run the research-chat workflow from get_instructions. Find five article ideas and propose them.",
  write:
    "Use the DispatchSEO connector and run the write-guide-chat workflow from get_instructions. Write my next approved article.",
};
const AGENT_PASTE = {
  setup: "Run the setup-chat workflow from get_instructions.",
  research:
    "Run the research-chat workflow from get_instructions. Find five article ideas and propose them.",
  write: "Run the write-guide-chat workflow from get_instructions and write my next approved article.",
};

// ---- small pure helpers -----------------------------------------------------

/** Inline copy of wizard-branch.ts aiKind() - a value import is not allowed
 *  here [R12]. Unrecognised (incl. null, every pre-ai_choice row) = coding. */
export function aiKindOf(aiChoice: string | null | undefined): AiKind {
  return aiChoice === "claude-web" || aiChoice === "chatgpt" ? "chat" : "coding";
}

/** Ordered connect-phase ids for a branch. */
export function connectSteps(publish: PublishTarget, kind: AiKind): StepId[] {
  if (publish === "github") {
    return kind === "coding"
      ? ["site", "github_app", "github_repo", "agent_credential", "google_connect", "gsc_property", "connected"]
      // github x chat: the App install moves to launch as `let_us_publish` (T10).
      : ["site", "chat_connect", "google_connect", "gsc_property", "connected"];
  }
  if (publish === "wordpress") {
    return kind === "coding"
      ? ["site", "wordpress", "agent_connect", "google_connect", "gsc_property", "connected"]
      : ["site", "wordpress", "chat_connect", "google_connect", "gsc_property", "connected"];
  }
  return kind === "coding"
    ? ["site", "agent_connect", "google_connect", "gsc_property", "connected"]
    : ["site", "chat_connect", "google_connect", "gsc_property", "connected"];
}

/** The ids a park of `id` writes. Parking Google parks the property pick
 *  with it: with Google connected later, a parked google_connect is "met"
 *  and dropped, and the pick would otherwise never come back. Shared by the
 *  server write (deferStep) so the stored list and the engine agree. */
export function expandDeferral(id: StepId): StepId[] {
  return id === "google_connect" ? ["google_connect", "gsc_property"] : [id];
}

/** setup_connected_at for a row read without the 0062 column (a database
 *  that hasn't run the migration): the same rule 0062's backfill applies, so
 *  a connected legacy project never re-enters the connect phase. `undefined`
 *  = the column is missing; `null` = present and unset (left alone). */
export function deriveConnectedAt(row: {
  setup_connected_at?: string | null;
  pipeline_installed_at?: string | null;
  onboarding_screen?: string | null;
  github_repo?: string | null;
  created_at: string;
}): string | null {
  if (row.setup_connected_at !== undefined) return row.setup_connected_at;
  if (row.pipeline_installed_at) return row.pipeline_installed_at;
  const legacyConnected =
    row.onboarding_screen === "c5" || (Boolean(row.github_repo) && row.onboarding_screen == null);
  return legacyConnected ? row.created_at : null;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

type AgentKey = "claude" | "codex" | "cursor";

function agentKeyOf(p: SetupProjectSnapshot): AgentKey {
  if (p.agent === "claude" || p.agent === "codex" || p.agent === "cursor") return p.agent;
  if (p.ai_choice === "codex") return "codex";
  if (p.ai_choice === "cursor") return "cursor";
  return "claude";
}

const AGENT_NAME: Record<AgentKey, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

function installStartHref(slug: string): string {
  return `/api/github/install/start?slug=${encodeURIComponent(slug)}`;
}

/** The Google consent start. Carries the slug: the route would otherwise
 *  resolve the active-project cookie, which another tab may have switched. */
function googleStartHref(slug: string, phase: SetupPhase): string {
  return `/api/oauth/google/start?returnTo=${phase === "connect" ? "onboarding" : "dashboard"}&slug=${encodeURIComponent(slug)}`;
}

// ---- evidence -----------------------------------------------------------

type Ctx = {
  s: SetupSnapshot;
  p: SetupProjectSnapshot;
  c: SetupCounts;
  h: SetupHealth;
  publish: PublishTarget;
  kind: AiKind;
  ip: Record<string, string>;
  connected: boolean;   // setup_connected_at is stamped
};

function repoDone(p: SetupProjectSnapshot): boolean {
  return p.github_repo != null || p.installation_repo_count === 1;
}

function profileDone(c: SetupCounts): boolean {
  return c.site_profile > 0 || c.conventions > 0;
}

/** The `publishing` / `complete` done-rule for the no-pipeline chains. */
function publishedDone(x: Ctx): boolean {
  if (x.publish === "manual") return x.c.drafts_accepted > 0 || x.c.drafts_published > 0;
  return x.c.drafts_published > 0 || x.c.pages_live > 0;
}

/** Evidence for a connect-phase step. */
function connectDone(id: StepId, x: Ctx): boolean {
  const p = x.p;
  switch (id) {
    case "site": return true; // the project row exists
    case "github_app": return p.github_installation_id != null;
    case "github_repo": return repoDone(p);
    case "wordpress": return p.wp_connected;
    case "agent_credential": return p.agent_credential_at != null;
    case "agent_connect": return p.agent_last_seen_at != null;
    // A setup profile or a handed-in draft can only have come through the
    // connector, so either proves it even when the door stamp is missing
    // (rows from before chat_last_seen_at existed).
    case "chat_connect": return p.chat_last_seen_at != null || x.c.drafts > 0 || x.c.site_profile > 0;
    // Service-account Search Console data proves Google without OAuth.
    case "google_connect": return p.gsc_oauth_connected || x.c.gsc_rows > 0;
    case "gsc_property":
      return x.c.gsc_rows > 0 || (p.gsc_site_url != null && p.gsc_property_in_list === true);
    default: return true;
  }
}

/** The effective parked set: what is stored, plus gsc_property whenever
 *  google_connect is (expandDeferral) - rows parked before that rule. */
function parkedSet(x: Ctx): Set<StepId> {
  const out = new Set<StepId>();
  for (const id of x.p.setup_deferred ?? []) for (const e of expandDeferral(id)) out.add(e);
  return out;
}

/** Deferred ids that still apply to this branch and whose evidence is false,
 *  in connect order. */
function unmetDeferred(x: Ctx): StepId[] {
  const order = connectSteps(x.publish, x.kind);
  const parked = parkedSet(x);
  const unmet = order.filter((id) => DEFERRABLE.has(id) && parked.has(id) && !connectDone(id, x));
  // The property pick is part of "Search Console" while Google itself is
  // still parked: one entry, not two, until Google is connected.
  return unmet.includes("google_connect") ? unmet.filter((id) => id !== "gsc_property") : unmet;
}

function isParked(id: StepId, x: Ctx): boolean {
  return DEFERRABLE.has(id) && parkedSet(x).has(id);
}

// ---- step builders --------------------------------------------------------

type Draft = Omit<SetupStep, "deferred" | "rail" | "deferrable" | "polls" | "meanwhile" | "waiting" | "error"> & {
  polls?: boolean;
  waiting?: SetupStep["waiting"];
  error?: SetupStep["error"];
};

function wait(
  id: StepId, phase: SetupPhase, title: string, why: string, evidence: string,
  waiting: NonNullable<SetupStep["waiting"]>, error: SetupStep["error"] = null,
): Draft {
  return { id, kind: "wait", phase, title, why, instructions: [], primary: { kind: "none" }, evidence, polls: true, waiting, error };
}

function connectStep(id: StepId, x: Ctx, phase: SetupPhase): Draft {
  const { p, s } = x;
  const agent = AGENT_NAME[agentKeyOf(p)];
  switch (id) {
    case "github_app":
      return {
        id, kind: "do", phase,
        title: "Install the DispatchSEO GitHub App",
        why: "It lets us open pull requests on the one repo your site is built from. Nothing else.",
        instructions: githubAppInstructions(),
        primary: { kind: "link", label: "Install on GitHub", href: installStartHref(p.slug) },
        evidence: "This turns green on its own the moment GitHub sends you back here.",
      };
    case "github_repo":
      return repoStep(id, x, phase, "Which repo is your site?", "We install into exactly one repo, so pick the one your website is built from.");
    case "wordpress":
      return {
        id, kind: "do", phase,
        title: "Connect your WordPress",
        why: "Finished articles go straight into your WordPress as posts, so we need a key to your site.",
        instructions: [],
        primary: { kind: "form", label: "Connect WordPress", form: "wordpress" },
        evidence: "This turns green the moment your WordPress answers us.",
      };
    case "agent_credential":
      return {
        id, kind: "do", phase,
        title: `Give ${agent} a key to your repo`,
        why: "The overnight builds run on GitHub, where nobody is logged in. This key is how they reach your agent.",
        instructions: agentCredentialInstructions(agentKeyOf(p)),
        primary: { kind: "form", label: "Save the key", form: "agent_credential" },
        evidence: "This turns green the moment the key is stored in your repo.",
      };
    case "agent_connect": {
      const url = s.mcpToken ? `${s.origin}/api/mcp?key=${s.mcpToken}` : null;
      return {
        id, kind: "do", phase,
        title: `Connect ${agent} to this site`,
        why: `${agent} does the writing. One command connects it to DispatchSEO.`,
        instructions: [
          { text: "Open a terminal in an empty folder for your SEO work." },
          { text: "Paste this command and press Enter." },
          { text: `Then open ${agent} in that folder and say: \`Say hello to DispatchSEO\`.`, copy: "Say hello to DispatchSEO" },
        ],
        // The core cannot build the agent-specific command (it lives in the
        // agents registry, a value import). `text` carries the MCP address;
        // the card renders projectAgent(project).connect.mcpAddBash() [R22].
        primary: url
          ? { kind: "copy", label: "Copy the command", text: url }
          : { kind: "link", label: "Open setup to copy your connect command", href: phase === "connect" ? "/onboarding" : "/dashboard" },
        evidence: "This turns green on its own the moment your agent reaches us.",
      };
    }
    case "chat_connect": {
      const url = s.mcpToken ? `${s.origin}/api/mcp?key=${s.mcpToken}&client=chat` : null;
      return {
        id, kind: "do", phase,
        title: "Connect your Claude app",
        why: "Your Claude does the writing. A connector lets it read and update this site's plan.",
        instructions: [
          { text: "Open claude.ai in a browser (not the phone app - the setting is only on the website).", href: "https://claude.ai", external: true },
          { text: "Click your name at the bottom left, then Settings, then Connectors." },
          { text: "Click Add custom connector. Name it DispatchSEO and paste this as the URL:" },
          { text: "This address is a password. Anyone who has it can read and change this site's content plan, so do not post it anywhere." },
        ],
        primary: url
          ? { kind: "copy", label: "Copy the connector address", text: url }
          : { kind: "link", label: "Open setup to copy your connector address", href: phase === "connect" ? "/onboarding" : "/dashboard" },
        evidence: "This turns green on its own, no button, the moment Claude first reaches us.",
      };
    }
    case "google_connect":
      return {
        id, kind: "do", phase,
        title: "Connect Google Search Console",
        why: "Search Console is how we see what Google already shows your site for. Read-only.",
        instructions: [
          { text: `Sign in with the Google account that manages ${p.domain} in Search Console.` },
          { text: "Google asks for read-only access; allow it." },
          { text: "Not in Search Console yet? Add it there first", href: "https://search.google.com/search-console", external: true },
        ],
        primary: { kind: "link", label: "Connect Google", href: googleStartHref(p.slug, phase) },
        evidence: "This turns green on its own the moment Google sends you back.",
      };
    case "gsc_property": {
      const empty = p.gsc_property_count === 0;
      return {
        id, kind: "do", phase,
        title: `Which Search Console property is ${p.domain}?`,
        why: "We couldn't match your site to a property on this Google account, so pick it once.",
        instructions: empty
          ? [{ text: "Skip, connect later" }]
          : [{ text: "Pick the property for this site. It saves the moment you choose." }],
        primary: { kind: "form", label: "Use this property", form: "gsc_property" },
        evidence: "This turns green the moment you pick one.",
        error: empty
          ? {
              message: "We don't see any properties on this Google account",
              fixHref: googleStartHref(p.slug, phase),
              fixLabel: "Connect a different Google account",
            }
          : null,
      };
    }
    default:
      throw new Error(`not a connect step: ${id}`);
  }
}

function githubAppInstructions(): Instruction[] {
  return [
    { text: "You'll land on GitHub's own install page." },
    { text: "Pick the repo your site is built from (just that one)." },
    { text: "Press Install and you come straight back here." },
    {
      text: "Not the technical one? Read this",
      detail:
        "This step has to be done by whoever owns your site's code on GitHub. Sit with them for a minute: they sign into GitHub on this computer, click Install, pick the repo, and come straight back here. Nothing else in the setup needs them.",
    },
    { text: "Repo in an organization? An owner may have to approve; this page re-checks on its own." },
  ];
}

function repoStep(id: StepId, x: Ctx, phase: SetupPhase, title: string, why: string): Draft {
  const none = x.p.installation_repo_count === 0;
  return {
    id, kind: "do", phase, title, why,
    instructions: none ? [] : [{ text: "Pick the repo your website is built from." }],
    primary: none
      ? { kind: "link", label: "Choose which repos to share", href: installStartHref(x.p.slug) }
      : { kind: "form", label: "Use this repo", form: "github_repo" },
    evidence: "This turns green the moment you pick one.",
    error: none
      ? { message: "The GitHub App can't see any of your repos yet.", fixHref: installStartHref(x.p.slug), fixLabel: "Choose which repos to share" }
      : null,
  };
}

function agentCredentialInstructions(agent: AgentKey): Instruction[] {
  const different: Instruction = { text: "Using a different agent?", href: "#change-agent" };
  if (agent === "codex") {
    return [
      { text: "You need an OpenAI API key. Create one at platform.openai.com - the account needs credit on it before a build can run.", href: "https://platform.openai.com/api-keys", external: true },
      { text: "Paste the key below. It starts with sk- and OpenAI only shows it once." },
      different,
    ];
  }
  if (agent === "cursor") {
    return [
      { text: "You need a Cursor API key. Open cursor.com/dashboard/api directly - any plan can mint one there.", href: "https://cursor.com/dashboard/api", external: true },
      { text: "Paste the key below." },
      different,
    ];
  }
  return [
    { text: "Never used Claude Code before? Install it first", href: "/docs/install-claude-code" },
    { text: "Run this in a terminal:", copy: "claude setup-token" },
    { text: "Paste what it prints below" },
    different,
  ];
}

// ---- launch / first-article chains ----------------------------------------

/** github x coding, after connect. Returns the first unmet step. */
function pipelineChain(x: Ctx): Draft | null {
  const { p, c, h, ip, s } = x;
  const repo = p.github_repo ?? "";
  // A legacy repo (connected before this path, or installed by an agent
  // through the self-host instructions) may have no pipeline_installed_at
  // stamp. Any downstream evidence - a setup profile, research, a content
  // PR - proves the pipeline runs there, so it is never auto-installed
  // again and the install / PR / toggle steps are skipped.
  const installed =
    p.pipeline_installed_at != null || profileDone(c) || c.suggestions > 0 || c.pages_with_pr > 0;
  const actionsHref = `https://github.com/${repo}/actions`;

  // pipeline_install
  if (!installed && !ip.install_fired) {
    const attempted = ms(ip.install_attempted_at);
    const age = attempted == null ? null : s.now - attempted;
    // Auto-fire exactly once per project: any stamped attempt (in flight,
    // failed, or a lambda that died) leaves the Retry button to the owner
    // [R10]. Every attempt clears install_error when it starts.
    const autoFire = attempted == null;
    const failed = Boolean(ip.install_error) || (age != null && age > INSTALL_STALL_MS);
    return {
      id: "pipeline_install", kind: "do", phase: "launch",
      title: "Installing your pipeline…",
      why: "We add a few workflow files to your repo so your agent can research and write on a schedule.",
      instructions: [],
      primary: { kind: "action", label: failed ? "Try again" : "Install the pipeline", action: "run_pipeline_install", autoFire },
      evidence: "This turns green on its own the moment the files land in your repo.",
      polls: true,
      error: failed
        ? { message: ip.install_error || "The last install attempt didn't finish. Try again." }
        : null,
    };
  }

  // install_pr_merge: the jsonb key is only a link hint, never a done-condition [R9].
  // open_install_pr === undefined means "not loaded this pass": then the
  // hint decides whether the step is plausibly current (a direct-commit
  // install never stamps install_pr_url).
  const prOpen = h.open_install_pr === undefined ? Boolean(ip.install_pr_url) : h.open_install_pr !== null;
  if (!installed && prOpen) {
    const href = h.open_install_pr?.url ?? ip.install_pr_url ?? `https://github.com/${repo}/pulls`;
    return {
      id: "install_pr_merge", kind: "do", phase: "launch",
      title: "Merge the install pull request",
      why: "Nothing can build or publish until it lands on the default branch — everything else is ready and starts on its own once you merge.",
      instructions: [{ text: "Open the pull request on GitHub and press Merge." }],
      primary: { kind: "link", label: "Open the PR", href, external: true },
      evidence: "This turns green on its own the moment the PR is merged.",
      // Evidence is a live GitHub read, which only the poll makes [R14].
      polls: true,
    };
  }

  // actions_toggle
  if (!installed && ip.actions_toggle_needed && h.actions_toggle_ok !== true) {
    return {
      id: "actions_toggle", kind: "do", phase: "launch",
      title: "One GitHub toggle needs your click",
      why: "Every content PR is opened from inside a workflow, so the final verification stays blocked until this is on.",
      instructions: [
        { text: "Open your repo's Actions settings", href: `https://github.com/${repo}/settings/actions`, external: true },
        { text: "Enable \"Allow GitHub Actions to create and approve pull requests\"." },
      ],
      primary: { kind: "link", label: "Open Actions settings", href: `https://github.com/${repo}/settings/actions`, external: true },
      evidence: "No need to come back here - it's re-checked automatically.",
      polls: true,
    };
  }

  // setup_running
  if (!installed && !profileDone(c)) {
    const since = ip.install_fired ?? p.setup_connected_at;
    const start = ms(since);
    const slow = start != null && s.now - start > SETUP_SLOW_MS;
    const neverRan = h.setup_last_run_at == null && h.setup_ok == null;
    if (slow && neverRan) {
      return {
        id: "setup_running", kind: "do", phase: "launch",
        title: "Your agent is learning your site",
        why: "Setup should have started by now and we don't see a run yet. Start it again.",
        instructions: [{ text: "Check the run on GitHub", href: actionsHref, external: true }],
        primary: { kind: "action", label: "Start setup again", action: "retry_setup" },
        evidence: "This turns green on its own the moment setup finishes.",
        polls: true,
      };
    }
    return wait(
      "setup_running", "launch",
      "Your agent is learning your site",
      "It reads your site and writes down what you sell, who buys it and how you sound.",
      "Nothing for you to do. This turns green on its own.",
      { since: since ?? null, typical: "5–15 minutes", slowAfterMs: SETUP_SLOW_MS, slowHint: "Taking longer than usual - check the run", slowHref: actionsHref },
      h.setup_ok === false
        ? { message: "The last setup run failed.", fixHref: actionsHref, fixLabel: "See the run" }
        : null,
    );
  }

  // first_research
  if (c.suggestions === 0) {
    const since = h.setup_last_run_at ?? ip.install_fired ?? p.setup_connected_at;
    const start = ms(since);
    if (start != null && s.now - start > RESEARCH_SLOW_MS) {
      return {
        id: "first_research", kind: "do", phase: "launch",
        title: "Researching your first keywords",
        why: "The first research run hasn't reported back yet. Start it now.",
        instructions: [],
        primary: { kind: "action", label: "Run research now", action: "retry_research" },
        evidence: "This turns green on its own the moment the first ideas arrive.",
        polls: true,
      };
    }
    return wait(
      "first_research", "launch",
      "Researching your first keywords",
      "Your agent checks what people search for and queues a handful of article ideas.",
      "Nothing for you to do. This turns green on its own.",
      { since: since ?? null, typical: "10–20 minutes", slowAfterMs: RESEARCH_SLOW_MS, slowHint: "Taking longer than usual - check the run", slowHref: actionsHref },
    );
  }

  // approve_idea (before first_ranks: a rankings wait must never block an
  // approval the owner can already make)
  const approve = approveStep(x);
  if (approve) return approve;

  // first_ranks
  if (c.rank_checks === 0 && h.ranks_possible) {
    return wait(
      "first_ranks", "first-article",
      "Pulling your first rankings",
      "We look up where your site ranks today for the keywords your agent picked.",
      "Nothing for you to do. This turns green on its own.",
      {
        since: h.setup_last_run_at ?? p.setup_connected_at, typical: "a few minutes", slowAfterMs: RANKS_SLOW_MS,
        slowHint: "Still nothing - the daily rank check runs at 04:00 UTC and will fill this in",
      },
    );
  }

  // first_build
  if (c.pages_with_pr === 0) {
    return wait(
      "first_build", "first-article",
      "Writing your first article",
      "Approved ideas are written overnight and arrive as a pull request.",
      "Nothing for you to do. This turns green on its own.",
      {
        since: p.setup_connected_at, typical: "tonight, after midnight UTC", slowAfterMs: BUILD_SLOW_MS,
        slowHint: "No article yet - see Automations", slowHref: "/automations",
      },
    );
  }

  // merge_first_pr
  if (c.pages_live === 0) {
    if (!p.auto_merge) {
      return {
        id: "merge_first_pr", kind: "do", phase: "first-article",
        title: "Merge your first article",
        why: "It's written and checked. It goes live when you merge it.",
        instructions: [{ text: "Open Pages, read it, then press Merge." }],
        primary: { kind: "link", label: "Open Pages", href: "/pages" },
        evidence: "This turns green on its own the moment it's live.",
        polls: true,
      };
    }
    return wait(
      "merge_first_pr", "first-article",
      "Publishing your first article",
      "Auto is on, so it merges itself once its checks pass.",
      "Nothing for you to do. This turns green on its own.",
      { since: p.setup_connected_at, typical: "a few hours", slowAfterMs: PUBLISH_SLOW_MS, slowHint: "Not live yet - open Pages", slowHref: "/pages" },
    );
  }
  return null;
}

function approveStep(x: Ctx): Draft | null {
  if (x.c.approved > 0 || x.p.auto_approve) return null;
  const waiting = Math.max(0, x.c.suggestions - x.c.approved);
  return {
    id: "approve_idea", kind: "do", phase: "first-article",
    title: "Approve the ideas you like",
    why: "Nothing is written until you say yes. Approve one or two to start.",
    instructions: [],
    primary: { kind: "link", label: `Open the Queue${waiting ? ` (${waiting} waiting)` : ""}`, href: "/research" },
    evidence: "This turns green the moment you approve one.",
  };
}

/** github x chat only: the App install + repo pick, in launch (T10). */
function letUsPublish(x: Ctx): Draft | null {
  const { p } = x;
  const title = "Let us publish to your repo";
  const why = "Your Claude writes; we open the pull request. One click on GitHub lets us.";
  if (p.github_installation_id == null) {
    return {
      id: "let_us_publish", kind: "do", phase: "launch", title, why,
      instructions: githubAppInstructions(),
      primary: { kind: "link", label: "Install on GitHub", href: installStartHref(p.slug) },
      evidence: "This turns green on its own the moment GitHub sends you back here.",
      polls: true,
    };
  }
  if (!repoDone(p)) return repoStep("let_us_publish", x, "launch", title, why);
  return null;
}

/** The chat / no-repo-agent chain. */
function conversationChain(x: Ctx): Draft | null {
  const { c, kind, publish } = x;
  const chat = kind === "chat";
  const paste = chat ? CHAT_PASTE : AGENT_PASTE;
  const where = chat ? "Start a new chat with the DispatchSEO connector switched on and paste:" : "In your agent, run:";
  const say = (text: string): Instruction[] => [{ text: where }, { text, copy: text }];

  if (!profileDone(c)) {
    return {
      id: chat ? "chat_setup" : "agent_setup", kind: "do", phase: "launch",
      title: "Let it learn your business",
      why: "It asks who buys from you, what never to say, and how it should sound - a sentence each is plenty.",
      instructions: say(paste.setup),
      primary: { kind: "copy", label: "Copy", text: paste.setup },
      evidence: "This turns green on its own the moment it saves what it learned.",
      polls: true,
    };
  }
  if (c.suggestions === 0) {
    return {
      id: chat ? "chat_research" : "agent_research", kind: "do", phase: "launch",
      title: "Ask it for article ideas",
      why: "It checks what people search for and queues a handful of ideas with a one-line reason each.",
      instructions: say(paste.research),
      primary: { kind: "copy", label: "Copy", text: paste.research },
      evidence: "This turns green on its own the moment the first ideas arrive.",
      polls: true,
    };
  }
  const approve = approveStep(x);
  if (approve) return approve;
  if (c.drafts === 0) {
    return {
      id: "write_first", kind: "do", phase: "first-article",
      title: "Ask it to write the first one",
      why: "It researches, writes and hands the article in. We check it, format it, add links and the cover.",
      instructions: say(paste.write),
      primary: { kind: "copy", label: "Copy", text: paste.write },
      evidence: "This turns green on its own the moment the article is handed in.",
      polls: true,
    };
  }
  // github x chat on Semi: the checked article waits in a pull request
  // only the owner can merge. Without this the publishing wait never ends.
  if (publish === "github" && !x.p.auto_merge && c.drafts_finished > 0 && !publishedDone(x)) {
    return {
      id: "merge_first_pr", kind: "do", phase: "first-article",
      title: "Merge your first article",
      why: "It's written and checked. It goes live when you merge the pull request.",
      instructions: [{ text: "Open Drafts and follow the link to its pull request, then press Merge." }],
      primary: { kind: "link", label: "Open Drafts", href: "/drafts" },
      evidence: "This turns green on its own the moment it's live.",
      polls: true,
    };
  }
  if (!publishedDone(x)) {
    // A WordPress draft blocked on setup with no WordPress connection: the
    // one action is connecting WordPress, whether or not it was parked.
    if (publish === "wordpress" && c.drafts_blocked_setup > 0 && !x.p.wp_connected) {
      return connectStep("wordpress", x, "first-article");
    }
    return wait(
      "publishing", "first-article",
      "Checking and publishing your article",
      publish === "manual"
        ? "We check it and format it. It's ready the moment it passes."
        : "We check it, format it, add links and the cover, then publish it.",
      "Nothing for you to do. This turns green on its own.",
      { since: null, typical: "a few minutes", slowAfterMs: PUBLISH_SLOW_MS, slowHint: "Taking a while - open Drafts", slowHref: "/drafts" },
    );
  }
  return null;
}

function completeDraft(x: Ctx): Draft {
  return {
    id: "complete", kind: "done", phase: "complete",
    title: "Your first article is live.",
    why: "Setup is finished. From here it runs on its schedule.",
    instructions: x.publish === "manual"
      ? [{ text: "Your articles are on the Drafts screen with a Copy button", href: "/drafts" }]
      : [],
    primary: { kind: "none" },
    evidence: "",
  };
}

/** Is the WordPress-blocked branch of `publishing` what we are showing? */
function isBlockedWordpress(d: Draft, x: Ctx): boolean {
  return d.id === "wordpress" && x.connected;
}

// ---- the engine -------------------------------------------------------------

function finish(
  d: Draft, x: Ctx | null, rail: SetupStep["rail"], meanwhile: string | null,
  opts: { noDefer?: boolean } = {},
): SetupStep {
  const deferred = x ? unmetDeferred(x) : [];
  // "I'll do this later" only where it does something: not on a step that
  // is already parked (it is showing BECAUSE it is the one action left), and
  // not on the blocked-WordPress case, where the draft cannot go anywhere
  // until WordPress is connected.
  const deferrable =
    d.kind === "do" && DEFERRABLE.has(d.id) && !opts.noDefer && !(x && parkedSet(x).has(d.id));
  const polls = d.polls ?? (d.phase === "connect" ? CONNECT_POLLS.has(d.id) : d.kind === "wait");
  return {
    id: d.id, kind: d.kind, phase: d.phase,
    title: d.title, why: d.why, instructions: d.instructions, primary: d.primary, evidence: d.evidence,
    // A parked step shown over a wait keeps polling: the wait underneath is
    // still progressing and the card should notice when it is the next step.
    polls: polls || meanwhile != null,
    deferrable,
    deferred,
    rail,
    waiting: d.waiting ?? null,
    error: d.error ?? null,
    meanwhile,
  };
}

function railFor(order: StepId[], current: StepId | null): SetupStep["rail"] {
  const labels = order.map((id) => RAIL_LABEL[id] ?? id);
  const at = current == null ? -1 : order.indexOf(current);
  return { index: at < 0 ? labels.length : at, total: labels.length, labels };
}

function siteStepDraft(): Draft {
  return {
    id: "site", kind: "do", phase: "connect",
    title: "What's your website?",
    why: "Just the address. We'll work out the rest.",
    instructions: [],
    primary: { kind: "form", label: "Continue", form: "site" },
    evidence: "",
  };
}

export function computeSetupStep(s: SetupSnapshot): SetupStep {
  const p = s.project;
  if (!p) {
    const hint = s.branch_hint;
    const order = connectSteps(hint?.publish_target ?? "github", aiKindOf(hint?.ai_choice));
    return finish(siteStepDraft(), null, railFor(order, "site"), null);
  }

  const publish: PublishTarget = p.publish_target === "wordpress" || p.publish_target === "manual" ? p.publish_target : "github";
  const kind = aiKindOf(p.ai_choice);
  const x: Ctx = {
    s, p, c: s.counts, h: s.health, publish, kind,
    ip: p.install_progress ?? {},
    connected: p.setup_connected_at != null,
  };
  const order = connectSteps(publish, kind);

  // ---- connect phase: only until setup_connected_at is stamped ----
  if (!x.connected) {
    for (const id of order) {
      if (id === "site") continue;
      if (id === "connected") break;
      if (connectDone(id, x)) continue;
      if (isParked(id, x)) continue;
      // gsc_property needs Google; parked/missing Google means skip it.
      if (id === "gsc_property" && !p.gsc_oauth_connected) continue;
      return finish(connectStep(id, x, "connect"), x, railFor(order, id), null);
    }
    const parked = unmetDeferred(x);
    const parkedNames = [...new Set(parked.map((id) => PARKED_LABEL[id] ?? id))];
    return finish(
      {
        id: "connected", kind: "done", phase: "connect",
        title: "You're connected.",
        why: "That's everything we need from you up front. The rest starts on its own.",
        instructions: [
          { text: "Nothing goes live without you. Prefer hands-off? Flip Auto in the top bar." },
          ...(parkedNames.length ? [{ text: `Parked for later: ${parkedNames.join(", ")}` }] : []),
        ],
        primary: { kind: "link", label: "Open your dashboard", href: "/dashboard" },
        evidence: "",
      },
      x, railFor(order, "connected"), null,
    );
  }

  // ---- after connect: never a connect-phase step ----
  const rail = railFor(order, null);

  // reconnect_app outranks every wait (and everything else: nothing can
  // publish to the repo without the App).
  if (p.github_repo && p.github_installation_id == null && !p.repo_token_allowed) {
    return finish(
      {
        id: "reconnect_app", kind: "do", phase: "launch",
        title: "Reconnect the GitHub App",
        why: "The DispatchSEO GitHub App was removed from your repo, so nothing can be published until it's back.",
        instructions: [
          { text: "You'll land on GitHub's own install page." },
          { text: `Pick ${p.github_repo} again and press Install.` },
        ],
        primary: { kind: "link", label: "Reconnect on GitHub", href: installStartHref(p.slug) },
        evidence: "This turns green on its own the moment GitHub sends you back here.",
        polls: true,
      },
      x, rail, null,
    );
  }

  let current: Draft | null;
  if (publish === "github" && kind === "coding") {
    current = pipelineChain(x);
  } else if (publish === "github") {
    current = letUsPublish(x) ?? conversationChain(x);
  } else {
    current = conversationChain(x);
  }

  // Deferral rule: a parked connect step returns as the one action whenever
  // the current step is a wait, and before the card can disappear.
  const parked = unmetDeferred(x);
  // A surfaced connect step keeps polling on its own evidence (the connector
  // reaching us, Google sending the owner back), not only via `meanwhile`.
  const surfaced = (id: StepId, phase: SetupPhase): Draft => ({
    ...connectStep(id, x, phase),
    polls: CONNECT_POLLS.has(id) || id === "gsc_property",
  });
  const surface = (meanwhileOf: Draft | null): SetupStep | null => {
    if (!parked.length) return null;
    let id = parked[0];
    // A parked property pick without Google connected is a Google connect.
    if (id === "gsc_property" && !p.gsc_oauth_connected) id = "google_connect";
    const phase: SetupPhase = meanwhileOf ? meanwhileOf.phase : "first-article";
    return finish(surfaced(id, phase), x, rail, meanwhileOf ? meanwhileOf.title : null);
  };

  if (current == null) {
    return surface(null) ?? finish(completeDraft(x), x, rail, null);
  }
  // A step that runs THROUGH a parked connector (chat_setup needs the
  // Claude app connector, agent_research needs the agent connected) can't
  // be done until it is connected: the parked connector is the one action,
  // whatever kind the step underneath is.
  const needs: StepId | null = current.id.startsWith("chat_")
    ? "chat_connect"
    : current.id.startsWith("agent_")
      ? "agent_connect"
      : null;
  if (needs && parked.includes(needs)) {
    return finish(surfaced(needs, current.phase), x, rail, null);
  }
  if (current.kind === "wait") {
    const shown = surface(current);
    if (shown) return shown;
  }
  if (isBlockedWordpress(current, x)) {
    // The blocked-WordPress `publishing` case: show it with what is waiting.
    return finish(current, x, rail, "Checking and publishing your article", { noDefer: true });
  }
  return finish(current, x, rail, null);
}

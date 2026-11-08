// The coding-agent registry - the single place that answers "which agent, and
// what does that imply".
//
// DispatchSEO drives a coding agent: it researches, writes, and opens PRs,
// while this backend is its state, schedule, and dashboard. That agent was
// Claude Code everywhere, hardcoded across the CI workflow templates, the
// docker builder, setup.sh, the connect commands, and the instructions. Adding
// a second agent means every one of those has to ask the same question in the
// same place instead of assuming an answer.
//
// It landed with ONE agent registered so the seam could be proven
// byte-identical to the hardcoded path before a second agent existed. Codex is
// now the second, and that guarantee did not lapse: scripts/agent-golden.mjs
// still diffs every Claude string on every push, and the Claude block of
// test/golden/agent-commands.json is unchanged since the day it was written.
// See docs-private/CODEX_SUPPORT_PLAN.md.
//
// Adding a third agent is one object in this file - plus its golden entry, so a
// later refactor cannot quietly rewrite a command someone pastes into a
// terminal. docs/AGENTS.md is the contributor-facing version of that bar.
//
// CLIENT-SAFE. The onboarding wizard builds connect commands in the browser, so
// nothing here may import db.ts, github-app.ts, or any server-only module -
// same constraint mcp-connect.ts documents.

import {
  codexConnectCommand,
  codexConnectCommandPS,
  codexMcpAddCommand,
  connectCommand,
  connectCommandPS,
  cursorConnectCommand,
  cursorConnectCommandPS,
  cursorMcpAddCommand,
  cursorMcpAddCommandPS,
  mcpAddCommand,
  mcpAddCommandPS,
  mcpServerName,
  setupCommand,
  setupCommandPS,
} from "@/lib/mcp-connect";
import { DEFAULT_AGENT, MASCOTS, type AgentId } from "./mascot";

// The ids, the default and the mascot colours live in ./mascot (the pixel
// dispatcher imports only that); re-exported so every other caller keeps
// its import from here.
export { DEFAULT_AGENT, type AgentId };

export type AgentDefinition = {
  id: AgentId;
  /** Shown wherever the owner picks or reviews their agent. */
  displayName: string;
  /** The executable on PATH. setup.sh checks for it; the docs name it. */
  cli: string;
  /** Where to send someone who does not have this agent installed yet. */
  installDocsPath: string;
  /** Where the vendor's own install instructions live. */
  installUrl: string;
  /** The public marketing hub page for this agent (src/app/<path>/page.tsx). */
  landingPath: string;

  /**
   * The pixel dispatcher's body tint on this agent. The character's colours
   * are the ONLY thing that changes between agents - desk, headset, monitor
   * stay the site's own clay/violet so a recolour never reads as a second
   * theme. Read by pixel-dispatcher.tsx; the dashboard layout stamps only the
   * agent id (--dispatcher-agent) and the palette resolves from here, so both
   * paths dress him identically by construction.
   *
   */
  mascot: { body: string; shade: string };

  /**
   * What this agent can actually do here TODAY, not what it will do when the
   * next phase lands. Every surface that offers the agent reads this rather
   * than assuming parity, because a capability that is offered and silently
   * absent is the worst failure this product has - see the no-silent-failures
   * rule. A false here must be visible in the UI, in the agent's own words.
   */
  capabilities: {
    /** Connects over MCP: full dashboard-parity tool set, interactive workflows. */
    mcp: boolean;
    /** Runs the unattended builders (GitHub Actions / the docker builder). */
    headlessBuilder: boolean;
    /** One line naming whatever is false above. Empty when everything is true. */
    caveat: string;
  };

  /** Starts an interactive session already holding a prompt. */
  launch: (prompt: string) => string;

  connect: {
    /** Per-project MCP server name, unique so two projects never shadow each other. */
    serverName: (slug: string) => string;
    /** The one paste that connects the agent in the site's repo folder. */
    bash: (slug: string, origin: string, token: string) => string;
    /** PowerShell twin - Windows terminals reject the bash chain outright. */
    powershell: (slug: string, origin: string, token: string) => string;
    /** MCP registration alone, without the gh permission pre-grant. */
    mcpAddBash: (slug: string, origin: string, token: string) => string;
    mcpAddPowershell: (slug: string, origin: string, token: string) => string;
  };

  /**
   * The one-command installer, per shell.
   *
   * Optional, because it only means something for an agent that runs the
   * builders: setup.sh connects the agent AND stores the builder credential
   * AND hands off to install the pipeline. A connect-only agent has no builder
   * credential to store, and public/setup.sh rejects an agent it does not know
   * by name, so the honest representation of "no one-command install exists
   * for this agent" is the absence of the field rather than a command that
   * exits 1.
   */
  setup?: {
    bash: (slug: string, origin: string, token: string, bundled?: boolean) => string;
    powershell: (slug: string, origin: string, token: string, bundled?: boolean) => string;
  };

  credential: {
    /** The Actions secret the CI builders read. */
    repoSecretName: string;
    /**
     * The process env var the docker stack can supply instead of the stored
     * value. Spelled the same as repoSecretName for every agent today, but kept
     * separate on purpose: they answer different questions (what GitHub calls
     * it vs what the container reads), and collapsing them would make a future
     * divergence a silent wrong-credential bug rather than a type error.
     */
    envVar: string;
    /** The instance_settings column the docker builder's poll feed reads. */
    instanceSettingsColumn: string;
    /** Placeholder for the paste box, so a wrong paste is obvious before it is stored. */
    placeholder: string;
    /** Cheap shape check. A real network verification happens server-side before storing. */
    looksValid: (value: string) => boolean;
    /** How the owner obtains one, in their words. */
    howToMint: string;
    /**
     * The terminal command that mints the credential, when one exists. A
     * surface that has this renders it as a copyable box and skips the
     * mintUrl link entirely: sending a Claude owner to the from-scratch
     * install guide when all they need is this one command buried the
     * actual instruction (owner call, 2026-08-02). Codex has none - its key
     * comes from a web page, which is what mintUrl is for.
     */
    mintCommand?: string;
    /**
     * Where they go to get one. Rendered as "grab your key" so nobody has to
     * hunt for the page - the single most common reason a credential step
     * stalls is not understanding the instruction, it is not knowing where to
     * go. Claude Code has no mint page (its token comes from a terminal
     * command), so that one points at the doc explaining the command.
     */
    mintUrl: string;
    /** Link text, since the two destinations are not the same kind of thing. */
    mintLinkLabel: string;
    /**
     * What actually vouched for the credential before it was stored, in the
     * owner's words - "OpenAI" for a live API probe, "a shape check" when the
     * vendor offers nothing to probe. Shown wherever a credential is added so
     * the trust level is honest per agent.
     */
    verifiedWith: string;
  };

  cost: {
    /** subscription = runs on a plan the owner already pays for; metered = billed per use. */
    model: "subscription" | "metered";
    /** One line, shown on the picker. Must stay honest about who pays. */
    note: string;
  };
};

const claude: AgentDefinition = {
  id: "claude",
  displayName: "Claude Code",
  cli: "claude",
  installDocsPath: "/docs/install-claude-code",
  installUrl: "https://claude.com/claude-code",
  landingPath: "/claude-code",
  mascot: MASCOTS.claude,
  capabilities: {
    mcp: true,
    headlessBuilder: true,
    caveat: "",
  },
  launch: (prompt) => `claude "${prompt}"`,
  connect: {
    serverName: mcpServerName,
    bash: connectCommand,
    powershell: connectCommandPS,
    mcpAddBash: mcpAddCommand,
    mcpAddPowershell: mcpAddCommandPS,
  },
  setup: {
    bash: setupCommand,
    powershell: setupCommandPS,
  },
  credential: {
    repoSecretName: "CLAUDE_CODE_OAUTH_TOKEN",
    envVar: "CLAUDE_CODE_OAUTH_TOKEN",
    instanceSettingsColumn: "builder_claude_token",
    placeholder: "sk-ant-oat...",
    // Shape only. The prefix is the single highest-value check there is: the
    // common failure is a line-wrapped paste or the wrong text entirely, and
    // both are visible here before anything is stored.
    looksValid: (v) => v.startsWith("sk-ant-oat") && v.length > 60,
    howToMint: "Run `claude setup-token` in a terminal and copy what it prints.",
    mintCommand: "claude setup-token",
    mintUrl: "/docs/install-claude-code",
    mintLinkLabel: "how to get your token",
    // An OAuth token offers nothing to probe without spending a model call,
    // so storage-time verification is shape-only; the daily token-check run
    // is what proves it live.
    verifiedWith: "a shape check",
  },
  cost: {
    model: "subscription",
    note: "Runs on your existing Claude subscription - nothing extra to pay, and nothing is billed by DispatchSEO.",
  },
};

// Codex. Every field below is measured against codex-cli 0.146.0 rather than
// read off documentation - the connect syntax, the absence of a scope flag, the
// fact that re-adding overwrites instead of erroring, and the tool count that
// actually arrives (all of them, nothing dropped by its schema validator). See
// docs-private/CODEX_FACTS.md for the runs behind each one.
const codex: AgentDefinition = {
  id: "codex",
  displayName: "Codex",
  cli: "codex",
  installDocsPath: "/docs/install-codex",
  installUrl: "https://developers.openai.com/codex/cli",
  landingPath: "/codex",
  mascot: MASCOTS.codex,
  capabilities: {
    mcp: true,
    // True since 2026-07-30. Every seo-* workflow template now carries both
    // agents and resolves which to run from the dashboard at run time, and the
    // docker builder takes the agent per JOB off its poll feed. What made this
    // safe to flip was not the wiring but the classifier: Codex collapses every
    // 429 into one message, so a text-matching classifier would have read an
    // unfunded account as a quiet deferral and reported green forever while
    // building nothing. Both runners now ask OpenAI for error.code instead.
    headlessBuilder: true,
    caveat: "",
  },
  launch: (prompt) => `codex "${prompt}"`,
  connect: {
    serverName: mcpServerName,
    bash: codexConnectCommand,
    // Same string. Codex's connect has no header to quote and nothing to chain,
    // so the paste that works in bash works unchanged in PowerShell - which is
    // the reason the URL-key form was chosen over --bearer-token-env-var.
    powershell: codexConnectCommandPS,
    mcpAddBash: codexMcpAddCommand,
    mcpAddPowershell: codexMcpAddCommand,
  },
  setup: {
    bash: (slug, origin, token, bundled) => setupCommand(slug, origin, token, bundled, "codex"),
    powershell: (slug, origin, token, bundled) =>
      setupCommandPS(slug, origin, token, bundled, "codex"),
  },
  credential: {
    repoSecretName: "OPENAI_API_KEY",
    envVar: "OPENAI_API_KEY",
    instanceSettingsColumn: "builder_openai_key",
    placeholder: "sk-...",
    // Shape only, and deliberately loose: OpenAI ships several prefixes
    // (sk-proj-, sk-svcacct-, plain sk-) and adds more. Rejecting a real key
    // because the prefix list went stale is worse than letting the real network
    // check downstream be the one that says no.
    // The sk-ant- exclusion is load-bearing: a Claude OAuth token starts
    // sk-ant-oat, which also matches a bare sk- prefix - so without it, the
    // most likely wrong paste on the Codex tab (the OTHER agent's credential)
    // sails through the shape gate, gets sent to OpenAI, and comes back as a
    // technically-true-but-useless "OpenAI rejected that key".
    looksValid: (v) => v.startsWith("sk-") && !v.startsWith("sk-ant-") && v.length > 20,
    howToMint:
      "Create a key at platform.openai.com/api-keys. A project key is fine; it must belong to an account with credit on it.",
    mintUrl: "https://platform.openai.com/api-keys",
    mintLinkLabel: "grab your key",
    verifiedWith: "OpenAI",
  },
  cost: {
    model: "metered",
    note: "Runs on your own OpenAI API key - OpenAI bills you per run, and nothing is billed by DispatchSEO.",
  },
};

// Cursor. Every field below is measured against cursor-agent
// 2026.07.23-e383d2b by installing and running it - the connect syntax, the
// approval model, the absence of a turn budget, and the tool count that
// actually arrives (all 61, names matching exactly, nothing dropped by its
// schema validator, proven against the production server). See
// docs-private/CURSOR_FACTS.md for the runs behind each one.
//
// The builder is ON, and the chain is proven end to end. By hand against
// production first - rendered config, approved servers, `cursor-agent -p`
// calling an MCP tool and returning subtype "success" - and then, 2026-08-05,
// by `.github/workflows/cursor-canary.yml` running green on a real GitHub
// runner with a real key: installed the CLI, approved the server headlessly,
// called get_project against production, saw all 61 tools, returned
// `{"subtype":"success","is_error":false}`. The classify path reads that JSON
// rather than guessing from prose, and every unrecognised subtype falls
// through to a LOUD failure - the unknown case alarms, it does not quietly
// defer.
const cursor: AgentDefinition = {
  id: "cursor",
  displayName: "Cursor",
  cli: "cursor-agent",
  installDocsPath: "/docs/install-cursor",
  installUrl: "https://cursor.com/cli",
  landingPath: "/cursor",
  // Lavender - lighter than the headset's violet (#8b5cf6) on purpose, so the
  // character and the gear he wears stay two things. Purple was the owner's
  // call (2026-08-06) after a day of black-and-white takes on Cursor's cube -
  // all-black, black trousers, outlines, left/right and top/bottom splits -
  // each looked worse at 12px than it sounded; the cube's b&w just doesn't
  // survive a near-black scene at sprite scale.
  mascot: MASCOTS.cursor,
  capabilities: {
    mcp: true,
    headlessBuilder: true,
    // Empty because both capabilities above are true. The one thing an owner
    // must know before choosing Cursor is about COST, not capability, so it
    // lives in cost.note where the picker already shows it.
    caveat: "",
  },
  launch: (prompt) => `cursor-agent "${prompt}"`,
  connect: {
    serverName: mcpServerName,
    bash: cursorConnectCommand,
    powershell: cursorConnectCommandPS,
    mcpAddBash: cursorMcpAddCommand,
    mcpAddPowershell: cursorMcpAddCommandPS,
  },
  setup: {
    bash: (slug, origin, token, bundled) => setupCommand(slug, origin, token, bundled, "cursor"),
    powershell: (slug, origin, token, bundled) =>
      setupCommandPS(slug, origin, token, bundled, "cursor"),
  },
  credential: {
    repoSecretName: "CURSOR_API_KEY",
    envVar: "CURSOR_API_KEY",
    instanceSettingsColumn: "builder_cursor_key",
    placeholder: "crsr_...",
    // Shape only, and deliberately NOT a prefix assertion: exactly ONE real
    // key has been observed (2026-08-05, it started crsr_), and one
    // observation is not a contract - asserting it could reject valid keys
    // from another era or account type. What IS asserted is what is known -
    // no whitespace (the line-wrapped-paste failure), enough length, and
    // explicitly not one of the OTHER agents' credentials, which is the
    // cross-paste mistake that has already bitten this repo twice.
    looksValid: (v) =>
      v.length > 20 && !/\s/.test(v) && !v.startsWith("sk-ant-") && !v.startsWith("sk-"),
    // Where a key ACTUALLY comes from, corrected 2026-08-05 against a real
    // free account: cursor.com/dashboard/api mints one on ANY plan - the
    // earlier "paid plans only" reading was wrong, an artifact of that page
    // being unlinked from the dashboard's nav (a known, recurring Cursor
    // dashboard quirk - the URL works even when no tab points at it; Cursor's
    // own CLI docs name it). The thing that IS plan-gated is capacity, not
    // access: CLI runs draw from the plan's included usage pool, and the free
    // pool is small, so a nightly build schedule realistically wants a paid
    // plan. Say that, not "you can't get a key".
    // Interactive use needs no key at all: `cursor-agent login` does a browser
    // OAuth and stores credentials locally. A key is only needed where no
    // browser exists, i.e. the builders.
    howToMint:
      "Create an API key at cursor.com/dashboard/api - open that URL directly, the page is often missing from the dashboard's own navigation. Any plan can mint one; builds draw from your plan's included usage, so the free plan's small pool may not sustain a nightly schedule.",
    mintUrl: "https://cursor.com/dashboard/api",
    mintLinkLabel: "grab your key",
    verifiedWith: "a shape check",
  },
  cost: {
    model: "subscription",
    note: "Runs on your Cursor plan - nothing is billed by DispatchSEO. Any plan can mint the builder's API key; builds draw on the plan's included usage, so the free pool may not last a nightly schedule.",
  },
};

const REGISTRY: Record<AgentId, AgentDefinition | undefined> = {
  claude,
  codex,
  cursor,
};

/**
 * EVERY agent id, default first, as a non-empty tuple. Derived from the
 * registry so a new agent shows up everywhere this is read without another
 * list to maintain.
 *
 * Check which list you want before using this one: anything that ends up in
 * projects.agent - set_agent's enum, a picker, a validator - wants
 * BUILDER_AGENT_IDS instead, because this list includes agents no scheduled
 * workflow can invoke.
 */
export const AGENT_IDS = Object.keys(REGISTRY) as [AgentId, ...AgentId[]];

/**
 * The ONE place an untrusted string becomes an agent id.
 *
 * `REGISTRY[id]` on its own is not a whitelist: the object literal inherits
 * Object.prototype, so "constructor", "toString", "__proto__" and friends all
 * read back truthy. That turned every lookup below into a bypass - the worst of
 * them being the dashboard's setAgent action, which persisted whatever it was
 * handed into projects.agent and then threw on every later read of that row,
 * because the "agent" it got back was the Object constructor. Own-property
 * check only; never a bare index.
 */
function lookup(id: string | null | undefined): AgentDefinition | undefined {
  if (!id || !Object.hasOwn(REGISTRY, id)) return undefined;
  return REGISTRY[id as AgentId];
}

/**
 * Every registered agent - i.e. everything DispatchSEO speaks to at all.
 *
 * This is the CONNECT list: the marketing pages, the sitemap, the cross-links,
 * and the "connect any client" tabs. It is NOT the list to offer where the
 * owner is choosing who runs their scheduled builds - use builderAgents() for
 * that, or a connect-only agent becomes selectable as a builder and the
 * owner's overnight runs die quietly.
 */
export function availableAgents(): AgentDefinition[] {
  return (Object.keys(REGISTRY) as AgentId[])
    .map((id) => REGISTRY[id])
    .filter((a): a is AgentDefinition => a != null);
}

/**
 * Every agent that can actually run the unattended builders.
 *
 * The distinction is the whole point of capabilities.headlessBuilder: an agent
 * can be fully supported over MCP - every tool, every interactive workflow -
 * without anything in a GitHub Actions runner knowing how to invoke it. Every
 * surface where the answer feeds projects.agent (the wizards' pickers, the
 * dashboard switch, the builder-credential boxes, set_agent's enum, the
 * per-agent secret mirroring) must read THIS list, because that column decides
 * which agent a scheduled run resolves to.
 */
export function builderAgents(): AgentDefinition[] {
  return availableAgents().filter((a) => a.capabilities.headlessBuilder);
}

/**
 * Builder agent ids as the non-empty tuple z.enum wants. Deliberately not
 * AGENT_IDS: set_agent writes projects.agent, so offering a connect-only agent
 * there would let an agent set a builder that no workflow can run.
 */
export const BUILDER_AGENT_IDS = builderAgents().map((a) => a.id) as [AgentId, ...AgentId[]];

/** Whether an id names an agent that can run the scheduled builders. */
export function isBuilderAgent(id: string | null | undefined): id is AgentId {
  const a = lookup(id);
  return a != null && a.capabilities.headlessBuilder;
}

/**
 * The agent a project runs on, tolerant of the two ways the column can be
 * absent: a database that has not run migration 0044, and the COLS fallback
 * tier that deliberately stops selecting it. Both mean "this is a Claude
 * install", which is true - agent did not exist before Claude was the only
 * option. Callers must never read `project.agent` directly for this reason.
 */
export function projectAgent(project: { agent?: string | null } | null | undefined): AgentDefinition {
  return lookup(project?.agent) ?? claude;
}

/** Look one up by id, falling back to the default rather than throwing. */
export function agentById(id: string | null | undefined): AgentDefinition {
  return lookup(id) ?? claude;
}

/** Whether an id names an agent that is actually usable right now. */
export function isSupportedAgent(id: string | null | undefined): id is AgentId {
  return lookup(id) != null;
}

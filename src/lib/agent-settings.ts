// Switching a project's coding agent. Server-only on purpose: the registry in
// ./agents is client-safe (the wizard builds connect commands in the browser),
// so anything touching db.ts lives here instead.
//
// One module, two callers - the dashboard's server action and the set_agent MCP
// tool - which is the parity rule in CLAUDE.md: anything the dashboard can do,
// the agent must be able to do too, and the way to guarantee that is to make
// both call the same function rather than implement it twice.

import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";
import {
  agentById,
  builderAgents,
  isBuilderAgent,
  projectAgent,
  type AgentDefinition,
  type AgentId,
} from "@/lib/agents";
import { checkRepoSecret, setRepoSecret } from "@/lib/github-app-secrets";
import { listProjects } from "@/lib/projects";
import { builderAgentToken, setRepoActionsVariable } from "@/lib/github";
import { buildsActive } from "@/lib/builder-status";
import type { Project } from "@/lib/projects";

export type AgentSwitchResult = {
  agent: AgentDefinition;
  /**
   * What the owner still has to do, in their words, or null when nothing is
   * outstanding. Never empty-but-fine: a switch that leaves the builders unable
   * to run has to say so at the moment of switching, not at the next build.
   */
  todo: string | null;
  /**
   * True when the one outstanding task is "this agent has no credential where
   * the builders run". Separate from the prose because the dashboard can do
   * better than prose: it links straight to the box you paste the key into.
   * Telling someone what is wrong and making them hunt for the fix is how a
   * switch quietly becomes a broken build a day later.
   */
  needsCredential: boolean;
};

/**
 * Point a project's unattended builders at a different coding agent.
 *
 * Deliberately does NOT touch the repo. The workflow files carry every agent
 * and resolve which to run at run time from /api/project-mode, so switching is
 * a single column write and takes effect on the next scheduled run - no
 * reinstall, no PR, nothing for the owner to remember. That property is the
 * whole reason the templates resolve at run time instead of being generated
 * per agent, and it is worth protecting: if a future change makes switching
 * require a repo edit, this function is where that regression will show up.
 */
export async function setProjectAgent(
  project: Project,
  agentId: string,
): Promise<AgentSwitchResult> {
  // isBuilderAgent, not isSupportedAgent: this writes projects.agent, which is
  // what a scheduled run resolves to. An agent that speaks MCP but that no
  // workflow knows how to invoke must not be settable here - it would leave
  // the owner's overnight builds resolving to an agent nothing can run. The
  // supported list is derived so it can never drift from the registry.
  if (!isBuilderAgent(agentId)) {
    throw new Error(
      `Unknown agent "${agentId}". Supported: ` +
        builderAgents()
          .map((a) => `${a.id} (${a.displayName})`)
          .join(", ") +
        ".",
    );
  }
  const agent = agentById(agentId);
  // Read before the write: projectAgent resolves an absent column to Claude.
  const changed = projectAgent(project).id !== agent.id;

  const { error } = await db().from("projects").update({ agent: agentId }).eq("id", project.id);
  if (error) {
    // A database that hasn't run 0044 has no column to write. Say that, rather
    // than reporting a save that did not happen - the read path resolves the
    // missing column to Claude, so a silent failure here would look exactly
    // like "the switch didn't stick" with nothing to search for.
    if (error.message.includes("agent")) {
      throw new Error(
        "This database hasn't run migration 0044 yet, so the agent can't be changed. Apply supabase/migrations/0044_project_agent.sql and try again.",
      );
    }
    throw new Error(error.message);
  }

  // The setup path's agent_credential evidence belongs to the agent it was
  // stamped for [R16]: a new agent needs its own key, so the step must ask
  // again. A separate write on purpose - folded into the update above, a
  // pre-0062 database's missing column would surface as the 0044 error.
  // Best-effort: the setup path's live secret check re-stamps it if the new
  // agent's key is already on the repo.
  if (changed) {
    await db()
      .from("projects")
      .update({ agent_credential_at: null })
      .eq("id", project.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  // Mirror the choice into the repo's SEO_AGENT Actions variable, so
  // seo-tool-validate - which deliberately holds no MCP key and cannot ask the
  // backend - reads the same answer the dashboard shows instead of inferring
  // it from which secrets happen to exist. Best-effort: a repo-less project,
  // a missing token or a GitHub hiccup must never fail the switch, because
  // the workflow's inference fallback still covers those repos.
  await setRepoActionsVariable(project, "SEO_AGENT", agent.id);

  const todo = await agentTodo(project, agent);
  return { agent, todo, needsCredential: todo != null };
}

/**
 * The shape-check failure message, per agent. Owner-facing prose, not a
 * registry field: it names the fix, not just the mismatch, and the fix is
 * different in kind per agent (a terminal command / a web page / a re-copy
 * from the Cursor dashboard). Record<AgentId, …> so a new agent is a compile error
 * here - the `claude ? X : Y` ternary this replaced told a Cursor owner
 * their key "doesn't look like an OpenAI API key".
 */
const SHAPE_ERROR: Record<AgentId, string> = {
  claude:
    "That doesn't look like a Claude Code token (they start with sk-ant-oat). Run `claude setup-token` and copy its whole output.",
  codex:
    "That doesn't look like an OpenAI API key (they start with sk-). Copy it again from platform.openai.com/api-keys - a key is only shown once, so a half-copied one is the usual cause.",
  cursor:
    "That doesn't look like a Cursor API key - the usual causes are pasting one of the other agents' credentials, or a line-wrapped copy that carried a newline. Copy it again from your Cursor dashboard.",
};

/**
 * Prove a pasted credential actually works, before anything stores it.
 *
 * The agents are not equally checkable, and pretending otherwise would be
 * worse than the asymmetry. A Claude Code OAuth token can only be validated by
 * running Claude, which does not exist on this server - so that path stays a
 * shape check, and the pack's seo-token-check workflow does the real proving
 * shortly after; a Cursor key is in the same boat (its `cursor-agent models`
 * probe needs the CLI, which this server doesn't ship). An OpenAI key CAN be
 * checked here, in one metered call costing a fraction of a cent, so it is - a
 * key that is real but sits on an account with no credit passes every shape
 * check ever written and then fails on the first scheduled build.
 */
export async function verifyAgentCredential(
  agentId: string,
  value: string,
): Promise<{ ok: true } | { error: string }> {
  const agent = agentById(agentId);
  if (!agent.credential.looksValid(value)) {
    return { error: SHAPE_ERROR[agent.id] };
  }
  if (agent.id !== "codex") return { ok: true };

  try {
    // A real inference call, not a models list: an unfunded account happily
    // lists models it cannot call, so a cheaper check would pass exactly the
    // key we most need to reject.
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5-mini", input: "ok", max_output_tokens: 16 }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    const code = body.error?.code ?? "";
    if (res.status === 401 || res.status === 403) {
      return {
        error:
          "OpenAI rejected that key. Copy it again from platform.openai.com/api-keys - a key is only shown once, so a half-copied one is the usual cause.",
      };
    }
    if (res.status === 429 && code === "rate_limit_exceeded") {
      // Transient, and the key is demonstrably real. Refusing to store it here
      // would send someone away to fix a problem that fixes itself.
      return { ok: true };
    }
    if (res.status === 429 || res.status === 402) {
      return {
        error: `That key is real, but the account can't run anything right now (OpenAI said: ${code || "quota exceeded"}). Add credit at platform.openai.com/settings/organization/billing, then paste it again.`,
      };
    }
    if (res.status === 404) {
      // Model access is per-account: a restricted project key whose allowlist
      // excludes the probe model 404s here forever, and "try again" would be
      // exactly wrong. Name the real fix.
      return {
        error:
          "That key is real, but its account or project can't use the model we verify with " +
          "(gpt-5-mini). Check the project's model allowlist at platform.openai.com/settings, " +
          "or paste a key from a project without model restrictions.",
      };
    }
    return {
      error:
        `OpenAI couldn't verify that key (HTTP ${res.status}). A 5xx is usually transient - try ` +
        `again in a moment. Anything else is worth checking on the account itself at ` +
        `platform.openai.com/settings/organization/billing.`,
    };
  } catch {
    return {
      error: "Couldn't reach OpenAI to verify that key. Check your connection and try again.",
    };
  }
}

export type AgentSecretSync = {
  /** Repos the secret verifiably landed on. */
  synced: string[];
  /**
   * Repos that HAVE a GitHub connection and still refused the write. Kept
   * apart from "no repos at all" because only this list is worth telling the
   * owner about - see syncAgentSecretToRepos.
   */
  failed: string[];
};

/**
 * Push one agent credential to every connected repo's Actions secrets, so a
 * single paste feeds BOTH build rails: the in-stack builder reads
 * instance_settings, GitHub-scheduled workflows read the repo secret. On
 * self-host there is no App to copy it across, and that gap cost a fresh
 * install its first research runs (2026-08-02): token pasted in the wizard,
 * seo-weekly-research died 9 seconds later on the missing repo secret, and
 * GitHub emailed the owner a failure for a step they believed they had done.
 *
 * Best-effort per repo and never throws - a repo-less project, a token
 * without secrets access, or a GitHub hiccup must not fail the paste that is
 * this function's reason to run.
 *
 * Reports BOTH halves, because "nothing to sync" and "every sync was refused"
 * used to come back as the same empty array and the UI simply said nothing.
 * The refusal is not exotic: a fine-grained merge PAT needs a separate
 * "Secrets: read and write" permission that classic `repo` scope includes for
 * free, so the common way to own a working token is to own one GitHub 403s
 * here - and the owner then waits on scheduled workflows that keep dying on
 * the secret they believe they just stored.
 */
export async function syncAgentSecretToRepos(
  agentId: string,
  value: string,
): Promise<AgentSecretSync> {
  const agent = agentById(agentId);
  const synced: string[] = [];
  const failed: string[] = [];
  try {
    const projects = await listProjects();
    await Promise.allSettled(
      projects.map(async (p) => {
        if (!p.github_repo) return;
        const res = await setRepoSecret(p, agent.credential.repoSecretName, value);
        if (res.ok) synced.push(p.github_repo);
        else failed.push(p.github_repo);
      }),
    );
  } catch {
    /* best-effort, see above */
  }
  return { synced, failed };
}

export type AgentCredentialStatus = "ready" | "needs-key" | "unknown";

/**
 * Whether each agent's credential exists where THIS project's builders run -
 * the read the header switcher needs before offering a switch, so an agent
 * with no key is offered as "needs key -> the paste box" instead of a switch
 * that quietly points the builders at nothing.
 *
 * Same runner-branching as agentTodo below, minus the prose. "unknown" is a
 * real answer, not a failure code: a setup.sh repo's secrets are write-only
 * from here, so the honest offer is a plain switch (setProjectAgent's todo
 * carries the caveat), never a "needs key" that may be flatly wrong.
 */
export async function agentCredentialStatuses(
  project: Project,
): Promise<Record<string, AgentCredentialStatus>> {
  const agents = builderAgents();
  const unknown = () => Object.fromEntries(agents.map((a) => [a.id, "unknown" as const]));
  try {
    if (project.github_installation_id) {
      // checkRepoSecret, NOT hasRepoSecret: the fail-closed variant collapses
      // "couldn't ask GitHub" into false, and this is exactly the caller that
      // must not do that - an instance without App credentials (local dev, a
      // misconfigured self-host) saw false for every stored secret and told
      // the owner their existing keys were missing. Only a real 404 from
      // GitHub is "needs-key"; a failed check is "unknown", which the UI
      // renders as a plain switch with the post-switch reminder as backstop.
      const entries = await Promise.all(
        agents.map(
          async (a) =>
            [
              a.id,
              await checkRepoSecret(project, a.credential.repoSecretName)
                .then((h): AgentCredentialStatus => (h ? "ready" : "needs-key"))
                .catch((): AgentCredentialStatus => "unknown"),
            ] as const,
        ),
      );
      return Object.fromEntries(entries);
    }
    // Cloud without a working App installation (uninstalled, suspended, or
    // mid-onboarding): nothing here can honestly answer. Critically, the
    // fallthrough below reads the deployment-wide instance credential, which
    // on the hosted product is shared infrastructure no tenant's status may
    // be derived from - same tenant boundary connectBuilderToken enforces.
    if (isCloudMode()) return unknown();
    if (project.github_repo && project.pipeline_installed_at && !(await buildsActive())) {
      return unknown();
    }
    const entries = await Promise.all(
      agents.map(
        async (a) =>
          [
            a.id,
            ((await builderAgentToken(a.id)) ? "ready" : "needs-key") as AgentCredentialStatus,
          ] as const,
      ),
    );
    return Object.fromEntries(entries);
  } catch {
    return unknown();
  }
}

/**
 * The one thing that does NOT follow automatically from the switch: the new
 * agent's credential has to exist wherever the builders run.
 *
 * Checked rather than assumed, and phrased as a task rather than a warning,
 * because the failure it prevents is the loud-but-late kind - the workflow's
 * own preflight catches a missing secret and fails the run with a clear
 * message, which is correct behaviour but a worse moment to find out.
 */
async function agentTodo(project: Project, agent: AgentDefinition): Promise<string | null> {
  try {
    // Where the credential has to be depends on WHICH runner builds this
    // project, and the two are genuinely different places. A repo connected
    // through the GitHub App builds in Actions and needs a repo secret;
    // everything else builds in the in-stack docker container, which reads one
    // instance-wide credential per agent. Checking the wrong one would produce
    // a confident, useless instruction.
    if (project.github_installation_id) {
      // Throwing variant on purpose: this function's own catch renders "could
      // not check" as silence, which is right - hasRepoSecret's fail-closed
      // false would instead claim the key is missing to an owner who stored
      // it, whenever the App is unreachable from here.
      if (await checkRepoSecret(project, agent.credential.repoSecretName)) return null;
      // Dashboard first, CLI second. Pasting it here runs a real check against
      // the provider before storing; `gh secret set` cannot, because GitHub
      // secrets are write-only - which is exactly how a line-wrapped key gets
      // accepted silently and only surfaces as a failed build the next morning.
      return (
        `Your builders now run ${agent.displayName}, but ${project.github_repo} has no ` +
        `${agent.credential.repoSecretName} yet - the next scheduled build will stop and say so. ` +
        `${agent.credential.howToMint} Paste it in the "${agent.displayName} credential" box on ` +
        `Settings and it gets verified before it is saved.`
      );
    }
    // Cloud with the App gone (uninstalled, suspended, or mid-onboarding):
    // nothing below can check or store anything for this tenant, and the
    // instance-credential advice the fallthrough gives is a self-host concept
    // that must never be shown on the hosted product. The real fix is the
    // App reconnect, so say that.
    if (isCloudMode()) {
      return (
        `Your builders now run ${agent.displayName}, but this site's GitHub connection has ` +
        `lapsed, so its credential can't be checked or stored from here. Reconnect GitHub ` +
        `from the card on Home, and this sorts itself out.`
      );
    }
    // No GitHub App. WHICH runner builds this project decides where the
    // credential lives, and github_installation_id alone cannot answer that:
    // a setup.sh install has a repo with live Actions workflows and no App.
    // The in-stack builder heartbeats when it is the runner - so an alive
    // builder means "instance credential", and a repo-with-pipeline without
    // one means "repo secret", where nothing server-side can verify presence
    // (secrets are write-only and we hold no App token) and the advice has to
    // say so honestly instead of guessing.
    if (project.github_repo && project.pipeline_installed_at && !(await buildsActive())) {
      return (
        `Your builders now run ${agent.displayName}, and they run in GitHub Actions on ` +
        `${project.github_repo} - so the ${agent.credential.repoSecretName} repo secret is what ` +
        `the next scheduled build will read. ${agent.credential.howToMint} Then store it with: ` +
        `gh secret set ${agent.credential.repoSecretName} --repo ${project.github_repo} ` +
        `(paste the key alone, no whitespace). If you already have, you're done - repo secrets ` +
        `are write-only, so this dashboard can't check for you.`
      );
    }
    if (await builderAgentToken(agent.id)) return null;
    return (
      `Your builders now run ${agent.displayName}, but this instance has no ${agent.displayName} ` +
      `credential yet - builds will wait until it does. ${agent.credential.howToMint} ` +
      `Then paste it in the "${agent.displayName} credential" box on Settings, or set ` +
      `${agent.credential.envVar} in your .env.`
    );
  } catch {
    // Couldn't check (revoked App token, API hiccup, encrypted value that won't
    // decrypt). Saying nothing beats inventing a task the owner may already
    // have done - the runner's own preflight is the backstop either way.
    return null;
  }
}

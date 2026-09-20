"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { JOURNEY_STAGES, STAGE_META } from "@/lib/journey-meta";
import { mcpServerName } from "@/lib/mcp-connect";
import { agentById, builderAgents, type AgentId } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";
import { ShellCommandTabs } from "./shell-command-tabs";
import { PixelDispatcher } from "./pixel-dispatcher";
import { FirstRunStatus } from "@/components/first-run-status";
import { BuilderTokenConnect } from "@/components/builder-token-connect";
import { WordPressConnect, type WordPressStatus } from "@/components/wordpress-connect";
import {
  chooseGscOnly,
  connectBuilderToken,
  connectDataforseo,
  connectGithubToken,
  connectGscServiceAccount,
  connectSerpapi,
  finishWizard,
  setAgent,
  setProjectMode,
  setWizardScreen,
  skipPowerup,
  wizardCheckGscAccess,
  wizardCreateProject,
  type ConnectBuilderTokenState,
  type ConnectDataforseoState,
  type ConnectGithubState,
  type ConnectGscState,
  type ConnectSerpapiState,
  type CloudWizardCreateState,
} from "@/app/actions";
import type { GscAccessProbe } from "@/lib/gsc";
import type { SelfHostWizardScreen as WizardScreen } from "@/lib/wizard-screens";
import {
  CopyBox,
  ErrorLine,
  PrereqCallout,
  StepHelp,
  StepIcon,
  inputClass,
} from "@/components/wizard-ui";

// The onboarding wizard - the approved mockup, wired to real actions. Eight
// screens over five rail steps: site -> GSC -> keyword-data pick (+ one detail
// screen per pick) -> Claude Code -> power-ups -> finish. Every choice
// persists on the project row the moment its screen completes, so closing the
// tab mid-wizard loses nothing: the Home setup cards cover whatever is left.

type Screen = WizardScreen;

const RAIL: Record<Screen, number> = {
  s0: 0,
  s1: 1,
  s2a: 2,
  s2b_paid: 2,
  s2b_free: 2,
  s3: 3,
  s3m: 4,
  s_gh: 5,
  s_wp: 5,
  s4b: 6,
  s5: 7,
};

const STEP_COUNT = 7;

const META: Record<Exclude<Screen, "s5">, { name: string; time: string }> = {
  s0: { name: "Add your site", time: "about 30 seconds" },
  s1: { name: "Search Console", time: "about 2 minutes" },
  s2a: { name: "Keyword data", time: "about 3 minutes" },
  s2b_paid: { name: "Keyword data", time: "about 3 minutes" },
  s2b_free: { name: "Keyword data", time: "about 3 minutes" },
  s3: { name: "Coding agent", time: "one choice" },
  s3m: { name: "Publish mode", time: "one choice" },
  s_gh: { name: "Connect GitHub", time: "about 2 minutes" },
  s_wp: { name: "Connect WordPress", time: "about 2 minutes" },
  s4b: { name: "What happens next", time: "just read" },
};

// The pipeline install, as a paste INTO Claude Code (not a terminal
// script): the agent fetches the centrally-versioned install instructions
// and takes care of everything - workflows, secrets, setup + playbook
// personalization (install chains into the setup workflow), first
// research. Deliberately the ONLY workflow paste the owner ever sees: two
// commands differing by one word ("install" vs "setup") kept getting
// mixed up, so the second one is gone. The old curl|bash setup path also
// kept stranding owners at interactive prompts half-buried in a terminal;
// the agent chat is where this belongs.
// The prompt names the configured server exactly (dispatchseo-<slug>):
// agents take the name literally, and a session asked for a "seo-manager"
// MCP it can't find refuses instead of resolving by capability - the first
// Windows e2e died on exactly that.
function installCommand(slug: string): string {
  return `Call the ${mcpServerName(slug)} MCP tool get_instructions with workflow install and follow it exactly.`;
}

// The WordPress branch's two pastes. No install exists there - a pipeline is
// GitHub workflows committed into a repo, and this site has none - so the agent
// is pointed at the repo-less workflows instead (the same two the cloud
// wizard's no-repo finale hands out). Server named exactly, same reason as above.
function setupChatCommand(slug: string): string {
  return `Call the ${mcpServerName(slug)} MCP tool get_instructions with workflow setup-chat and follow it exactly.`;
}
function writeGuideCommand(slug: string): string {
  return `Call the ${mcpServerName(slug)} MCP tool get_instructions with workflow write-guide-chat and write my next approved article.`;
}

// The honest SEO timeline, month by month - the same stage copy the Home
// journey card and get_overview use (journey-meta.ts is the one source of
// the words; it's client-safe, unlike journey.ts which imports db.ts).
const TIMELINE = JOURNEY_STAGES.map((k) => ({
  months: STAGE_META[k].months ?? "",
  label: STAGE_META[k].label,
  copy: STAGE_META[k].expectation,
}));



// The 3-step "add this email to Search Console" recap. Shared between the
// normal (service account exists) and muted (no service account yet) looks so
// the copy never drifts between the two - only the color weight changes.
function GscSteps({ domain, muted }: { domain: string; muted?: boolean }) {
  const item = muted ? "text-neutral-500" : "text-neutral-400";
  const bold = muted ? "font-medium text-neutral-400" : "font-medium text-neutral-200";
  const num = muted ? "bg-neutral-800/60 text-neutral-600" : "bg-neutral-800 text-neutral-300";
  return (
    <ol className={`space-y-2.5 text-[15px] ${item}`}>
      {[
        <>
          Open{" "}
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
          >
            Google Search Console
          </a>{" "}
          and pick {domain}. Not listed yet? Click <b className={bold}>Add property</b>,
          choose <b className={bold}>Domain</b>, enter {domain}, and add the DNS record it
          shows where your domain is registered - verification is usually instant. Then
          come back here.
        </>,
        <>
          Go to <b className={bold}>Settings</b>, then <b className={bold}>Users and permissions</b>.
        </>,
        <>
          Click <b className={bold}>Add user</b>, paste the email, keep the{" "}
          <b className={bold}>Restricted</b> permission, save.
        </>,
      ].map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-xs font-semibold ${num}`}>
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export type WizardResume = {
  screen: Screen;
  created: { slug: string; name: string; domain: string; mcpToken: string } | null;
  choice: "paid" | "free" | null;
  serpConnected: boolean;
  agent: AgentId;
  // Where finished articles go. Decides step 6 (s_gh or s_wp) and which
  // finale renders; "github" for every project created before the choice.
  publishTarget: "github" | "wordpress";
  wp: WordPressStatus;
};

// The one-line "who pays" subtitle under each agent's name on the picker.
// Wizard-specific copy, not a registry field (agent.cost.note says something
// similar but longer, for the finale prose rather than this compact card) -
// adding a third agent means adding one entry here. The map is exhaustive
// over AgentId on purpose: that is what turns "an agent became a builder"
// into a compile error listing the copy still to write, instead of a
// silently missing subtitle.
const AGENT_PICKER_SUBTITLE: Record<AgentId, string> = {
  claude: "Needs a Claude subscription · builds cost nothing extra, they run on your plan",
  codex: "Needs an OpenAI API key · builds are metered by OpenAI per run",
  cursor: "Runs on your Cursor plan · builds use its API key, nothing extra is billed",
};

// The builder pick, shared by the agent step (where the choice is made) and
// the finale (where the commands it decides are pasted - a dropped session
// resumes straight to s5, so the choice must be changeable there too). Same
// card markup as the cloud wizard's c2 picker, so the two wizards can't drift
// on how this decision looks.
//
// Derived from builderAgents(), not a hardcoded pair. This choice writes
// projects.agent, so it must offer exactly the agents that can run a scheduled
// build - and it has to stay right in BOTH directions. A hardcoded list keeps
// a connect-only agent out today by luck, and then silently fails to offer a
// new builder on the day one is promoted, which is the harder failure to spot:
// the flag flips, everything reports success, and onboarding never mentions it.
function AgentPicker({
  value,
  onPick,
  saving,
}: {
  value: AgentId;
  onPick: (id: AgentId) => void;
  saving: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {builderAgents().map(({ id }) => (
        <label
          key={id}
          className="flex cursor-pointer flex-col gap-1 rounded-lg border border-neutral-700 p-3.5 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
        >
          <span className="flex items-center gap-2.5">
            <input
              type="radio"
              name="agent-pick"
              value={id}
              checked={value === id}
              onChange={() => onPick(id)}
              disabled={saving}
              className="h-4 w-4 accent-violet-500"
            />
            <AgentMark id={id} className="h-[18px] w-[18px] shrink-0" />
            <span className="text-sm font-semibold text-neutral-100">
              {agentById(id).displayName}
            </span>
          </span>
          <span className="pl-6 text-[13px] leading-relaxed text-neutral-400">
            {AGENT_PICKER_SUBTITLE[id]}
          </span>
        </label>
      ))}
    </div>
  );
}

// Finale (s5) copy that differs per agent and has no registry field to read,
// because it's about how THIS screen explains the prerequisite - not a fact
// about the agent itself. Adding a third agent means adding one entry here
// (see docs/AGENTS.md).
const AGENT_PREREQ_STEP: Record<AgentId, { body: ReactNode; cta: string }> = {
  claude: {
    body: (
      <>
        This needs <b className="font-medium text-neutral-200">Claude Code</b>{" "}
        and the <b className="font-medium text-neutral-200">GitHub CLI</b> (
        <code className="font-mono text-neutral-300">gh</code>). Don&apos;t have
        them yet? The guide installs both, start to finish, in about 5 minutes.
      </>
    ),
    cta: "Install Claude Code and gh",
  },
  codex: {
    body: (
      <>
        This needs <b className="font-medium text-neutral-200">Codex</b> and the{" "}
        <b className="font-medium text-neutral-200">GitHub CLI</b> (
        <code className="font-mono text-neutral-300">gh</code>). The guide covers
        Codex; gh installs from{" "}
        <a
          href="https://cli.github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
        >
          cli.github.com
        </a>{" "}
        (then run <code className="font-mono text-neutral-300">gh auth login</code>).
      </>
    ),
    cta: "Install Codex",
  },
  cursor: {
    body: (
      <>
        This needs the <b className="font-medium text-neutral-200">Cursor CLI</b>{" "}
        (<code className="font-mono text-neutral-300">cursor-agent</code>) and
        the <b className="font-medium text-neutral-200">GitHub CLI</b> (
        <code className="font-mono text-neutral-300">gh</code>). The guide
        covers Cursor; gh installs from{" "}
        <a
          href="https://cli.github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
        >
          cli.github.com
        </a>{" "}
        (then run <code className="font-mono text-neutral-300">gh auth login</code>).
      </>
    ),
    cta: "Install Cursor",
  },
};

// The one-liner under step 1's connect command, naming what the paste does.
// Also wizard-specific prose, same reasoning as AGENT_PREREQ_STEP above.
const AGENT_CONNECT_BLURB: Record<AgentId, ReactNode> = {
  claude: (
    <>
      Connects Claude Code to this project and lets it run{" "}
      <code className="font-mono text-neutral-300">gh</code>
      {" "}there. Any terminal works - pick your system&apos;s tab.
    </>
  ),
  codex: <>Connects Codex to this project. One command, same in every shell.</>,
  cursor: (
    <>
      Writes this project into <code className="font-mono text-neutral-300">.cursor/mcp.json</code>{" "}
      and approves it, so Cursor can see the tools.
    </>
  ),
};

// The VS Code extension gotcha only applies to Claude Code today - Codex has
// no equivalent extension integration to fall back from. `null` for an agent
// that has nothing to add here is a valid entry, same as a string elsewhere.
const AGENT_RESTART_CAVEAT: Record<AgentId, ReactNode | null> = {
  claude: (
    <>
      {" "}Using the VS Code extension and it still can&apos;t see the server? Do
      step 2 from a plain terminal instead (open the repo folder, type{" "}
      <code className="font-mono text-neutral-400">claude</code>) - or fully
      reload the VS Code window.
    </>
  ),
  codex: null,
  cursor: null,
};

export function OnboardingWizard({
  saEmail,
  origin,
  resume,
  isDocker,
  prefillDomain,
}: {
  saEmail: string | null;
  origin: string;
  // Server-derived resume state: reopening /onboarding continues exactly
  // where the wizard stood (screen + everything the screens need), so a
  // closed tab or stuck terminal never loses progress.
  resume?: WizardResume | null;
  // Docker installs run builds in-stack (the builder container), so the
  // GH token powers building too and the finale adds the builder step.
  isDocker?: boolean;
  // The domain typed into the landing hero, carried through signup so
  // step 1 starts filled in (cloud only; self-host has no landing).
  prefillDomain?: string | null;
}) {
  const [screen, setScreenRaw] = useState<Screen>(resume?.screen ?? "s0");
  const [created, setCreated] = useState<{
    slug: string;
    name: string;
    domain: string;
    mcpToken: string;
  } | null>(resume?.created ?? null);
  const [choice, setChoice] = useState<"paid" | "free" | null>(resume?.choice ?? null);
  // GitHub or WordPress - asked on step 1, fixed once the project exists. The
  // two differ in exactly three places: step 1's fields, step 6 (token vs
  // WordPress password), and the finale (a pipeline install vs two chat
  // pastes, since a site with no repo has nowhere to install workflows).
  const [publish, setPublish] = useState<"github" | "wordpress">(
    resume?.publishTarget ?? "github",
  );
  const wordpress = publish === "wordpress";
  // Same split as the cloud wizard's c1w: `status` stays the server's answer
  // (so the form keeps showing its own success line, which knows the details),
  // and the in-page flag only enables Continue without a reload.
  const [wpJustConnected, setWpJustConnected] = useState(false);
  const wpConnected = (resume?.wp.connected ?? false) || wpJustConnected;
  const wpStatus: WordPressStatus = resume?.wp ?? {
    connected: false,
    url: null,
    username: null,
    seoPlugin: null,
    canPublish: false,
    canUploadMedia: false,
  };
  const [serpConnected, setSerpConnected] = useState(resume?.serpConnected ?? false);
  // The coding agent, picked on the agent step and echoed on the finale.
  // Persisted the moment it is made (fire-and-forget), same as the cloud
  // wizard: the install instructions and the builders resolve the agent
  // server-side from projects.agent, so writing it late would hand a Codex
  // owner Claude's playbook.
  const [agentChoice, setAgentChoice] = useState<AgentId>(resume?.agent ?? "claude");
  const agent = agentById(agentChoice);
  const [agentSaving, startAgentSave] = useTransition();
  function pickAgent(next: AgentId) {
    if (next === agentChoice) return;
    setAgentChoice(next);
    const slug = created?.slug;
    if (!slug) return;
    startAgentSave(async () => {
      try {
        await setAgent(next, slug);
      } catch {
        // Non-fatal: the finale's commands still render for the picked agent,
        // and the switch can be re-applied from the header or Settings.
      }
    });
  }
  // Persist every screen change so reloads resume in place (fire-and-forget:
  // resume is a nicety, navigation must never wait on it).
  function setScreen(next: Screen) {
    setScreenRaw(next);
    void setWizardScreen(next);
  }
  // "Does the site have a blog?" - a hint the setup workflow reconciles
  // against the actual repo. Default "detect" keeps the 30-second promise:
  // ignoring the question is a valid answer.
  const [contentMode, setContentMode] = useState<"existing" | "create" | "detect">("detect");
  const [contentHint, setContentHint] = useState("");
  // Publish mode: semi is the row default from creation; the mode screen only
  // has to persist an escalation to auto (or a return to semi after Back).
  const [modeChoice, setModeChoice] = useState<"semi" | "auto">("semi");
  const [pendingSkip, startSkip] = useTransition();
  const [pendingMode, startMode] = useTransition();
  const [pendingGhSkip, startGhSkip] = useTransition();
  // Step 2's on-the-spot Search Console probe.
  const [gscCheck, setGscCheck] = useState<GscAccessProbe | null>(null);
  const [gscChecking, startGscCheck] = useTransition();
  // Step 2's paste-the-key-file connect: once it succeeds, the screen flips
  // to the "add this email in Search Console" half without a reload.
  const [gscConnState, gscConnAction, gscConnPending] = useActionState<ConnectGscState, FormData>(
    connectGscServiceAccount,
    null,
  );
  const effectiveSaEmail =
    saEmail ?? (gscConnState && "ok" in gscConnState ? gscConnState.email : null);
  function checkGsc() {
    startGscCheck(async () => {
      setGscCheck(await wizardCheckGscAccess());
    });
  }
  // Self-hosted on localhost: everything in the wizard works, but the
  // content pipeline (GitHub Actions in the site's repo) cannot call back
  // into an address only this machine can reach.
  const isLocalInstance = /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(origin);

  // Step 1: create the project.
  const [createState, createAction, createPending] = useActionState<
    CloudWizardCreateState,
    FormData
  >(
    wizardCreateProject,
    null,
  );
  useEffect(() => {
    if (createState && "ok" in createState) {
      setCreated({
        slug: createState.slug,
        name: createState.name,
        domain: createState.domain,
        mcpToken: createState.mcpToken,
      });
      setPublish(createState.publishTarget === "wordpress" ? "wordpress" : "github");
      setScreen("s1");
    }
  }, [createState]);

  // Step 3b (paid): verify + save DataForSEO credentials.
  const [dfsState, dfsAction, dfsPending] = useActionState<ConnectDataforseoState, FormData>(
    connectDataforseo,
    null,
  );
  useEffect(() => {
    if (dfsState && "ok" in dfsState) setScreen("s3");
  }, [dfsState]);

  // Step 3b (free): verify + save the SerpApi key.
  const [serpState, serpAction, serpPending] = useActionState<ConnectSerpapiState, FormData>(
    connectSerpapi,
    null,
  );
  useEffect(() => {
    if (serpState && "ok" in serpState) {
      setSerpConnected(true);
      setScreen("s3");
    }
  }, [serpState]);

  const step = RAIL[screen];
  // The connect commands the finale renders come off the picked agent's
  // registry entry (agent.connect.*). The server name inside them is unique
  // per project (dispatchseo-<slug>) so an owner connecting a second site
  // never collides with or shadows the first one's token, and default
  // (local) scope ties the connection to the folder it is run in - which is
  // why the copy says to run it in the SITE's repo.

  function skipSerpapi() {
    startSkip(async () => {
      await chooseGscOnly();
      setSerpConnected(false);
      setScreen("s3");
    });
  }

  function confirmMode() {
    startMode(async () => {
      await setProjectMode(modeChoice, created?.slug ?? "");
      setScreen(wordpress ? "s_wp" : "s_gh");
    });
  }

  // One-tap merge: verified paste, or a real skip (hides the Home card too).
  const [ghState, ghAction, ghPending] = useActionState<ConnectGithubState, FormData>(
    connectGithubToken,
    null,
  );
  // Docker automatic-builds: paste the Claude token into the dashboard, stored
  // encrypted and fed to the builder container - no .env edit, no folder hunt.
  const [builderState, builderAction, builderPending] = useActionState<
    ConnectBuilderTokenState,
    FormData
  >(connectBuilderToken, null);
  // Finale collapse: poll the same status the checklist reads, so once the
  // agent is demonstrably working the kickoff commands fold away and a calm
  // "let your agent work" banner takes over - the dense command list stops
  // competing for attention (owner feedback: the finale felt overwhelming).
  const [finaleStatus, setFinaleStatus] = useState<{
    agentWorking: boolean;
    buildsActive: boolean;
  } | null>(null);
  useEffect(() => {
    // Not on the WordPress finale: both things this poll feeds (the install
    // collapse, the builder state) are switched off there.
    if (screen !== "s5" || !created || wordpress) return;
    let stopped = false;
    const slug = created.slug;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const s = (await res.json()) as {
          install_progress?: Record<string, string>;
          open_pr?: unknown;
          canary_ok?: boolean | null;
          pipeline_installed?: boolean;
          builds_active?: boolean;
        };
        const progressCount = s.install_progress ? Object.keys(s.install_progress).length : 0;
        setFinaleStatus({
          agentWorking: Boolean(
            progressCount > 0 || s.open_pr || s.canary_ok || s.pipeline_installed,
          ),
          buildsActive: Boolean(s.builds_active),
        });
      } catch {
        /* transient - next tick retries */
      }
    }
    void poll();
    const id = setInterval(poll, 6000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [screen, created, wordpress]);
  // Install progress only exists on the GitHub branch - the WordPress finale
  // never collapses into "your agent is working", there is no install to watch.
  const agentWorking = !wordpress && (finaleStatus?.agentWorking ?? false);
  // The WordPress finale's dashboard unlock. A GitHub project unlocks when the
  // agent's install stamps pipeline_installed_at; a WordPress project has no
  // install, so reaching this screen IS being set up - stamped server-side and
  // awaited, because setScreen's own write is fire-and-forget and losing it
  // would bounce this owner back here from every dashboard page.
  const [finishError, setFinishError] = useState<string | null>(null);
  useEffect(() => {
    if (screen !== "s5" || !wordpress || !created?.slug) return;
    void finishWizard(created.slug).then(
      (r) => setFinishError("error" in r ? r.error : null),
      () => setFinishError("Could not finish setup - reload this page to retry."),
    );
  }, [screen, wordpress, created?.slug]);
  const buildsOn = Boolean(finaleStatus?.buildsActive) || Boolean(builderState && "ok" in builderState);
  useEffect(() => {
    if (ghState && "ok" in ghState) setScreen("s4b");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghState]);
  function skipMergeToken() {
    startGhSkip(async () => {
      await skipPowerup("merge");
      setScreen("s4b");
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* header */}
      <div className="flex items-center justify-between pb-4 pt-1">
        <p className="text-sm font-semibold tracking-tight">Set up a new site</p>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          Setup takes about 10 minutes
        </p>
      </div>

      {/* progress rail */}
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors ${
              step > i || screen === "s5"
                ? "bg-violet-500"
                : step === i
                  ? "bg-gradient-to-r from-violet-500 from-45% to-neutral-800 to-45%"
                  : "bg-neutral-800"
            }`}
          />
        ))}
      </div>
      <div className="mb-5 mt-2 flex items-baseline justify-between text-xs text-neutral-500">
        {screen === "s5" ? (
          <span className="font-medium text-neutral-100">Setup complete</span>
        ) : (
          <>
            <span className="text-neutral-400">
              Step {step + 1} of {STEP_COUNT} ·{" "}
              <b className="font-medium text-neutral-100">{META[screen].name}</b>
            </span>
            <span>{META[screen].time}</span>
          </>
        )}
      </div>

      {/* ============ STEP 1 · Add your site ============ */}
      {screen === "s0" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Add your site</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Everything on this page is about <b className="font-medium text-neutral-200">your website</b> -
            the site you want Google traffic for. DispatchSEO itself is already
            running; now point it at your site. Takes 30 seconds.
          </p>
          {/* Same slot on all ten screens - see StepHelp's note on why the
              position is uniform and why it opens in a new tab. */}
          <StepHelp
            href="/docs/setup-wizard#step-1-add-your-site"
            label="What goes in these fields?"
          />
          {isLocalInstance ? (
            <div className="mb-3.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-sm leading-relaxed text-amber-100/90">
              <b className="font-semibold text-amber-200">Running on {origin.replace(/^https?:\/\//, "")}.</b>{" "}
              Everything works from here - including automatic article builds,
              through the bundled builder: it runs your Claude Code inside
              Docker, so nothing needs to reach this machine from outside. One
              thing to do for that, once: on the last screen of this wizard
              you&apos;ll paste a Claude token (from{" "}
              <code className="font-mono text-amber-100">claude setup-token</code>)
              into a field - no terminal or files to touch. (Prefer the terminal?
              Set{" "}
              <code className="font-mono text-amber-100">CLAUDE_CODE_OAUTH_TOKEN</code>{" "}
              in <code className="font-mono text-amber-100">.env</code> instead.)
            </div>
          ) : null}
          <form action={createAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {createState && "error" in createState ? <ErrorLine msg={createState.error} /> : null}
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Site name</span>
              <input name="name" required placeholder="My Site" autoComplete="off" className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Your site&apos;s domain</span>
              <input name="domain" required placeholder="example.com" autoComplete="off" defaultValue={prefillDomain ?? undefined} className={inputClass} />
              <span className="block text-sm leading-relaxed text-neutral-500">
                The website whose rankings DispatchSEO will grow and track - not
                where DispatchSEO is hosted.
              </span>
            </label>
            {/* Asked before the repo field because it decides whether there IS
                one. The old form had only the repo field, required, so a
                WordPress owner - whom the README and the install guide both
                invite - could not get past this screen at all. */}
            <div className="space-y-1.5">
              <span className="block text-base font-medium text-neutral-200">
                Where do finished articles get published?
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { v: "github", label: "A GitHub repo" },
                    { v: "wordpress", label: "WordPress" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    aria-pressed={publish === o.v}
                    onClick={() => setPublish(o.v)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      publish === o.v
                        ? "border-violet-500 bg-[#191521] text-neutral-100"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-sm text-neutral-500">
                {wordpress
                  ? "WordPress you host yourself (not wordpress.com). Articles post straight into it - you connect it on step 6 with a password WordPress makes for you. No GitHub needed."
                  : "Your site is built from code in a GitHub repo. Articles arrive there as pull requests you review."}
              </p>
            </div>
            <input type="hidden" name="publish_target" value={publish} />
            {wordpress ? null : (
            <>
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Your site&apos;s GitHub repo</span>
              <input name="repo" required placeholder="owner/repo" autoComplete="off" className={inputClass} />
              <span className="block text-sm leading-relaxed text-neutral-500">
                The repo your website deploys from - Claude ships every article
                and tool to it as a pull request you review. It&apos;s the
                owner/repo part of the URL on{" "}
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                >
                  github.com
                </a>
                .
              </span>
            </label>
            <div className="space-y-1.5">
              <span className="block text-base font-medium text-neutral-200">
                Does the site have a blog or content section?
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { v: "existing", label: "Yes" },
                    { v: "create", label: "Not yet" },
                    { v: "detect", label: "Not sure" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    aria-pressed={contentMode === o.v}
                    onClick={() => setContentMode(o.v)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      contentMode === o.v
                        ? "border-violet-500 bg-[#191521] text-neutral-100"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {contentMode === "existing" ? (
                <input
                  name="content_path_hint"
                  value={contentHint}
                  onChange={(e) => setContentHint(e.target.value)}
                  placeholder="Where? /blog, /articles... (optional)"
                  autoComplete="off"
                  className={inputClass}
                />
              ) : null}
              <p className="text-sm text-neutral-500">
                {contentMode === "create"
                  ? "Claude adds one to your repo during setup, as a PR you review."
                  : contentMode === "existing"
                    ? "Claude publishes into your existing section. It never creates a second one."
                    : "Claude checks the repo during setup and decides."}
              </p>
            </div>
            </>
            )}
            {/* "detect" for WordPress: the blog question is about a repo's
                content folder, and WordPress always has a posts section. */}
            <input type="hidden" name="content_mode" value={wordpress ? "detect" : contentMode} />
            {/* Publishing stays human-approved by default; Settings can flip it later. */}
            <input type="hidden" name="mode" value="semi" />
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={createPending}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createPending ? "Creating..." : "Continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ STEP 2 · Search Console ============ */}
      {screen === "s1" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M3 3v17a1 1 0 0 0 1 1h17" />
              <path d="M7 14l4-4 4 3 5-6" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect Google Search Console</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            This is where your traffic and ranking data comes from. It&apos;s free and takes 2 minutes.
          </p>
          <StepHelp href="/docs/search-console" label="Walk me through Search Console" />
          <div className="rounded-xl bg-neutral-900 p-4">
            {effectiveSaEmail ? (
              <>
                <p className="mb-2 text-base font-medium text-neutral-200">
                  Add this email as a user in Search Console
                </p>
                <CopyBox text={effectiveSaEmail} />
                <div className="mt-3.5">
                  <GscSteps domain={created?.domain ?? "your site"} />
                </div>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={checkGsc}
                    disabled={gscChecking}
                    className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      gscCheck?.state === "ok"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                    }`}
                  >
                    {gscChecking
                      ? "Checking with Google..."
                      : gscCheck?.state === "ok"
                        ? "Connected ✓"
                        : gscCheck
                          ? "Check again"
                          : "Verify connection"}
                  </button>
                  {gscCheck?.state === "ok" ? (
                    <span className="text-sm text-emerald-300">
                      Search Console is connected - data starts flowing today.
                    </span>
                  ) : gscCheck?.state === "error" ? (
                    // A real rejection from Google, not propagation lag. Saying
                    // "give it a few minutes" here would send someone off to
                    // wait out a broken paste that will never fix itself.
                    <span className="text-sm text-red-400">
                      Google rejected this: {gscCheck.why}. Waiting won&apos;t
                      clear it. Usually the key file was pasted incompletely -
                      re-copy the whole .json (first character to last) and
                      paste it again.{" "}
                      <a
                        href="/docs/search-console"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-red-300"
                      >
                        The full walkthrough
                      </a>{" "}
                      has every click.
                    </span>
                  ) : gscCheck ? (
                    <span className="text-sm text-amber-200/90">
                      Not yet: {gscCheck.why}. Google can take a few minutes
                      after you add the email - you can continue, Home re-checks
                      automatically.
                    </span>
                  ) : (
                    <span className="text-sm text-neutral-500">
                      Added the email? Check right away - it&apos;s usually instant.
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="mb-2 text-base font-medium text-neutral-200">
                  Create the Google connection - one time, about 3 minutes
                </p>
                <p className="mb-3.5 text-[15px] leading-relaxed text-neutral-400">
                  DispatchSEO reads your numbers through a{" "}
                  <b className="font-medium text-neutral-300">service account</b> - a robot
                  Google account it signs in as. Create one, download its key
                  file, paste it below. It works for every site you ever add.
                </p>
                <ol className="space-y-2.5 text-[15px] text-neutral-400">
                  {[
                    <>
                      <a
                        href="https://console.cloud.google.com/projectcreate"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                      >
                        Create a Google Cloud project
                      </a>{" "}
                      - any name works. Already have one? Skip to step 2.
                    </>,
                    <>
                      <a
                        href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                      >
                        Enable the Search Console API
                      </a>{" "}
                      - press <b className="font-medium text-neutral-200">Enable</b> (pick your
                      project at the top if it asks).
                    </>,
                    <>
                      <a
                        href="https://console.cloud.google.com/iam-admin/serviceaccounts/create"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                      >
                        Create the service account
                      </a>{" "}
                      - name it <b className="font-medium text-neutral-200">dispatchseo</b>,
                      press <b className="font-medium text-neutral-200">Done</b>. Skip the two
                      optional permission screens - it needs no roles.
                    </>,
                    <>
                      Click the account you just made, open the{" "}
                      <b className="font-medium text-neutral-200">Keys</b> tab →{" "}
                      <b className="font-medium text-neutral-200">Add key</b> →{" "}
                      <b className="font-medium text-neutral-200">Create new key</b> →{" "}
                      <b className="font-medium text-neutral-200">JSON</b>. A .json file
                      downloads.
                    </>,
                    <>Open the downloaded file in any text editor, copy everything, paste it here:</>,
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs font-semibold text-neutral-300">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <form action={gscConnAction} className="mt-4 space-y-2.5">
                  {gscConnState && "error" in gscConnState ? (
                    <ErrorLine msg={gscConnState.error} />
                  ) : null}
                  <textarea
                    name="json"
                    rows={5}
                    required
                    placeholder='Paste the whole key file - it starts with {"type": "service_account", ...'
                    className={`${inputClass} font-mono text-sm`}
                  />
                  <button
                    type="submit"
                    disabled={gscConnPending}
                    className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {gscConnPending ? "Connecting..." : "Connect service account"}
                  </button>
                </form>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                  The key is stored encrypted in your database. You can also skip
                  this - everything else works, and the Home setup card brings
                  you back here whenever.
                </p>
              </>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <span />
            <button
              type="button"
              onClick={() => setScreen("s2a")}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 3a · Pick a keyword data source ============ */}
      {screen === "s2a" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
              <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Where should Claude get keyword data?</h2>
          <p className="mb-2.5 text-base text-neutral-400">Pick one. You can switch anytime in Settings.</p>
          <StepHelp
            href="/docs/setup-wizard#step-3-pick-a-keyword-data-source"
            label="Which one should I pick?"
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setChoice("paid");
                setScreen("s2b_paid");
              }}
              className="cursor-pointer rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:border-neutral-600"
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Paid
                </span>
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  Recommended
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">DataForSEO</h3>
              <p className="mt-1 text-sm text-neutral-400">
                The accurate option. Real Google search volumes, keyword difficulty, and competitor
                data. The same data most SEO tools resell.
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                <b className="font-medium text-neutral-300">Pay as you go.</b> $1 free credit to
                start, then a typical site costs $2 to 5 a month. No subscription.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setChoice("free");
                setScreen("s2b_free");
              }}
              className="cursor-pointer rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:border-neutral-600"
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Free · $0 forever
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Free mode</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Runs on free data. Claude finds keyword opportunities in your Search Console data
                (searches where you already show up but don&apos;t rank well yet) and expands them with
                Google&apos;s own autocomplete suggestions. What people actually type into the search box.
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                What you give up vs DataForSEO: exact search volumes and difficulty scores.
              </p>
            </button>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen("s1")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <span />
          </div>
        </section>
      ) : null}

      {/* ============ STEP 3b · DataForSEO credentials ============ */}
      {screen === "s2b_paid" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
              <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect DataForSEO</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Two fields from your DataForSEO account. New accounts start with $1 free credit.
          </p>
          <StepHelp
            href="/docs/setup-wizard#step-3-pick-a-keyword-data-source"
            label="Where do I find these?"
          />
          <form action={dfsAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {dfsState && "error" in dfsState ? <ErrorLine msg={dfsState.error} /> : null}
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">API login</span>
              <input
                name="login"
                type="email"
                required
                placeholder="Your DataForSEO account email"
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">API password</span>
              <input
                name="password"
                type="password"
                required
                placeholder="From app.dataforseo.com/api-access"
                autoComplete="new-password"
                className={inputClass}
              />
            </label>
            <a
              href="https://app.dataforseo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-violet-400 hover:text-violet-300 hover:underline"
            >
              Create an account →
            </a>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setScreen("s2a")}
                className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={dfsPending}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {dfsPending ? "Checking with DataForSEO..." : "Verify and continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ STEP 3b · Free mode: optional SerpApi ============ */}
      {screen === "s2b_free" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Optional but worth it: free SerpApi key</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Free mode is set. This one upgrade is worth 2 minutes, and you can skip it.
          </p>
          <StepHelp
            href="/docs/setup-wizard#step-3-pick-a-keyword-data-source"
            label="What does SerpApi add?"
          />
          <form action={serpAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {serpState && "error" in serpState ? <ErrorLine msg={serpState.error} /> : null}
            <p className="text-sm text-neutral-400">
              Without it, Claude picks keywords from your own data. With it, Claude can open the
              real Google results for a keyword before writing anything and see who&apos;s on page 1. If
              it&apos;s Reddit threads and thin blog posts, the keyword is winnable. If it&apos;s all big
              brands, Claude skips it.
            </p>
            <p className="text-sm text-neutral-400">
              250 free searches a month, no credit card, about 2 minutes.
            </p>
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">SerpApi key</span>
              <input name="key" placeholder="Paste your key" autoComplete="off" className={inputClass} />
            </label>
            <a
              href="https://serpapi.com/users/sign_up"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-violet-400 hover:text-violet-300 hover:underline"
            >
              Get a free key →
            </a>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setScreen("s2a")}
                className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={skipSerpapi}
                  disabled={pendingSkip}
                  className="cursor-pointer px-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingSkip ? "Saving..." : "Not interested, let's continue"}
                </button>
                <button
                  type="submit"
                  disabled={serpPending}
                  className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {serpPending ? "Checking with SerpApi..." : "Verify and continue"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ STEP 4 · Coding agent ============ */}
      {screen === "s3" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <polyline points="4 17 10 11 4 5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="19" x2="20" y2="19" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Which coding agent does the work?</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Your agent is the brain. DispatchSEO is its memory and dashboard.
          </p>
          <StepHelp href={agent.installDocsPath} label={`I don't have ${agent.displayName} yet`} />
          <div className="rounded-xl bg-neutral-900 p-4">
            {/* The pick, made here rather than discovered on the finale: every
                command the last screen shows is different per agent, and the
                old just-read version of this step meant a Codex owner met
                Claude-flavored pastes with their own path folded away behind a
                disclosure (owner call, 2026-08-02). Still changeable on the
                finale - this is a default, not a commitment. */}
            <p className="mb-1 text-base font-medium text-neutral-200">
              Both do the same job - research, writing,{" "}
              {wordpress ? "publishing" : "pull requests"}. The difference is who bills you.
            </p>
            <p className="mb-2.5 text-sm text-neutral-400">
              Nothing is billed by DispatchSEO either way.
            </p>
            <AgentPicker value={agentChoice} onPick={pickAgent} saving={agentSaving} />
            <p className="mt-3 text-sm text-neutral-400">
              That&apos;s the whole step. The last screen gives you two pastes, already adapted
              to {agent.displayName} - they connect it to this project and set everything up,
              checking each value as it goes. Your agent researches keywords and writes the
              guides{wordpress ? "" : ", and opens the pull requests"}; this dashboard is where
              you watch and approve.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen(choice === "paid" ? "s2b_paid" : "s2b_free")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setScreen("s3m")}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 5 · Publish mode ============ */}
      {screen === "s3m" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12 22a10 10 0 1 0-10-10" strokeLinecap="round" />
              <path d="M2 17v5h5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Should anything go live without you?</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Both modes research and build the same way. The only difference is whether a human
            says yes before something is published.
          </p>
          <StepHelp href="/docs/setup-wizard#step-5-publish-mode" label="Explain the two modes" />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={modeChoice === "semi"}
              onClick={() => setModeChoice("semi")}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                modeChoice === "semi"
                  ? "border-violet-500 bg-[#191521]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
              }`}
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  Recommended to start
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Semi-automatic</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Claude researches and builds on its own, but nothing goes live without you. You
                approve the ideas and {wordpress ? "approve each finished article" : "click Merge on finished pages"},
                right from the dashboard.
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                A few minutes of your attention a week.
              </p>
            </button>
            <button
              type="button"
              aria-pressed={modeChoice === "auto"}
              onClick={() => setModeChoice("auto")}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                modeChoice === "auto"
                  ? "border-violet-500 bg-[#191521]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
              }`}
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Hands-off
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Automatic</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Everything runs itself. Ideas are approved for you, and every page that passes its
                checks publishes to your live site without anyone touching it.
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                You can watch everything, and undo anything, from the dashboard.
              </p>
            </button>
          </div>
          <p className="mt-2.5 text-center text-sm text-neutral-400">
            Switch anytime with the Semi / Auto toggle in the top bar.
          </p>
          {modeChoice === "auto" ? (
            <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-neutral-300">
              One tip for automatic mode: after setup, spend two minutes on the{" "}
              <a
                href="/docs/troubleshooting#get-emailed-when-something-breaks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
              >
                failure email
              </a>
              . When everything runs itself, nobody opens the dashboard on a normal
              day - the email is what tells you if a job ever breaks.
            </p>
          ) : null}
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen("s3")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={confirmMode}
              disabled={pendingMode}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingMode ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 6 · One-tap merge (GitHub token) ============ */}
      {screen === "s_gh" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M13 2 3 14h8l-1 8 11-14h-9l1-6Z" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect GitHub</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            {isDocker ? (
              <>
                Claude opens finished pages as pull requests, and this token is
                how your install works with GitHub: the bundled builder uses it
                to clone your repo, open the PRs, and - in auto mode - merge
                them. It also makes the Approve button here merge instantly.
                Skipping it means no automatic building on this install.
              </>
            ) : (
              <>
                Claude opens finished pages as pull requests. With a GitHub
                token, the Approve button here also merges them - approve =
                live on your site. Without it, you merge each PR on GitHub
                yourself.
              </>
            )}
          </p>
          <StepHelp
            href="/docs/setup-wizard#step-6-connect-github"
            label="How do I make a GitHub token?"
          />
          <div className="rounded-xl bg-neutral-900 p-4">
            <ol className="space-y-2.5 text-[15px] text-neutral-400">
              {[
                <>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=DispatchSEO%20merge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                  >
                    Create the token on GitHub
                  </a>{" "}
                  - the link pre-fills everything (classic token,{" "}
                  <b className="font-medium text-neutral-200">repo</b> scope). Pick an
                  expiration, press{" "}
                  <b className="font-medium text-neutral-200">Generate token</b>.
                </>,
                <>Copy the token it shows (starts with <b className="font-medium text-neutral-200">ghp_</b>) and paste it here:</>,
              ].map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs font-semibold text-neutral-300">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <form action={ghAction} className="mt-3.5 space-y-2.5">
              {ghState && "error" in ghState ? <ErrorLine msg={ghState.error} /> : null}
              <input
                name="token"
                type="password"
                placeholder="ghp_..."
                autoComplete="new-password"
                className={inputClass}
              />
              <p className="text-sm leading-relaxed text-neutral-500">
                Verified against {created?.name ?? "your"}&apos;s repo before it saves -
                and stored encrypted in your database.
              </p>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setScreen("s3m")}
                  className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={skipMergeToken}
                    disabled={pendingGhSkip}
                    className="cursor-pointer px-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pendingGhSkip
                      ? "Saving..."
                      : isDocker
                        ? "Skip - no automatic building"
                        : "Skip - I'll merge on GitHub"}
                  </button>
                  <button
                    type="submit"
                    disabled={ghPending}
                    className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {ghPending ? "Checking with GitHub..." : "Verify and continue"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 6 (WordPress) · Connect WordPress ============ */}
      {screen === "s_wp" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M5 9h14" strokeLinecap="round" />
              <path d="m8.5 9 3 8 3-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect your WordPress site</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Finished articles post straight into your WordPress - no plugin, nothing to
            install. You need the username you log in with and an application password, which
            WordPress makes for you in about a minute.
          </p>
          <StepHelp href="/docs/setup-wizard#step-6-connect-wordpress" label="Walk me through this" />
          <div className="rounded-xl bg-neutral-900 p-4">
            {/* The same component Settings and the cloud wizard render, so the
                instructions and the live capability check exist in one place. */}
            <WordPressConnect
              status={wpStatus}
              slug={created?.slug}
              onConnected={() => setWpJustConnected(true)}
            />
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setScreen("s3m")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <div className="flex items-center gap-2.5">
              {/* Skippable, same as the GitHub token: someone without their
                  WordPress password to hand must not be trapped here, and the
                  drafts wait rather than vanish. */}
              <button
                type="button"
                onClick={() => setScreen("s4b")}
                className="cursor-pointer px-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                Skip - I&apos;ll connect it from Settings
              </button>
              <button
                type="button"
                disabled={!wpConnected}
                onClick={() => setScreen("s4b")}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 7 · What happens next ============ */}
      {screen === "s4b" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">What happens next</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            SEO is slow at the start - that&apos;s how it works for everyone. Here&apos;s the honest
            timeline, so a quiet first month reads as on schedule, not broken.
          </p>
          <StepHelp href="/docs/day-to-day" label="What will my week look like?" />
          <div className="rounded-xl bg-neutral-900 px-4 py-1">
            {TIMELINE.map((t) => (
              <div key={t.label} className="flex gap-3.5 border-b border-neutral-800 py-3 last:border-b-0">
                <span className="w-24 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  {t.months}
                </span>
                <div>
                  <p className="text-base font-medium text-neutral-200">{t.label}</p>
                  <p className="text-sm text-neutral-400">{t.copy}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-sm text-neutral-400">
            Home tracks this same journey at the top of the page - stage by stage, with what
            moved each week.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen(wordpress ? "s_wp" : "s_gh")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setScreen("s5")}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
            >
              Got it
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ FINISH ============ */}
      {screen === "s5" ? (
        <section>
          <StepIcon done>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" />
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">You&apos;re live.</h2>

          {/* While the agent works, the calm status card (dispatcher +
              spinner) lives at the BOTTOM of this screen - the top stays
              reserved for anything still actionable (the collapsed pastes,
              the builder-token step). Owner feedback: waiting vibes must
              never sit above a command someone still has to run. */}
          {agentWorking ? null : (
            <p className="mb-2.5 text-base text-neutral-400">
              {wordpress
                ? "Your site is set up. Nothing installs itself here - the work starts when you ask your coding agent for it, and the pastes are right below."
                : "Two pastes and your coding agent takes care of the rest."}
            </p>
          )}

          {/* The help slot sits under the intro on every screen, including this
              one - so it lands under whichever of the two intros rendered. */}
          <StepHelp href={agent.installDocsPath} label="Walk me through these two pastes" />

          {wordpress ? (
            <>
              {finishError ? <ErrorLine msg={finishError} /> : null}
              <div className="mb-5 space-y-2">
                <p className="text-sm font-medium text-neutral-200">Your coding agent</p>
                <AgentPicker value={agentChoice} onPick={pickAgent} saving={agentSaving} />
              </div>

              <PrereqCallout
                title="One thing on your computer first"
                body={
                  <>
                    This needs{" "}
                    <b className="font-medium text-neutral-200">{agent.displayName}</b> installed.
                    Don&apos;t have it yet? The guide installs it, start to finish, in about 5
                    minutes.
                  </>
                }
                href={agent.installDocsPath}
                cta={`Install ${agent.displayName}`}
              />

              <div className="mt-5 space-y-2">
                <p className="text-lg font-semibold tracking-tight text-neutral-100">
                  1. Paste this in a terminal
                </p>
                <p className="text-sm text-neutral-400">
                  Connects {agent.displayName} to this project. Make an empty folder for your SEO
                  work and run it there - the connection belongs to the folder it is run in, so
                  always open {agent.displayName} in that same folder.
                </p>
                {/* mcpAdd*, not connect.*: the full connect command also
                    pre-grants the GitHub CLI, which this branch never uses. */}
                {agent.connect.mcpAddBash("_", "_", "_") ===
                agent.connect.mcpAddPowershell("_", "_", "_") ? (
                  <CopyBox
                    text={created ? agent.connect.mcpAddBash(created.slug, origin, created.mcpToken) : ""}
                  />
                ) : (
                  <ShellCommandTabs
                    bash={created ? agent.connect.mcpAddBash(created.slug, origin, created.mcpToken) : ""}
                    powershell={
                      created
                        ? agent.connect.mcpAddPowershell(created.slug, origin, created.mcpToken)
                        : ""
                    }
                  />
                )}
                <p className="text-[13px] text-neutral-500">
                  <b className="font-semibold text-neutral-300">
                    Restart {agent.displayName} after pasting this.
                  </b>{" "}
                  Connections load only at startup, so a session that was already open
                  can&apos;t see the one you just added.
                </p>
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-lg font-semibold tracking-tight text-neutral-100">
                  2. Paste this into {agent.displayName}
                </p>
                <p className="text-sm text-neutral-400">
                  Open {agent.displayName} in that folder (type{" "}
                  <b className="font-medium text-neutral-100">{agent.cli}</b> in the terminal)
                  and paste. It learns your site and fills your queue with article ideas:
                </p>
                <CopyBox emphasis text={created ? setupChatCommand(created.slug) : ""} />
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-lg font-semibold tracking-tight text-neutral-100">
                  3. Whenever you want an article written
                </p>
                <p className="text-sm text-neutral-400">
                  Approve ideas on the Queue screen first, then paste this. The finished article
                  is checked, formatted and posted to your WordPress from here:
                </p>
                <CopyBox text={created ? writeGuideCommand(created.slug) : ""} />
              </div>

              {/* Said here rather than left to be discovered: an article that
                  finishes with nowhere to go is the most confusing outcome
                  this product has. */}
              {wpConnected ? null : (
                <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-3 text-sm text-amber-100/90">
                  WordPress isn&apos;t connected yet - finished articles will wait on the Drafts
                  screen until you connect it from Settings.
                </p>
              )}

              <div className="mt-4 flex justify-center">
                <a
                  href="/dashboard"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition-colors hover:border-violet-500/50 hover:bg-neutral-800"
                >
                  Explore your dashboard →
                </a>
              </div>
            </>
          ) : agentWorking ? (
            // Steps 1 & 2 already did their job - tuck them into a one-click
            // details so a dropped session can still recover the commands.
            <details className="group rounded-xl bg-neutral-900 px-4 py-3">
              <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200">
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
                    <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Agent connected - setup commands (already run)
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" aria-hidden>
                  <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-neutral-400">
                    <b className="font-medium text-neutral-200">1.</b>{" "}
                    Connect {agent.displayName} (in your site&apos;s repo):
                  </p>
                  <ShellCommandTabs
                    bash={created ? agent.connect.bash(created.slug, origin, created.mcpToken) : ""}
                    powershell={
                      created ? agent.connect.powershell(created.slug, origin, created.mcpToken) : ""
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-neutral-400">
                    <b className="font-medium text-neutral-200">2.</b>{" "}
                    Paste into {agent.displayName}:
                  </p>
                  <CopyBox text={created ? installCommand(created.slug) : ""} />
                </div>
              </div>
            </details>
          ) : (
            <>
              {/* Prerequisites before the instructions, never after: both
                  pastes below are terminal commands that fail with "command
                  not found" if these two tools are missing, and a prerequisite
                  the reader only meets at the bottom of the screen has already
                  failed at its job. (In the agentWorking branch the tools are
                  demonstrably installed, so this doesn't render there.) */}
              {/* The pick again, not just an echo: a dropped session resumes
                  straight to this screen without passing the agent step, and
                  every paste below is different per agent. */}
              <div className="mb-5 space-y-2">
                <p className="text-sm font-medium text-neutral-200">Your coding agent</p>
                <AgentPicker value={agentChoice} onPick={pickAgent} saving={agentSaving} />
              </div>

              <PrereqCallout
                title="Two things on your computer first"
                body={AGENT_PREREQ_STEP[agentChoice].body}
                href={agent.installDocsPath}
                cta={AGENT_PREREQ_STEP[agentChoice].cta}
              />

              <div className="mt-5 space-y-2">
                <p className="text-lg font-semibold tracking-tight text-neutral-100">
                  1. Paste this in a terminal, inside your site&apos;s repo
                </p>
                <p className="text-sm text-neutral-400">{AGENT_CONNECT_BLURB[agentChoice]}</p>
                {/* Two tabs only make sense when the two shells actually
                    differ - Codex's connect command is byte-identical in bash
                    and PowerShell (see agents/index.ts), so tabs there would
                    be two labels for one command. Derived from the agent's
                    own connect functions (probed with placeholder args, same
                    idea agent.connect.bash === powershell would test if they
                    were referentially equal - they aren't, so this compares
                    output instead) rather than the agent id, so a third agent
                    gets the right layout automatically without a wizard edit. */}
                {agent.connect.bash("_", "_", "_") === agent.connect.powershell("_", "_", "_") ? (
                  // Codex's connect is the same string in bash and PowerShell.
                  <CopyBox
                    text={created ? agent.connect.bash(created.slug, origin, created.mcpToken) : ""}
                  />
                ) : (
                  <ShellCommandTabs
                    bash={created ? agent.connect.bash(created.slug, origin, created.mcpToken) : ""}
                    powershell={
                      created ? agent.connect.powershell(created.slug, origin, created.mcpToken) : ""
                    }
                  />
                )}
                <p className="text-[13px] text-neutral-500">
                  <b className="font-semibold text-neutral-300">
                    Restart {agent.displayName} after pasting this - close any open session in
                    that repo and reopen it.
                  </b>{" "}
                  Connections load only at startup, so a session that was already open
                  can&apos;t see the one you just added.
                  {AGENT_RESTART_CAVEAT[agentChoice]}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-lg font-semibold tracking-tight text-neutral-100">
                  2. Paste this into {agent.displayName}
                </p>
                <p className="text-sm text-neutral-400">
                  Open {agent.displayName} in that same repo (type{" "}
                  <b className="font-medium text-neutral-100">{agent.cli}</b> in the terminal)
                  and paste:
                </p>
                <CopyBox emphasis text={created ? installCommand(created.slug) : ""} />
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-4 py-3.5 text-sm text-neutral-300">
                <p>
                  <b className="font-semibold text-neutral-100">Then let the agent work - this is
                  the long part.</b>{" "}
                  Typically 30-40 minutes. If your site has no blog yet, the agent builds your
                  whole content home from scratch, which can stretch toward an hour - it&apos;s
                  building real infrastructure, not stuck.
                </p>
                <p>
                  <b className="font-semibold text-neutral-100">It&apos;s a conversation, not
                  fire-and-forget.</b>{" "}
                  Along the way your agent will ask you to approve its plan and merge one PR -
                  keep the chat visible and follow its instructions. The checklist below fills
                  itself in as it works.
                </p>
                {/* The prerequisite half of this line moved to the callout at
                    the top of the screen - what's left is the reassurance. */}
                <p className="text-[13px] text-neutral-500">
                  Both pastes are safe to re-run any time.
                </p>
              </div>

              {/* The old "Using Codex instead?" disclosure is gone on purpose:
                  the picker above adapts every paste on this screen, so the
                  Codex path IS the screen when picked, not a footnote. */}
            </>
          )}

          {/* The bundled builder clones a repo and opens PRs - its job feed skips a
              project without one, so offering "automatic builds" here would
              take a token for something that never runs. */}
          {isDocker && !wordpress ? (
            buildsOn ? (
              <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5 text-sm text-neutral-300">
                <b className="font-semibold text-emerald-400">Automatic builds are on.</b> Your
                token is saved (encrypted). The &quot;Automatic builds&quot; row below turns
                green once the builder checks in.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-[15px] text-neutral-300">
                  <b className="font-semibold text-neutral-100">3.</b>{" "}
                  Turn on automatic builds. One time - pick your agent, mint its credential,
                  paste it here:
                </p>
                {/* The SAME component Home's card and Settings render, not a
                    copy: the previous inline form here was Claude-hardcoded
                    (sk-ant-oat placeholder, no agent field), so a Codex user
                    pasting their OpenAI key got "that doesn't look like a
                    Claude Code token" from the very screen whose disclosure
                    above says Codex works identically. Reuse is the fix that
                    stays fixed. */}
                {/* Keyed by the pick so choosing Codex above flips this card's
                    tab to Codex too - current only seeds the initial tab. */}
                <BuilderTokenConnect key={agentChoice} current={agentChoice} />
                <p className="text-sm text-neutral-500">
                  That&apos;s your coding agent running inside Docker, building on schedule, no
                  public URL needed. Until it&apos;s on, nothing builds automatically - everything
                  else still works. (Prefer the terminal? Add{" "}
                  <code className="font-mono text-neutral-400">CLAUDE_CODE_OAUTH_TOKEN</code>,{" "}
                  <code className="font-mono text-neutral-400">OPENAI_API_KEY</code> or{" "}
                  <code className="font-mono text-neutral-400">CURSOR_API_KEY</code> to the
                  install folder&apos;s <code className="font-mono text-neutral-400">.env</code>{" "}
                  instead - env always wins.)
                </p>
              </div>
            )
          ) : null}

          {isDocker ? (
            <p className="mt-4 rounded-lg bg-neutral-900 px-3.5 py-3 text-sm text-neutral-400">
              <b className="font-medium text-neutral-200">From tomorrow on:</b> your dashboard
              lives at <b className="font-medium text-neutral-200">{origin}</b> whenever
              Docker is running - bookmark it. Ever find it down? Re-run{" "}
              <code className="font-mono text-neutral-300">sh start.sh</code> in the install
              folder (Windows: double-click <code className="font-mono text-neutral-300">start.cmd</code>)
              and it comes back.
            </p>
          ) : null}

          <details className="group mt-4 rounded-xl bg-neutral-900 px-4 py-3">
            <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200">
              What got connected
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <ul className="mt-1">
              {[
                <>
                  <b className="font-medium text-neutral-200">{created?.name ?? "Your site"}</b> (
                  {created?.domain ?? "yourdomain.com"}) added
                </>,
                <>
                  <b className="font-medium text-neutral-200">Search Console</b> access requested.
                  Confirms itself when the first data arrives.
                </>,
                choice === "paid" ? (
                  <>
                    <b className="font-medium text-neutral-200">Keyword data:</b> DataForSEO, pay as
                    you go
                  </>
                ) : serpConnected ? (
                  <>
                    <b className="font-medium text-neutral-200">Keyword data:</b> Free mode with
                    SerpApi page-1 checks
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Keyword data:</b> Free mode, Search
                    Console + Google autocomplete
                  </>
                ),
                wordpress ? (
                  <>
                    <b className="font-medium text-neutral-200">Publishing:</b>{" "}
                    {wpConnected
                      ? "articles post straight into your WordPress"
                      : "WordPress, not connected yet - articles wait on Drafts"}
                  </>
                ) : contentMode === "create" ? (
                  <>
                    <b className="font-medium text-neutral-200">Content home:</b> Claude adds a blog
                    section to your repo in its first setup PR
                  </>
                ) : contentMode === "existing" ? (
                  <>
                    <b className="font-medium text-neutral-200">Content home:</b> your existing
                    section{contentHint ? ` (${contentHint})` : ""}
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Content home:</b> Claude detects
                    where content lives during setup
                  </>
                ),
                wordpress ? (
                  <>
                    <b className="font-medium text-neutral-200">{agent.displayName}</b> connects
                    with the command above and works whenever you ask it to
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Claude Code</b> connects with the
                    setup command above - one paste does connection, secrets, and the pipeline
                  </>
                ),
                modeChoice === "auto" ? (
                  <>
                    <b className="font-medium text-neutral-200">Publish mode:</b> Automatic, pages
                    ship themselves once checks pass
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Publish mode:</b> Semi-automatic,
                    you approve ideas and {wordpress ? "finished articles" : "merges"}
                  </>
                ),
              ].map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 border-b border-neutral-800 py-2 text-sm text-neutral-500 last:border-b-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </details>
          {/* The install checklist - nothing to tick off without an install. */}
          {created && !wordpress ? <FirstRunStatus slug={created.slug} /> : null}

          {agentWorking ? (
            <div className="mt-5 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] px-5 py-5">
              <PixelDispatcher working className="mx-auto w-[min(220px,70vw)]" />
              <div className="mt-3 flex items-center justify-center gap-2.5">
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-400/25 border-t-violet-400"
                />
                <p className="text-lg font-semibold text-white">Your agent is working.</p>
              </div>
              <p className="mx-auto mt-2 max-w-md text-center text-[15px] leading-relaxed text-neutral-300">
                Typically <b className="font-medium text-neutral-100">30-40 minutes</b> - up to
                an hour if it&apos;s building your blog from scratch. Long is normal; it&apos;s
                not stuck.
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-center text-[15px] leading-relaxed text-neutral-300">
                Watch the terminal for its questions, and{" "}
                <b className="font-medium text-neutral-100">your email for the PR to merge</b>.
                This page updates itself.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

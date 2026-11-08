#!/usr/bin/env node
// Generates the agent-specific step blocks inside every pipeline workflow
// template, from ONE source of truth per agent.
//
//   node --experimental-strip-types scripts/generate-agent-steps.mjs          # regenerate
//   node --experimental-strip-types scripts/generate-agent-steps.mjs --check  # verify (CI)
//
// Why. Every builder workflow needs the same four agent-specific pieces:
// resolve which agent runs (asking the dashboard at run time), write the
// agent's MCP config, invoke the agent, and classify what the outcome MEANS
// (deferral vs failure). With two agents that was already ~250 hand-kept lines
// duplicated across nine workflows, and each new agent multiplies it. The
// blocks now live between `# >>> agent-steps: <region>` / `# <<< agent-steps:`
// markers and are GENERATED from:
//
//   scripts/agent-ci/<agent>.mjs   - per-agent CI knowledge (one file per agent)
//   scripts/agent-ci/workflows.mjs - per-workflow parameters
//   scripts/agent-ci/prompts.json  - the task prompts (ONE copy; both agents'
//                                    invoke steps render from the same text)
//
// Adding an agent: write its module, add it to scripts/agent-ci/index.mjs and
// src/lib/agents/index.ts, regenerate, and every workflow - in every installed
// repo, via the pack sweep - carries the new agent. Never edit between the
// markers by hand; this script's --check (pr-check.yml) fails the build if the
// generated blocks drift from their sources.
//
// The generated text is deliberately the exact shell/YAML the workflows always
// shipped - this generator changes where the truth lives, not what runs.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, DEFAULT_AGENT, NON_DEFAULT_AGENTS } from "./agent-ci/index.mjs";
import { WORKFLOWS } from "./agent-ci/workflows.mjs";
import { registerTsResolver } from "./agent-ci/resolve-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WF_DIR = join(here, "..", "templates", "pipeline", ".github", "workflows");
const PROMPTS_PATH = join(here, "agent-ci", "prompts.json");
const CHECK = process.argv.includes("--check");

// ---- keep agent-ci and the runtime registry in step -------------------------
// src/lib/agents/index.ts is what the backend serves; these modules are what
// the workflows run. An agent present in one but not the other is a
// half-supported agent, which is worse than an unsupported one.
registerTsResolver(resolve(here, "../src"));
const registry = await import("../src/lib/agents/index.ts");
for (const agent of AGENTS) {
  const reg = registry.agentById(agent.id);
  if (reg.id !== agent.id) {
    console.error(`agent-ci/${agent.id}.mjs has no matching entry in src/lib/agents/index.ts`);
    process.exit(1);
  }
  if (reg.credential.repoSecretName !== agent.secretName) {
    console.error(
      `agent-ci/${agent.id}.mjs secretName (${agent.secretName}) disagrees with the registry's ` +
        `credential.repoSecretName (${reg.credential.repoSecretName})`,
    );
    process.exit(1);
  }
}
for (const reg of registry.availableAgents()) {
  if (reg.capabilities.headlessBuilder && !AGENTS.some((a) => a.id === reg.id)) {
    console.error(
      `${reg.id} claims headlessBuilder in src/lib/agents/index.ts but has no scripts/agent-ci/${reg.id}.mjs module - ` +
        `the workflows cannot run it. Add the module or set headlessBuilder: false.`,
    );
    process.exit(1);
  }
}

// ---- prompts ---------------------------------------------------------------
const prompts = existsSync(PROMPTS_PATH) ? JSON.parse(readFileSync(PROMPTS_PATH, "utf8")) : {};

// Bootstrap: pull a prompt out of an existing (pre-marker) workflow file, from
// whatever YAML form it used - a double-quoted single line or a block scalar.
function extractPrompt(lines, stepName) {
  const start = lines.findIndex((l) => l === `      - name: ${stepName}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("      - name: "));
  if (end === -1) end = lines.length;
  for (let i = start; i < end; i++) {
    const m = lines[i].match(/^(\s*)prompt: (.*)$/);
    if (!m) continue;
    const [, indent, rest] = m;
    if (rest === "|" || rest === "|-") {
      const body = [];
      for (let j = i + 1; j < end; j++) {
        const l = lines[j];
        if (l === "") { body.push(""); continue; }
        if (l.startsWith(indent + "  ")) { body.push(l.slice(indent.length + 2)); continue; }
        break;
      }
      while (body.length && body[body.length - 1] === "") body.pop();
      return body.join("\n");
    }
    if (rest.startsWith('"')) {
      return rest.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return rest;
  }
  return null;
}

// ---- shared block builders --------------------------------------------------
const GEN_NOTE = "GENERATED - edit scripts/agent-ci/ and regenerate; never edit between these markers";
const open = (name) => `      # >>> agent-steps: ${name} (${GEN_NOTE})`;
const close = (name) => `      # <<< agent-steps: ${name}`;

const idAlternation = AGENTS.map((a) => a.id).join("|");

// The secret-presence inference used when the backend can't answer: first
// non-default agent whose secret exists while the default's is absent wins,
// else the default - which is what every pre-`agent`-field install ran.
function inferenceLines() {
  // "The default agent's credential is absent" means ALL of its credentials
  // are absent - an ANTHROPIC_API_KEY-only Claude install must not infer codex.
  const defaultAbsent = [
    DEFAULT_AGENT.resolveEnvName,
    ...(DEFAULT_AGENT.extraResolveEnv ?? []).map((e) => e.envName),
  ]
    .map((n) => `[ -z "$${n}" ]`)
    .join(" && ");
  if (NON_DEFAULT_AGENTS.length === 1) {
    const a = NON_DEFAULT_AGENTS[0];
    return [
      `            if [ -n "$${a.resolveEnvName}" ] && ${defaultAbsent}; then agent=${a.id}; else agent=${DEFAULT_AGENT.id}; fi`,
    ];
  }
  const out = [];
  NON_DEFAULT_AGENTS.forEach((a, i) => {
    out.push(
      `            ${i === 0 ? "if" : "elif"} [ -n "$${a.resolveEnvName}" ] && ${defaultAbsent}; then agent=${a.id}`,
    );
  });
  out.push(`            else agent=${DEFAULT_AGENT.id}`);
  out.push(`            fi`);
  return out;
}

function resolveEnvLines() {
  return AGENTS.flatMap((a) => [
    `          ${a.resolveEnvName}: \${{ secrets.${a.secretName} }}`,
    // Secondary credentials an agent can run on (e.g. Claude's metered
    // ANTHROPIC_API_KEY fallback) - the resolve step needs to see them to
    // decide, and to word its errors honestly.
    ...(a.extraResolveEnv ?? []).map((e) => `          ${e.envName}: \${{ secrets.${e.secretName} }}`),
  ]);
}

const UNKNOWN_ARM = [
  `            *)`,
  `              echo "::error::The dashboard reported an unknown agent '$agent'. This repo's workflows are older than that setting - re-run the setup command from your DispatchSEO dashboard to update them."`,
  `              exit 1 ;;`,
];

function composeResolve(wf) {
  const { variant, announce } = wf.resolve;
  const lines = [open("resolve")];

  if (variant === "vars") {
    lines.push(
      `      # Which coding agent validates, plus the fail-fast on a broken credential.`,
      `      # Both agents get the same plain-language error rather than dying minutes`,
      `      # in on a cryptic validation failure.`,
      `      #`,
      `      # UNLIKE every other workflow, this one does NOT ask the backend which`,
      `      # agent to use. Asking means holding SEO_MCP_API_KEY, and the one thing`,
      `      # this job must never do is acquire a reason to hold the project key - it`,
      `      # builds and RUNS the PR's (LLM-authored) code. A secret is only visible`,
      `      # to the step that names it, so the leak would not be direct - but the`,
      `      # invariant is worth more than the consistency.`,
      `      #`,
      `      # The SEO_AGENT repo VARIABLE is the primary answer. Variables (unlike`,
      `      # secrets) are readable without holding anything sensitive, and the`,
      `      # backend best-effort writes this one on every agent switch and install,`,
      `      # so this workflow can agree with the dashboard without asking it.`,
      `      # Inference from secret presence remains the fallback for repos whose`,
      `      # backend predates the variable - but on its own it was NOT just`,
      `      # cosmetic: switching agents leaves the old secret behind (the switch is`,
      `      # deliberately a single column write), the tie-break below then picks the`,
      `      # default, and if the owner switched because that agent's account lapsed,`,
      `      # validation goes red and every tool PR on the project strands unmerged.`,
      `      - name: Resolve the coding agent`,
      `        id: agent`,
      `        env:`,
      ...resolveEnvLines(),
      `          AGENT_VAR: \${{ vars.SEO_AGENT }}`,
      `        run: |`,
      `          case "$AGENT_VAR" in`,
      `            ${idAlternation}) agent="$AGENT_VAR" ;;`,
      ...(NON_DEFAULT_AGENTS.length === 1
        ? [`            *) ${inferenceLines()[0].trim()} ;;`]
        : [`            *)`, ...inferenceLines().map((l) => `  ${l}`), `              ;;`]),
      `          esac`,
      `          case "$agent" in`,
      ...AGENTS.map((a) => a.resolveCaseArm("validate")),
      ...UNKNOWN_ARM,
      `          esac`,
      `          echo "agent=$agent" >> "$GITHUB_OUTPUT"`,
      `          echo "${announce}"`,
    );
    lines.push(close("resolve"));
    return lines.join("\n");
  }

  if (variant === "token-check") {
    lines.push(
      `      # Which agent's credential to prove. Resolved at RUN time from the`,
      `      # dashboard, same as the builders - a health check that tests the wrong`,
      `      # credential is worse than none, because it reports green while the thing`,
      `      # that actually builds is dead.`,
      `      - name: Resolve the coding agent`,
      `        id: agent`,
      `        env:`,
      `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
      ...resolveEnvLines(),
      `        run: |`,
      `          agent=""`,
      `          code=$(curl -s -o /tmp/agent.json -w "%{http_code}" --max-time 30 \\`,
      `            -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
      `            {{BACKEND_URL}}/api/project-mode) || code=unreachable`,
      `          [ "$code" = "200" ] && agent=$(jq -r '.agent // empty' /tmp/agent.json 2>/dev/null)`,
      `          if [ -z "$agent" ] || [ "$agent" = "null" ]; then`,
      ...inferenceLines(),
      `          fi`,
      `          case "$agent" in ${idAlternation}) : ;; *) agent=${DEFAULT_AGENT.id} ;; esac`,
      `          echo "agent=$agent" >> "$GITHUB_OUTPUT"`,
      `          echo "${announce}"`,
    );
    lines.push(close("resolve"));
    return lines.join("\n");
  }

  // default / setup - the builder shape: ask the backend, infer as fallback,
  // then validate the resolved agent's credential in plain language.
  lines.push(
    `      # Which coding agent runs this workflow - resolved at RUN time from the`,
    `      # dashboard, never baked in at install time. A decision left to whoever`,
    `      # ran the install is a decision someone eventually forgets, and the`,
    `      # failure mode here is a builder that runs the wrong agent every night.`,
    `      # Asking the backend means switching agent on the dashboard takes effect`,
    `      # on the next scheduled run with nothing to edit in this repo.`,
    `      #`,
    `      # The fallback matters as much as the happy path: a repo installed against`,
    `      # a backend that predates the \`agent\` field gets no value here, and must`,
    `      # keep behaving exactly as it did - which is ${DEFAULT_AGENT.id}, because Claude was`,
    `      # the only option that ever existed before the field.`,
    `      - name: Resolve the coding agent`,
    `        id: agent`,
  );
  if (wf.guardIf) lines.push(`        if: ${wf.guardIf}`);
  lines.push(
    `        env:`,
    `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
    ...resolveEnvLines(),
    `        run: |`,
    `          agent=""`,
    `          code=$(curl -s -o /tmp/agent.json -w "%{http_code}" --max-time 30 \\`,
    `            -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
    `            {{BACKEND_URL}}/api/project-mode) || code=unreachable`,
    `          [ "$code" = "200" ] && agent=$(jq -r '.agent // empty' /tmp/agent.json 2>/dev/null)`,
    `          if [ -z "$agent" ] || [ "$agent" = "null" ]; then`,
    `            # No answer from the backend. Infer from which secret exists, and`,
    `            # tie-break to ${DEFAULT_AGENT.id} - see the note above.`,
    ...inferenceLines(),
    `            echo "Backend did not name an agent (HTTP $code) - inferred '$agent' from the secrets on this repo."`,
    `          fi`,
    `          # Fail here, in plain language, rather than letting the agent's own`,
    `          # action die minutes in on a cryptic validation error. The 2026-07-17`,
    `          # dogfood install burned four runs on exactly that.`,
    `          case "$agent" in`,
    ...AGENTS.map((a) => a.resolveCaseArm(variant)),
    ...UNKNOWN_ARM,
    `          esac`,
    `          echo "agent=$agent" >> "$GITHUB_OUTPUT"`,
    `          echo "${announce}"`,
  );
  lines.push(close("resolve"));
  return lines.join("\n");
}

// The expression that mirrors whichever agent step actually ran.
function agentOutcomeExpr() {
  const parts = NON_DEFAULT_AGENTS.map(
    (a) => `steps.agent.outputs.agent == '${a.id}' && steps.${a.id}.outcome`,
  );
  return `\${{ ${[...parts, `steps.${DEFAULT_AGENT.id}.outcome`].join(" || ")} }}`;
}

// if/else chain over agents for shell snippets, default agent in the else.
function agentShellChain(snippetOf) {
  const lines = [];
  NON_DEFAULT_AGENTS.forEach((a, i) => {
    lines.push(`          ${i === 0 ? "if" : "elif"} [ "$AGENT" = "${a.id}" ]; then`);
    lines.push(snippetOf(a));
  });
  lines.push(`          else`);
  lines.push(snippetOf(DEFAULT_AGENT));
  lines.push(`          fi`);
  return lines;
}

function composeClassify(wf) {
  const c = wf.run.classify;
  const lines = [];
  if (c.kind === "full") {
    lines.push(
      `      # Decide what the run MEANS before anything is reported. The agent steps`,
      `      # run with continue-on-error so this step is reachable either way; it`,
      `      # reads the final result/error message the agent left behind: a genuine`,
      `      # usage-limit hit is not a pipeline failure, it is deferred (the dashboard`,
      `      # keeps the job due and re-dispatches within hours) and reported as a`,
      `      # GREEN run. Anything else is reported red with the real reason. GitHub's`,
      `      # secret masking still applies to whatever prints.`,
      `      - name: Classify the outcome`,
      `        id: classify`,
    );
    if (wf.guardIf) lines.push(`        if: ${wf.guardIf}`);
    lines.push(`        env:`, `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`);
    for (const a of AGENTS) for (const l of a.classifyEnv ?? []) lines.push(l);
    lines.push(
      `          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
      `          AGENT: \${{ steps.agent.outputs.agent }}`,
      `          AGENT_OUTCOME: ${agentOutcomeExpr()}`,
      `          RUN_URL: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}`,
      `        run: |`,
      `          # Mirror the per-agent step outcome into an output, so the report`,
      `          # step's condition never has to name agent step ids.`,
      `          echo "agent_outcome=\${AGENT_OUTCOME:-}" >> "$GITHUB_OUTPUT"`,
      `          # Pull whatever the agent left behind.`,
      `          msg=""`,
      ...agentShellChain((a) => a.classifyMsgExtraction),
      ``,
      `          # A deferral is reported as \`deferred\`, NOT as ok. The difference`,
      `          # decides whether this job's work happens today at all: the dashboard`,
      `          # works out what is due by reading these reports, and an \`ok\` row is a`,
      `          # COMPLETED run - it would start the full cadence window over and`,
      `          # suppress the retry, so an evening usage limit would silently cost a`,
      `          # day while the dashboard showed green. \`deferred\` says "ran, built`,
      `          # nothing", which keeps the job due and gets it re-dispatched within`,
      `          # hours.`,
      `          defer() {`,
      `            echo "::notice::$1"`,
      `            # Marks the outcome as already-reported. The defer exits 0, so`,
      `            # without this flag the report step below sees every outcome green`,
      `            # and posts ok=1 seconds after this deferred row - and the LATEST`,
      `            # row is what the dashboard's due-ness math reads, so the ok would`,
      `            # reset the full cadence window and suppress the very retry this`,
      `            # deferral exists to preserve.`,
      `            echo "reported=1" >> "$GITHUB_OUTPUT"`,
      `            curl -sG --max-time 30 -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
      `              --data-urlencode "job=${wf.job}" --data-urlencode "deferred=$1" \\`,
      `              "{{BACKEND_URL}}/api/cron/deploy-check" || true`,
      `            exit 0`,
      `          }`,
      `          fail() {`,
      `            echo "::error::${c.failPrefix} failed: $1 - check the run log above for details, or re-run the setup command from your DispatchSEO dashboard if this looks like an auth problem."`,
      `            curl -sG --max-time 30 -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
      `              --data-urlencode "job=${wf.job}" \\`,
      `              --data-urlencode "fail=$1" \\`,
      `              "{{BACKEND_URL}}/api/cron/deploy-check" || true`,
      `            exit 1`,
      `          }`,
      ``,
      ...c.successCommentLines.map((l) => (l ? `          # ${l}` : `          #`)),
      `          if [ "$AGENT_OUTCOME" = "success" ]; then`,
      `            built=$(gh pr list --repo "$GITHUB_REPOSITORY" --label ${c.prLabel} --state open --json number --jq 'length' 2>/dev/null || echo "?")`,
      `            if [ "$built" = "0" ]; then`,
      `              defer "${c.noPrDefer}"`,
      `            fi`,
      `            exit 0`,
      `          fi`,
      ``,
    );
    for (const a of AGENTS) {
      const branch = a.classifyBranch();
      if (branch) lines.push(branch, ``);
    }
    lines.push(`          fail "workflow failed - $RUN_URL"`);
    return lines.join("\n");
  }
  // basic
  lines.push(
    `      # Phone a FAILED outcome home with a classification: transient rate limit`,
    `      # (deferred - the job stays due and the backend re-dispatches) vs an`,
    `      # account that cannot run at all (loud failure naming the fix). A clean`,
    `      # success is reported by the step below instead.`,
    `      - name: Classify the outcome`,
    `        id: classify`,
  );
  if (wf.guardIf) lines.push(`        if: ${wf.guardIf}`);
  lines.push(`        env:`, `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`);
  for (const a of AGENTS) for (const l of a.basicClassifyEnv ?? []) lines.push(l);
  lines.push(
    `          AGENT: \${{ steps.agent.outputs.agent }}`,
    `          AGENT_OUTCOME: ${agentOutcomeExpr()}`,
    `          RUN_URL: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}`,
    `        run: |`,
    `          echo "agent_outcome=\${AGENT_OUTCOME:-}" >> "$GITHUB_OUTPUT"`,
    `          [ "$AGENT_OUTCOME" = "failure" ] || exit 0`,
    `          # From here this step owns the report; the flag stops the step below`,
    `          # writing a second (ok or generic-fail) row on top of this one.`,
    `          echo "reported=1" >> "$GITHUB_OUTPUT"`,
    `          defer() {`,
    `            echo "::notice::$1"`,
    `            curl -sG --max-time 30 -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
    `              --data-urlencode "job=${wf.job}" --data-urlencode "deferred=$1" \\`,
    `              "{{BACKEND_URL}}/api/cron/deploy-check" || true`,
    `            exit 0`,
    `          }`,
    `          fail() {`,
    `            echo "::error::$1"`,
    `            curl -sG --max-time 30 -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
    `              --data-urlencode "job=${wf.job}" \\`,
    `              --data-urlencode "fail=$1" \\`,
    `              "{{BACKEND_URL}}/api/cron/deploy-check" || true`,
    `            exit 1`,
    `          }`,
  );
  for (const a of AGENTS) {
    if (a.basicClassifyBranch) lines.push(a.basicClassifyBranch);
  }
  lines.push(`          fail "workflow failed - $RUN_URL"`);
  return lines.join("\n");
}

function composeRun(wf, prompt) {
  const r = wf.run;
  const continueOnError = r.continueOnError !== false;
  const parts = [open("run")];
  for (const a of AGENTS) {
    for (const s of a.configSteps({ guardIf: wf.guardIf, variant: r.variant })) parts.push(s);
  }
  for (const a of AGENTS) {
    const env = r.env[a.id];
    if (!env) throw new Error(`${wf.job}: workflows.mjs run.env has no entry for agent "${a.id}"`);
    parts.push(
      a.invokeStep({
        name: r.invokeName,
        guardIf: wf.guardIf,
        prompt,
        maxTurns: r.maxTurns,
        showFullOutput: r.showFullOutput,
        mcpConfig: r.mcpConfig,
        env,
        allowedBots: r.allowedBots ?? "*",
        allowedBotsCommentLines: r.allowedBotsCommentLines,
        continueOnError,
      }),
    );
  }
  if (r.artifact) {
    parts.push(
      [
        `      # Turn-by-turn detail for tuning the pipeline. The dashboard only ever`,
        `      # receives the aggregate outcome, which cannot answer the question that`,
        `      # actually matters for cost - WHICH pipeline steps burn the turns. This`,
        `      # step is what makes that measurable, since the agent run is ~98% of this`,
        `      # job's billed wall clock and wall clock is turns x per-turn latency.`,
        `      #`,
        `      # PRIVATE REPOS ONLY, and that condition is the point rather than`,
        `      # caution. Artifacts on a public repository are downloadable by anyone,`,
        `      # and this file is the agent's execution log - which is exactly why the`,
        `      # classify step below reads it instead of printing it ("these logs can be`,
        `      # public"). Publishing it as an artifact would undo that decision for the`,
        `      # public repos we specifically recommend to people avoiding Actions`,
        `      # charges. Short retention because this is a debugging aid, not a record.`,
        `      - name: Save the agent execution log for turn analysis`,
        `        if: always() && ${wf.guardIf ? `${wf.guardIf} && ` : ""}github.event.repository.private`,
        `        continue-on-error: true`,
        `        uses: actions/upload-artifact@v4`,
        `        with:`,
        `          name: agent-execution-log-\${{ github.run_id }}`,
        `          path: |`,
        ...AGENTS.map((a) => `            ${a.transcriptPath}`),
        `          retention-days: 7`,
        `          if-no-files-found: ignore`,
      ].join("\n"),
    );
  }
  if (r.classify) parts.push(composeClassify(wf));
  parts.push(close("run"));
  return parts.join("\n\n").replace(`${open("run")}\n\n`, `${open("run")}\n`).replace(`\n\n${close("run")}`, `\n${close("run")}`);
}

function composeLiveness() {
  const parts = [open("liveness")];
  for (const a of AGENTS) parts.push(a.livenessStep());
  parts.push(close("liveness"));
  return parts.join("\n\n").replace(`${open("liveness")}\n\n`, `${open("liveness")}\n`).replace(`\n\n${close("liveness")}`, `\n${close("liveness")}`);
}

function composeFailureReport(wf) {
  return [
    open("failure-report"),
    `      # Surface the real API error (revoked? usage limit?) and phone it home.`,
    `      # Full transcripts stay hidden - only the final result line is read.`,
    `      - name: Report token failure with the reason`,
    `        if: failure()`,
    `        env:`,
    `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
    `          AGENT: \${{ steps.agent.outputs.agent }}`,
    `        run: |`,
    `          reason="credential check failed (no error detail captured)"`,
    `          fix="re-run the setup command from your DispatchSEO dashboard"`,
    ...agentShellChain((a) => a.livenessFailureSnippet),
    `          echo "::error::$reason - $fix."`,
    `          curl -sG --max-time 30 -H "Authorization: Bearer $SEO_MCP_API_KEY" \\`,
    `            --data-urlencode "job=${wf.job}" \\`,
    `            --data-urlencode "fail=$reason - $fix" \\`,
    `            "{{BACKEND_URL}}/api/cron/deploy-check" || true`,
    close("failure-report"),
  ].join("\n");
}

// ---- splicing ---------------------------------------------------------------
function isComment(l) {
  return /^      #/.test(l);
}

// Replace a marked region, or bootstrap it from the legacy anchor-bounded one.
function splice(lines, name, block, { anchor, nextAnchor, endLiteral }) {
  const openIdx = lines.findIndex((l) => l.startsWith(`      # >>> agent-steps: ${name}`));
  if (openIdx !== -1) {
    const closeIdx = lines.findIndex((l) => l.startsWith(`      # <<< agent-steps: ${name}`));
    if (closeIdx === -1) throw new Error(`unclosed agent-steps region '${name}'`);
    return [...lines.slice(0, openIdx), ...block.split("\n"), ...lines.slice(closeIdx + 1)];
  }
  // bootstrap
  let start = lines.findIndex((l) => l === `      - name: ${anchor}`);
  if (start === -1) throw new Error(`bootstrap anchor step '${anchor}' not found`);
  while (start > 0 && isComment(lines[start - 1])) start--;
  let end;
  if (endLiteral) {
    end = lines.findIndex((l) => l.startsWith(endLiteral));
    if (end === -1) throw new Error(`bootstrap end literal '${endLiteral}' not found`);
  } else {
    end = lines.findIndex((l, i) => i > start && l === `      - name: ${nextAnchor}`);
    if (end === -1) throw new Error(`bootstrap next anchor '${nextAnchor}' not found`);
    while (end > start && isComment(lines[end - 1])) end--;
  }
  while (end > start && lines[end - 1] === "") end--;
  return [...lines.slice(0, start), ...block.split("\n"), "", ...lines.slice(end)];
}

// ---- main -------------------------------------------------------------------
let promptsDirty = false;
let drift = 0;

for (const [file, wf] of Object.entries(WORKFLOWS)) {
  const path = join(WF_DIR, file);
  const original = readFileSync(path, "utf8");
  let lines = original.split("\n");

  // Bootstrap the prompt store from the legacy files the first time through.
  if (wf.run && !(file in prompts)) {
    const p = extractPrompt(lines, wf.run.invokeName);
    if (!p) throw new Error(`${file}: could not extract the '${wf.run.invokeName}' prompt for bootstrap`);
    prompts[file] = p;
    promptsDirty = true;
    const codexPrompt = extractPrompt(lines, `${wf.run.invokeName} (Codex)`);
    if (codexPrompt) {
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      const stripped = codexPrompt.replace(/^ENVIRONMENT RULE[^]*?is a failed run\.\s*/, "");
      if (norm(stripped) !== norm(p)) {
        console.warn(`⚠ ${file}: the Codex prompt was not preamble+claude-prompt; the Claude text now serves both. Diff the file to confirm that is right.`);
      }
    }
  }

  lines = splice(lines, "resolve", composeResolve(wf), {
    anchor: "Resolve the coding agent",
    nextAnchor: wf.liveness
      ? "Claude token liveness"
      : wf.resolve.variant === "vars"
        ? "Detect this repo's package manager"
        : "Preflight - seo-manager MCP reachable",
  });

  if (wf.run) {
    lines = splice(lines, "run", composeRun(wf, prompts[file]), {
      anchor: "Write Codex's MCP config",
      nextAnchor: "Report outcome to the dashboard",
      endLiteral: wf.run.endAnchor,
    });
  }

  if (wf.liveness) {
    lines = splice(lines, "liveness", composeLiveness(), {
      anchor: "Claude token liveness",
      nextAnchor: "Report token OK",
    });
    lines = splice(lines, "failure-report", composeFailureReport(wf), {
      anchor: "Report token failure with the reason",
      nextAnchor: "Pipeline update check",
    });
  }

  const next = lines.join("\n");
  if (next !== original) {
    if (CHECK) {
      console.error(`✗ ${file} is stale relative to scripts/agent-ci/ - run the generator and commit the result`);
      drift++;
    } else {
      writeFileSync(path, next);
      console.log(`regenerated ${file}`);
    }
  } else {
    console.log(`unchanged ${file}`);
  }
}

if (promptsDirty) {
  if (CHECK) {
    console.error(`✗ scripts/agent-ci/prompts.json is missing prompts - run the generator and commit it`);
    drift++;
  } else {
    writeFileSync(PROMPTS_PATH, JSON.stringify(prompts, null, 2) + "\n");
    console.log("wrote scripts/agent-ci/prompts.json");
  }
}

if (drift) process.exit(1);
console.log("agent-steps: all workflows in sync with scripts/agent-ci/.");

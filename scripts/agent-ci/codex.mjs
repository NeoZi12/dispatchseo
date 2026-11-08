// Codex's CI knowledge - the per-agent module for OpenAI Codex. Same contract
// as claude.mjs; see that file's header and scripts/agent-ci/index.mjs.
//
// Every fact below is measured, not assumed - see docs-private/CODEX_FACTS.md
// for the runs behind the sandbox/approval/config findings, and the classify
// branch's comments for why 429 handling asks the API instead of the text.

const id = "codex";

const resolveEnvName = "OPENAI_API_KEY";
const secretName = "OPENAI_API_KEY";

function resolveCaseArm(variant) {
  const verb = variant === "validate" ? "validates" : "builds";
  return `            codex)
              if [ -z "$OPENAI_API_KEY" ]; then
                echo "::error::This project ${verb} with Codex, but the OPENAI_API_KEY secret is missing or empty on this repo. Add it with 'gh secret set OPENAI_API_KEY', or rerun the setup command from your DispatchSEO dashboard."
                exit 1
              fi
              case "$OPENAI_API_KEY" in
                sk-*) : ;;
                *)
                  echo "::error::OPENAI_API_KEY does not look like an OpenAI key (expected it to start with sk-). It was probably line-wrapped or the wrong text was pasted when it was saved. Create a fresh key at platform.openai.com/api-keys and set it again."
                  exit 1 ;;
              esac ;;`;
}

// The unattended-environment preamble prepended to every Codex prompt. Codex
// has no apply_patch tool on a runner and nobody to answer an approval
// question, and an unquoted heredoc is what expands backticks and corrupts
// MDX/TSX files - both burned real runs before this wording existed.
const promptPreamble =
  "ENVIRONMENT RULE (read first, it overrides habit): you have no apply_patch tool here - only the shell, and you are running UNATTENDED, so there is nobody to answer a question. Write every file with a SINGLE-QUOTED heredoc (cat > path <<'DSEOF' ... DSEOF) or with python3 reading the content from stdin. The quoted delimiter is the whole point: bash expands NOTHING inside it, so the backticks and $ in MDX and TSX survive verbatim. NEVER use an unquoted heredoc, printf or echo to write file content - an unquoted heredoc is what expands backticks and corrupts the file. Pick a delimiter that cannot appear in the content. Verify every write with ls -l and head before moving on, and never let a filename come from an unset shell variable. If you ever find yourself about to ask for approval or a go/no-go, do not: pick the safest option that still completes the task, do it, and say what you chose in the final report. A run that stops to ask a question builds nothing and is a failed run.";

// Codex reads its MCP servers from a config.toml inside its own home
// directory, so a config-write step precedes the invoke. Two variants:
// the builders copy .github/mcp-codex.toml and render the DataForSEO
// credential tokens; the tool validator writes a secrets-free playwright-only
// config inline.
function configSteps({ guardIf, variant }) {
  const cond = [guardIf, `steps.agent.outputs.agent == '${id}'`].filter(Boolean).join(" && ");
  if (variant === "validate") {
    return [
      `      # Codex's twin of mcp-validate.json. Written here rather than shipped as a
      # file because this job's MCP surface is one stdio server with no secrets
      # in it - there is nothing to personalize per project, so a file would be
      # a second thing to keep in sync for no benefit.
      - name: Write Codex's MCP config
        if: ${cond}
        run: |
          mkdir -p "$RUNNER_TEMP/codex-home"
          cat > "$RUNNER_TEMP/codex-home/config.toml" <<'TOML'
          [mcp_servers.playwright]
          command = "npx"
          args = ["-y", "@playwright/mcp@0.0.84", "--headless", "--isolated"]
          # Nobody is here to approve a tool call on a scheduled runner, and
          # without this every call comes back "user cancelled MCP tool call".
          default_tools_approval_mode = "approve"

          [sandbox_workspace_write]
          # The validator drives a real browser against the repo's own local
          # server, whose port came from .dispatchseo/serve.
          network_access = true
          TOML`,
    ];
  }
  return [
    `      # Codex reads its MCP servers from a config.toml inside its own home
      # directory. Two things here are easy to get wrong and both are silent:
      #
      # 1. The action does NOT honour an inbound CODEX_HOME env var - it takes a
      #    \`codex-home\` INPUT and sets the env itself. Writing a config to a
      #    hand-rolled $CODEX_HOME and hoping is a no-op, and the failure looks
      #    like an agent with no tools rather than an error.
      # 2. \`sandbox: workspace-write\` blocks network by default, which kills MCP
      #    over HTTP. The network_access line below is what makes the sandboxed
      #    posture usable at all.
      - name: Write Codex's MCP config
        if: ${cond}
        env:
          DATAFORSEO_LOGIN: \${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: \${{ secrets.DATAFORSEO_PASSWORD }}
        run: |
          mkdir -p "$RUNNER_TEMP/codex-home"
          cp .github/mcp-codex.toml "$RUNNER_TEMP/codex-home/config.toml"
          cat >> "$RUNNER_TEMP/codex-home/config.toml" <<'TOML'

          [sandbox_workspace_write]
          network_access = true
          TOML
          # Render the DataForSEO credential tokens. Codex's TOML \`env\` map is
          # LITERAL - it does not expand \${VAR} the way Claude expands its JSON
          # config - so left alone the dataforseo server would authenticate as
          # the literal string "\${DATAFORSEO_LOGIN}" and every keyword call
          # would 401 mid-build. python3 rather than sed so no credential
          # character can break the substitution; values are TOML-escaped. A
          # truncated config (free-mode project, no dataforseo section) makes
          # this a no-op.
          python3 - "$RUNNER_TEMP/codex-home/config.toml" <<'PY'
          import os, sys
          path = sys.argv[1]
          text = open(path).read()
          for token, var in (("\${DATAFORSEO_LOGIN}", "DATAFORSEO_LOGIN"),
                             ("\${DATAFORSEO_PASSWORD}", "DATAFORSEO_PASSWORD")):
              val = os.environ.get(var, "").replace("\\\\", "\\\\\\\\").replace('"', '\\\\"')
              text = text.replace(token, val)
          open(path, "w").write(text)
          PY
          echo "Codex home prepared. Servers configured:"
          grep -E '^\\[mcp_servers\\.' "$RUNNER_TEMP/codex-home/config.toml"`,
  ];
}

const ENV_LINES = {
  seoKey: `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
  dataforseo: `          DATAFORSEO_LOGIN: \${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: \${{ secrets.DATAFORSEO_PASSWORD }}`,
  githubToken: `          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  ghToken: `          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  ghTokenCommented: `          # This workflow's prompt names $GITHUB_TOKEN explicitly. Claude gets
          # it from the action's github_token: input; the Codex action has no
          # such input, so it has to be set here or the agent reads an empty
          # variable at the exact moment it tries to commit.
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  placeholders: `          NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co"
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key"
          NEXT_PUBLIC_SITE_URL: "https://{{DOMAIN}}"`,
  prNumber: `          PR_NUMBER: \${{ github.event.pull_request.number || inputs.pr_number }}`,
};

function invokeStep({ name, guardIf, prompt, env, continueOnError }) {
  const lines = [];
  lines.push(`      # The Codex twin. Same task prompt, generated from the same source -`);
  lines.push(`      # the agent's behaviour must not depend on which one is holding the`);
  lines.push(`      # playbook - plus the unattended-environment preamble above it.`);
  lines.push(`      #`);
  lines.push(`      # Model: gpt-5 by default, overridable with a repo variable because model`);
  lines.push(`      # availability is per-account, not universal - \`gpt-5-codex\` 404s on a`);
  lines.push(`      # pay-as-you-go project key even though it appears in GET /v1/models. Set`);
  lines.push(`      # SEO_CODEX_MODEL in the repo's Actions variables to change it without`);
  lines.push(`      # touching this file.`);
  lines.push(`      #`);
  lines.push(`      # There is NO turn budget to set. Codex has no --max-turns equivalent and`);
  lines.push(`      # OpenAI closed the request for one as not-planned, so the job's`);
  lines.push(`      # timeout-minutes is the only ceiling on a runaway run.`);
  lines.push(`      - name: ${name} (Codex)`);
  const cond = [guardIf, `steps.agent.outputs.agent == '${id}'`].filter(Boolean).join(" && ");
  lines.push(`        if: ${cond}`);
  lines.push(`        id: ${id}`);
  if (continueOnError) {
    lines.push(`        # Never fail the job at this step: the classify step below reads the`);
    lines.push(`        # outcome and decides what the run MEANS (transient rate limit vs dead`);
    lines.push(`        # account), which it can only do if it is reachable.`);
    lines.push(`        continue-on-error: true`);
  }
  lines.push(`        uses: openai/codex-action@bdf19a4a223ec2549a3e2274a0cf61556bc07675 # v1`);
  lines.push(`        with:`);
  lines.push(`          openai-api-key: \${{ secrets.OPENAI_API_KEY }}`);
  lines.push(`          # Same rule as the Claude twin's allowed_bots: this workflow is fired`);
  lines.push(`          # by a bot actor (the DispatchSEO GitHub App, a schedule, or a`);
  lines.push(`          # GITHUB_TOKEN dispatch). codex-action's actor gate rejects EVERY bot`);
  lines.push(`          # by default (a bot 404s the collaborator-permission lookup), so`);
  lines.push(`          # without this line each unattended Codex run dies before Codex is`);
  lines.push(`          # even installed - while a manual workflow_dispatch passes, which is`);
  lines.push(`          # what hides the failure. Every trigger that can reach this step`);
  lines.push(`          # already required repo write access, so allowing all actors adds`);
  lines.push(`          # nothing an attacker can use.`);
  lines.push(`          allow-users: "*"`);
  lines.push(`          model: \${{ vars.SEO_CODEX_MODEL || 'gpt-5' }}`);
  lines.push(`          codex-home: \${{ runner.temp }}/codex-home`);
  lines.push(`          sandbox: workspace-write`);
  lines.push(`          # Strips sudo from the runner user for the rest of the job. Safe here:`);
  lines.push(`          # everything after this step is curl. It is also more than the Claude`);
  lines.push(`          # half of this pipeline does, which runs with bypassPermissions and no`);
  lines.push(`          # sandbox at all.`);
  lines.push(`          safety-strategy: drop-sudo`);
  lines.push(`          output-file: \${{ runner.temp }}/codex-out.txt`);
  lines.push(`          prompt: |`);
  const full = `${promptPreamble}\n\n${prompt}`;
  for (const l of full.split("\n")) lines.push(l ? `            ${l}` : "");
  lines.push(`        env:`);
  for (const key of env) lines.push(ENV_LINES[key]);
  return lines.join("\n");
}

const transcriptPath = `\${{ runner.temp }}/codex-out.txt`;

// Codex hands back a single final message (or the output file).
const classifyMsgExtraction = `            msg="$CODEX_MSG"
            [ -n "$msg" ] || msg=$(cat "$RUNNER_TEMP/codex-out.txt" 2>/dev/null)`;

// Extra env the full classify step needs for this agent.
const classifyEnv = [
  `          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}`,
  `          CODEX_MSG: \${{ steps.codex.outputs.final-message }}`,
];

// Classify: what a non-success outcome MEANS for Codex.
//
// Do NOT decide this from the text. Codex collapses every 429 into one message
// - "exceeded retry limit, last status: 429 Too Many Requests" - so grepping it
// the way the Claude branch greps its transcript would read an unfunded,
// permanently dead account as a quiet deferral. The builder would then report
// green every night while building nothing, which is the single failure mode
// this pipeline is least able to afford. So on anything 429-shaped, ask OpenAI
// directly and branch on error.code, which is authoritative and unaffected by
// wording changes. One tiny metered call, fractions of a cent.
function classifyBranch() {
  return `          if [ "$AGENT" = "codex" ]; then
            # Never decided from the text: Codex collapses every 429 into one
            # message, so on anything 429-shaped the step asks OpenAI directly
            # and branches on error.code - authoritative, and unaffected by
            # wording changes. One tiny metered call, fractions of a cent.
            if ! echo "$msg" | grep -qiE '429|too many requests|exceeded retry limit|usage limit|rate.?limit'; then
              reason="workflow failed (no error detail captured - an empty message usually means the job hit its time limit)"
              [ -n "$msg" ] && reason=$(printf '%s' "$msg" | tail -c 400)
              fail "$reason"
            fi
            probe=$(curl -s --max-time 30 -o /tmp/probe.json -w "%{http_code}" https://api.openai.com/v1/responses \\
              -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \\
              -d '{"model":"gpt-5-mini","input":"ok","max_output_tokens":16}') || probe=000
            err=$(jq -r '.error.code // empty' /tmp/probe.json 2>/dev/null)
            case "$probe:$err" in
              2*:*)
                # The key works now, so whatever 429 hit mid-run has cleared.
                defer "Codex hit a transient rate limit this run - the key tests healthy now, so the dashboard keeps this build due and re-dispatches it within a few hours. Not a failure." ;;
              429:rate_limit_exceeded)
                defer "Codex is rate-limited right now - the dashboard keeps this build due and re-dispatches it within a few hours. Not a failure." ;;
              429:*|402:*)
                # Every other 429 is a billing state: credit_balance_exhausted,
                # insufficient_quota, or an org/project spend or usage cap. None
                # of them clear by waiting, so none of them may report green.
                fail "your OpenAI account cannot run builds right now (OpenAI said: \${err:-quota exceeded}). This does not fix itself by retrying - add credit or raise the limit at platform.openai.com/settings/organization/billing, then re-run this workflow." ;;
              401:*|403:*)
                fail "OpenAI rejected the OPENAI_API_KEY secret on this repo (HTTP $probe). The key was probably revoked or rotated - create a new one at platform.openai.com/api-keys and set it again with 'gh secret set OPENAI_API_KEY'." ;;
              *)
                fail "Codex failed and OpenAI could not be reached to find out why (probe HTTP $probe). Last message: $(printf '%s' "$msg" | tail -c 300)" ;;
            esac
          fi`;
}

// The lean classify's Codex branch (non-builder workflows): same probe, folded
// wording, no message extraction beforehand.
const basicClassifyBranch = `          if [ "$AGENT" = "codex" ]; then
            probe=$(curl -s --max-time 30 -o /tmp/probe.json -w "%{http_code}" https://api.openai.com/v1/responses \\
              -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \\
              -d '{"model":"gpt-5-mini","input":"ok","max_output_tokens":16}') || probe=000
            err=$(jq -r '.error.code // empty' /tmp/probe.json 2>/dev/null)
            case "$probe:$err" in
              2*:*|429:rate_limit_exceeded)
                defer "Codex hit a rate limit this run - it clears by itself, so the job stays due and is retried automatically. Not a failure." ;;
              429:*|402:*)
                fail "your OpenAI account cannot run builds right now (OpenAI said: \${err:-quota exceeded}). This does not fix itself by retrying - add credit or raise the limit at platform.openai.com/settings/organization/billing." ;;
              401:*|403:*)
                fail "OpenAI rejected the OPENAI_API_KEY secret on this repo (HTTP $probe). The key was probably revoked or rotated - create a new one at platform.openai.com/api-keys and set it again with 'gh secret set OPENAI_API_KEY'." ;;
              *)
                fail "workflow failed - $RUN_URL" ;;
            esac
          fi`;

// Extra env the basic classify needs.
const basicClassifyEnv = [`          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}`];

// token-check: an OpenAI key's health is a property OpenAI will state
// outright, so liveness is a direct API call rather than a Codex run - it
// costs less, finishes faster, and carries error.code, which distinguishes
// "rate-limited for a minute" from "this account is out of credit".
function livenessStep() {
  return `      # Codex's liveness is a direct API call rather than a Codex run, and that
      # is deliberate. A Claude OAuth token can only be proven by using it, so
      # that branch spends a model call. An OpenAI key's health is a property
      # OpenAI will state outright - and its answer carries \`error.code\`, which
      # distinguishes "rate-limited for a minute" from "this account is out of
      # credit". Running the whole action here would cost more, take longer, and
      # tell us LESS, because the CLI collapses every 429 into one message.
      - name: Codex key liveness
        id: liveness_codex
        if: steps.agent.outputs.agent == 'codex'
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
        run: |
          if [ -z "$OPENAI_API_KEY" ]; then
            echo "This project builds with Codex, but the OPENAI_API_KEY secret is missing or empty on this repo. Add it with 'gh secret set OPENAI_API_KEY', or re-run the setup command from your DispatchSEO dashboard." > "$RUNNER_TEMP/agent-failure.txt"
            cat "$RUNNER_TEMP/agent-failure.txt"; exit 1
          fi
          code=$(curl -s --max-time 30 -o /tmp/live.json -w "%{http_code}" https://api.openai.com/v1/responses \\
            -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \\
            -d '{"model":"gpt-5-mini","input":"ok","max_output_tokens":16}') || code=000
          err=$(jq -r '.error.code // empty' /tmp/live.json 2>/dev/null)
          case "$code:$err" in
            2*:*) echo "OpenAI key is live." ; exit 0 ;;
            429:rate_limit_exceeded)
              # Transient by definition. A health check that goes red on a
              # momentary rate limit trains people to ignore the banner.
              echo "OpenAI is rate-limiting this key right now - that clears by itself, so treating it as healthy." ; exit 0 ;;
            429:*|402:*)
              echo "your OpenAI account cannot run builds (OpenAI said: \${err:-quota exceeded}). Retrying will not fix this - add credit or raise the limit at platform.openai.com/settings/organization/billing." > "$RUNNER_TEMP/agent-failure.txt" ;;
            401:*|403:*)
              echo "OpenAI rejected the OPENAI_API_KEY secret on this repo (HTTP $code). The key was probably revoked or rotated - create a new one at platform.openai.com/api-keys and set it again with 'gh secret set OPENAI_API_KEY'." > "$RUNNER_TEMP/agent-failure.txt" ;;
            *)
              echo "could not reach OpenAI to check the key (HTTP $code)." > "$RUNNER_TEMP/agent-failure.txt" ;;
          esac
          cat "$RUNNER_TEMP/agent-failure.txt"; exit 1`;
}

const livenessFailureSnippet = `            # The Codex branch already resolved OpenAI's own error code into a
            # sentence naming the actual fix, so pass that through rather than
            # flattening it back into a generic message.
            msg=$(cat "$RUNNER_TEMP/agent-failure.txt" 2>/dev/null)
            [ -n "$msg" ] && reason="Codex credential check failed: $msg"`;

export default {
  id,
  isDefault: false,
  secretName,
  resolveEnvName,
  resolveCaseArm,
  promptPreamble,
  configSteps,
  invokeStep,
  transcriptPath,
  classifyMsgExtraction,
  classifyEnv,
  classifyBranch,
  basicClassifyBranch,
  basicClassifyEnv,
  livenessStep,
  livenessFailureSnippet,
};

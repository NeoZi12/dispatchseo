// Claude Code's CI knowledge - everything the pipeline workflows need to know
// about running Claude Code unattended on a GitHub Actions runner.
//
// This file is one of the per-agent modules under scripts/agent-ci/. Together
// with workflows.mjs (per-workflow parameters) and prompts.json (the task
// prompts), scripts/generate-agent-steps.mjs composes these into the agent
// blocks of every templates/pipeline workflow, between `>>> agent-steps`
// markers. NEVER edit those blocks in the workflow files - edit here and run
// `node --experimental-strip-types scripts/generate-agent-steps.mjs`.
//
// Adding a new agent = a new module in this directory implementing the same
// shape (see index.mjs for the contract), a matching entry in
// src/lib/agents/index.ts, and a regenerate. The workflows themselves never
// need editing again.

const id = "claude";

// The env name the resolve step reads the secret into. Deliberately NOT the
// secret's own name: the resolve script tests "$CLAUDE_TOKEN" and the name
// predates the registry - keep it stable so resolve scripts stay byte-familiar.
const resolveEnvName = "CLAUDE_TOKEN";
const secretName = "CLAUDE_CODE_OAUTH_TOKEN";

// Subscription-first, API-key fallback. CLAUDE_CODE_OAUTH_TOKEN stays the
// blessed path (runs on the plan the owner already pays for); ANTHROPIC_API_KEY
// is the metered escape hatch for accounts Anthropic's subscription gate
// refuses outright - oauth_org_not_allowed, a server-side flag on the ACCOUNT
// that a freshly minted token provably cannot clear (widely-duplicated
// claude-code issue since 2026-05; hit a paying customer on 2026-08-04).
// Precedence is deliberate: when both secrets exist the subscription token
// wins, so adding a key can never silently move a working install onto
// per-token billing - switching means deleting the dead token, and every error
// message that names the key path says exactly that.
const apiKeySecretName = "ANTHROPIC_API_KEY";
const extraResolveEnv = [{ envName: apiKeySecretName, secretName: apiKeySecretName }];

// Per-workflow wording for the resolve step's credential errors. The setup
// workflow cannot say "rerun the setup command" (that IS the setup command),
// and the validator says "validates" rather than "builds".
function resolveCaseArm(variant) {
  const verb = variant === "validate" ? "validates" : "builds";
  const missingFix =
    variant === "setup"
      ? "Reconnect Claude Code from your DispatchSEO dashboard (Settings), or set one by hand: run 'claude setup-token', then pipe the token into 'gh secret set CLAUDE_CODE_OAUTH_TOKEN' without any whitespace."
      : "Rerun the setup command from your DispatchSEO dashboard (it mints and VERIFIES a fresh token), or set one by hand: run 'claude setup-token', then pipe the token into 'gh secret set CLAUDE_CODE_OAUTH_TOKEN' without any whitespace.";
  const shapeFix =
    variant === "setup"
      ? "Reconnect Claude Code from your DispatchSEO dashboard to store a verified replacement."
      : "Rerun the setup command from your DispatchSEO dashboard to mint and verify a replacement.";
  return `            claude)
              if [ -z "$CLAUDE_TOKEN" ] && [ -n "$ANTHROPIC_API_KEY" ]; then
                echo "No CLAUDE_CODE_OAUTH_TOKEN on this repo - running Claude on the ANTHROPIC_API_KEY secret instead (metered API billing on your Anthropic account)."
              elif [ -z "$CLAUDE_TOKEN" ]; then
                echo "::error::This project ${verb} with Claude Code, but the CLAUDE_CODE_OAUTH_TOKEN secret is missing or empty on this repo (and there is no ANTHROPIC_API_KEY secret to fall back on). ${missingFix} Or run on metered API billing instead: create a key at console.anthropic.com and pipe it into 'gh secret set ANTHROPIC_API_KEY'."
                exit 1
              else
                case "$CLAUDE_TOKEN" in
                  sk-ant-oat*) : ;;
                  *)
                    echo "::error::CLAUDE_CODE_OAUTH_TOKEN does not look like a Claude Code OAuth token (expected it to start with sk-ant-oat). It was probably line-wrapped or the wrong text was pasted when it was saved. ${shapeFix}"
                    exit 1 ;;
                esac
                if [ -n "$ANTHROPIC_API_KEY" ]; then
                  echo "Both CLAUDE_CODE_OAUTH_TOKEN and ANTHROPIC_API_KEY are set - the subscription token takes precedence. To run on the API key instead: gh secret delete CLAUDE_CODE_OAUTH_TOKEN."
                fi
              fi ;;`;
}

// Claude needs no config file written at run time: claude-code-action reads
// .github/mcp-ci.json (or mcp-validate.json) directly via --mcp-config, and
// that JSON expands \${VAR} env references itself.
function configSteps() {
  return [];
}

// Named env line snippets the invoke step can carry, in the exact text the
// workflows have always shipped. workflows.mjs picks per workflow.
const ENV_LINES = {
  agentToken: `          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN == '' && secrets.ANTHROPIC_API_KEY || '' }}`,
  seoKey: `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
  dataforseo: `          DATAFORSEO_LOGIN: \${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: \${{ secrets.DATAFORSEO_PASSWORD }}`,
  githubToken: `          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  ghToken: `          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  mcpTimeout: `          MCP_TIMEOUT: "120000"`,
  placeholders: `          # Placeholder public env so \`next build\` never trips on missing vars -
          # static blog pages do not call Supabase, and the clients are lazy.
          NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co"
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key"
          NEXT_PUBLIC_SITE_URL: "https://{{DOMAIN}}"`,
  prNumber: `          PR_NUMBER: \${{ github.event.pull_request.number || inputs.pr_number }}`,
};

// The invoke step. `prompt` arrives as plain text paragraphs; it is emitted as
// a YAML block scalar so backticks, quotes and \${{ }} expressions all survive
// verbatim and both agents provably receive the same task text.
function invokeStep({ name, guardIf, prompt, maxTurns, showFullOutput, mcpConfig, env, allowedBots, allowedBotsCommentLines, continueOnError }) {
  const lines = [];
  lines.push(`      - name: ${name}`);
  const cond = [guardIf, `steps.agent.outputs.agent == '${id}'`].filter(Boolean).join(" && ");
  lines.push(`        if: ${cond}`);
  lines.push(`        id: ${id}`);
  if (continueOnError) {
    lines.push(`        # Never fail the job at this step: the classify step below reads the`);
    lines.push(`        # outcome and decides what the run MEANS (transient rate limit vs dead`);
    lines.push(`        # account), which it can only do if it is reachable.`);
    lines.push(`        continue-on-error: true`);
  }
  lines.push(`        uses: anthropics/claude-code-action@61a9c274fa7110a66dfafc1bbbced03833eb25fe # v1`);
  lines.push(`        with:`);
  if (allowedBotsCommentLines) {
    for (const l of allowedBotsCommentLines) lines.push(`          # ${l}`);
  } else {
    lines.push(`          # Cloud fires this as the DispatchSEO GitHub App (a Bot actor), and the App also authored the workflow commits, so scheduled runs are bot-actored too. Every trigger here needs repo write access, so allowing bots is safe; without this claude-code-action aborts with "non-human actor".`);
  }
  lines.push(`          allowed_bots: "${allowedBots}"`);
  lines.push(`          # Subscription token first; the metered ANTHROPIC_API_KEY only reaches`);
  lines.push(`          # the action when no subscription token exists, so adding a key never`);
  lines.push(`          # silently switches a working subscription install to per-token billing.`);
  lines.push(`          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`);
  lines.push(`          anthropic_api_key: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN == '' && secrets.ANTHROPIC_API_KEY || '' }}`);
  lines.push(`          # Pass the standard workflow token as an input so the action uses it`);
  lines.push(`          # directly instead of exchanging OIDC for a Claude GitHub App token`);
  lines.push(`          # (which would require installing the app on the repo).`);
  lines.push(`          github_token: \${{ secrets.GITHUB_TOKEN }}`);
  if (showFullOutput) {
    lines.push(`          # Full transcript in the step log - post-hoc debuggability.`);
    lines.push(`          show_full_output: true`);
  }
  lines.push(`          prompt: |`);
  for (const l of prompt.split("\n")) lines.push(l ? `            ${l}` : "");
  lines.push(`          claude_args: |`);
  lines.push(`            --mcp-config ${mcpConfig}`);
  lines.push(`            --permission-mode bypassPermissions`);
  lines.push(`            --max-turns ${maxTurns}`);
  lines.push(`        env:`);
  for (const key of env) lines.push(ENV_LINES[key]);
  return lines.join("\n");
}

// Where the run's transcript lands, for the private-repo artifact step.
const transcriptPath = `\${{ runner.temp }}/claude-execution-output.json`;

// Classify: how to pull Claude's final message out of what the action left
// behind. The action hides the transcript (these logs can be public) and
// writes an execution log instead.
const classifyMsgExtraction = `            f="$RUNNER_TEMP/claude-execution-output.json"
            if [ -f "$f" ]; then
              msg=$(jq -r 'if type=="array" then .[] else . end
                           | select(.type? == "result")
                           | (.result // .error // empty)' "$f" 2>/dev/null | tail -1)
            fi`;

// Classify: what a non-success outcome MEANS for Claude. A subscription usage
// limit is a deferral, not a failure - and the wording list is pinned to
// cron-alerts.ts's CUSTOMER_ACTIONABLE by scripts/pipeline-pack-lint.mjs, so
// the two copies of that fact cannot drift apart again (2026-08-02).
function classifyBranch() {
  return `          if [ "$AGENT" = "claude" ]; then
            # A subscription usage limit is a deferral, not a failure: the
            # backend keeps the job due and re-dispatches it within hours.
            #
            # Match every wording the subscription actually emits, not just the
            # one we thought of. "You've hit your session limit · resets 1:50pm
            # (UTC)" contains none of usage-limit/limit-reached/rate-limit, so
            # it fell through to fail() - turning "come back in an hour" into a
            # red banner and an alert email, and leaving the build to sit
            # in_progress until the stuck-build sweep freed it hours later.
            # cron-alerts.ts (CUSTOMER_ACTIONABLE) already knew the phrase; this
            # copy is the one that decides defer-vs-fail, so keep them in step -
            # pipeline-pack-lint.mjs fails the build if this drifts again.
            if echo "$msg" | grep -qiE 'session limit|usage limit|limit reached|limit .*resets|rate.?limit'; then
              defer "Claude hit a usage limit this run - the dashboard keeps this build due and re-dispatches it within a few hours. Not a failure."
            fi
            # oauth_org_not_allowed: Anthropic flags the ACCOUNT, not the token,
            # so the generic "re-run setup" advice below would send the owner to
            # re-mint a token that comes back just as blocked. Name the real
            # ways out instead.
            if echo "$msg" | grep -qi 'disabled Claude subscription access'; then
              fail "$msg. A fresh token will NOT fix this - Anthropic has flagged the Claude account itself (oauth_org_not_allowed). On a company Claude plan, ask its admin to enable Claude Code; on a personal plan, check claude.ai billing for a lapsed or duplicate subscription or contact Anthropic support. Or switch the builders to metered API billing: create a key at console.anthropic.com, 'gh secret set ANTHROPIC_API_KEY', then 'gh secret delete CLAUDE_CODE_OAUTH_TOKEN'"
            fi
            reason="workflow failed (no error detail captured)"
            [ -n "$msg" ] && reason="$msg"
            fail "$reason"
          fi`;
}

// The lean classify's Claude branch (non-builder workflows). This was null -
// "keeps its existing loud path, deliberately" - until 2026-08-05/06, when a
// customer's org-flagged Claude account (oauth_org_not_allowed) failed their
// geo scan and the report said, in full, "workflow failed - <run url>": a link
// into a private repo log the operator cannot open, a banner line the owner
// cannot act on, and no customer email at all (the generic wording matches no
// CUSTOMER_ACTIONABLE rule) - while the builder workflows named the same
// failure precisely. Same extraction and same defer/fail meanings as the full
// classifyBranch above, minus the built-a-PR bookkeeping these jobs don't have.
const basicClassifyBranch = `          if [ "$AGENT" = "claude" ]; then
            msg=""
            f="$RUNNER_TEMP/claude-execution-output.json"
            if [ -f "$f" ]; then
              msg=$(jq -r 'if type=="array" then .[] else . end
                           | select(.type? == "result")
                           | (.result // .error // empty)' "$f" 2>/dev/null | tail -1)
            fi
            if echo "$msg" | grep -qiE 'session limit|usage limit|limit reached|limit .*resets|rate.?limit'; then
              defer "Claude hit a usage limit this run - it clears by itself, so the job stays due and is retried automatically. Not a failure."
            fi
            # oauth_org_not_allowed: Anthropic flags the ACCOUNT, not the token,
            # so "re-run setup" advice would send the owner to re-mint a token
            # that comes back just as blocked. Name the real ways out instead.
            if echo "$msg" | grep -qi 'disabled Claude subscription access'; then
              fail "$msg. A fresh token will NOT fix this - Anthropic has flagged the Claude account itself (oauth_org_not_allowed). On a company Claude plan, ask its admin to enable Claude Code; on a personal plan, check claude.ai billing for a lapsed or duplicate subscription or contact Anthropic support. Or switch the builders to metered API billing: create a key at console.anthropic.com, 'gh secret set ANTHROPIC_API_KEY', then 'gh secret delete CLAUDE_CODE_OAUTH_TOKEN'"
            fi
            # No message at all (the action died before writing its execution
            # log) falls through to the generic run-URL report below.
            [ -n "$msg" ] && fail "$(printf '%s' "$msg" | tail -c 400)"
          fi`;

// token-check: a Claude credential can only be proven by using it, so
// liveness is one minimal model call - on whichever credential the repo
// actually builds with (subscription token first, ANTHROPIC_API_KEY fallback,
// same precedence as the builders - a health check that proves the OTHER
// credential reports green while the one that builds is dead).
function livenessStep() {
  return `      # One minimal model call. If the credential is dead/revoked/limited, this
      # step fails and the failure handler below reports the real reason.
      - name: Claude token liveness
        id: liveness
        if: steps.agent.outputs.agent == 'claude'
        uses: anthropics/claude-code-action@61a9c274fa7110a66dfafc1bbbced03833eb25fe # v1
        with:
          # Cloud fires this as the DispatchSEO GitHub App (a Bot actor), and the App also authored the workflow commits, so scheduled runs are bot-actored too. Every trigger here needs repo write access, so allowing bots is safe; without this claude-code-action aborts with "non-human actor".
          allowed_bots: "*"
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          anthropic_api_key: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN == '' && secrets.ANTHROPIC_API_KEY || '' }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          prompt: "Reply with exactly: ok"
          claude_args: |
            --max-turns 1`;
}

// token-check: how the failure-report step words a dead Claude credential.
// Classified, not generic: the default advice (mint a fresh token) is actively
// wrong for two of the states this check can surface, and wrong advice under a
// red banner is worse than none - it sends the owner to do a thing that
// provably changes nothing (2026-08-05, Maxpertise).
const livenessFailureSnippet = `            f="$RUNNER_TEMP/claude-execution-output.json"
            if [ -f "$f" ]; then
              msg=$(jq -r 'if type=="array" then .[] else . end
                           | select(.type? == "result")
                           | (.result // .error // empty)' "$f" 2>/dev/null | tail -1)
              [ -n "$msg" ] && reason="Claude token check failed: $msg"
            fi
            if echo "$msg" | grep -qiE 'session limit|usage limit|limit reached|limit .*resets|rate.?limit'; then
              # The credential WORKS - the account is just out of headroom right
              # now. The builders already treat that as a quiet deferral, so a
              # red health banner here would only train owners to ignore it.
              echo "Claude is usage-limited right now, but the credential itself is alive - treating the check as healthy. Builds defer until the limit resets."
              curl -sG --max-time 30 -H "Authorization: Bearer $SEO_MCP_API_KEY" \\
                --data-urlencode "job=seo-token-check" --data-urlencode "ok=1" \\
                "{{BACKEND_URL}}/api/cron/deploy-check" || true
              exit 0
            fi
            fix="mint a fresh token (claude setup-token) and re-run the setup command from your DispatchSEO dashboard"
            if echo "$msg" | grep -qi 'disabled Claude subscription access'; then
              # oauth_org_not_allowed: a server-side flag on the ACCOUNT, not
              # the token - re-minting provably does nothing.
              fix="a fresh token will NOT fix this one - Anthropic has flagged the Claude account itself (oauth_org_not_allowed). On a company Claude plan, ask its admin to enable Claude Code; on a personal plan, check claude.ai billing for a lapsed or duplicate subscription or contact Anthropic support. Or switch the builders to metered API billing: create a key at console.anthropic.com, 'gh secret set ANTHROPIC_API_KEY', then 'gh secret delete CLAUDE_CODE_OAUTH_TOKEN'"
            fi`;

export default {
  id,
  isDefault: true,
  secretName,
  resolveEnvName,
  extraResolveEnv,
  resolveCaseArm,
  configSteps,
  invokeStep,
  transcriptPath,
  classifyMsgExtraction,
  classifyBranch,
  basicClassifyBranch,
  livenessStep,
  livenessFailureSnippet,
};

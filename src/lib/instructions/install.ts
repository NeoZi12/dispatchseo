// The one-time pipeline install: the agent (running in the OWNER's site
// repo, on the owner's machine) fetches the repo-side shim via
// get_pipeline_pack, adapts the stack-specific spots to the repo it is
// standing in, sets the Actions secrets with the owner, and opens the shim
// PR. This replaces the old manual "copy the seo-*.yml files from the
// reference repo" dashboard step - the agent IS the installer.

// Plain-English step summary for the dashboard's Instructions page.
export const INSTALL_STEPS = [
  { title: "Preflight", plain: "Confirms it is standing in YOUR site's repo (not the DispatchSEO backend) with gh access." },
  { title: "Fetch", plain: "Pulls the pipeline pack - GitHub workflows, MCP configs, slash commands - from this backend." },
  { title: "Adapt", plain: "Adjusts the stack-specific spots (package manager, build command, content paths) to your repo." },
  { title: "Secrets", plain: "Sets the Actions secrets with you - and verifies each value actually works BEFORE storing it (MCP key, Claude Code token, optional DataForSEO)." },
  { title: "Ship", plain: "Opens the install PR, runs the setup workflow so the site facts get written too, and marks the dashboard's install card done." },
  { title: "First runs", plain: "Kicks off the first research run AND the first AI-visibility scan the moment the PR merges - your queue and your AI-visibility baseline both land today, not next week." },
];

export const INSTALL = `## Workflow: install (one-time - put the DispatchSEO pipeline shim into this repo)

This run happens on the OWNER's machine, inside the repo of the site
DispatchSEO manages ({{REPO}}). The shim you are installing is thin on
purpose: the workflows fetch their real playbook from get_instructions at
run time, so the repo never holds pipeline logic - just triggers, secrets,
and slash commands.

### Part 0 - preflight (stop early, loudly)

1. Confirm the working directory is the repo this project publishes to:
   the git remote must match {{REPO}}. That match is the WHOLE test - if the
   remote matches, proceed, even if this repo is itself a DispatchSEO
   backend deployment (an owner dogfooding DispatchSEO on its own site is
   valid; the project's configured repo decides, nothing else). If the
   remote does NOT match {{REPO}}, STOP and say where the owner should run
   this instead - never install the shim into a repo the project does not
   point at.
2. Confirm \`gh auth status\` works and the account can push branches and set
   secrets on this repo. If not, have the owner run \`gh auth login\` first.
3. **Brief the owner on everything this run will need - BEFORE doing
   anything else.** Nothing may surprise them mid-run. Tell them, in plain
   language:
   - "I already have your project's MCP key (it is how I am connected) -
     you do nothing for that one."
   - "You will create a Claude Code token when we get to secrets - two
     commands in your terminal, about a minute, and we will VERIFY it works
     before it goes anywhere." (The builders run on their subscription.)
   - Only if this project's keyword source is DataForSEO (check
     \`get_project\`): "Have your DataForSEO login email and your API
     password ready - the API password is on app.dataforseo.com/api-access,
     and it is NOT your dashboard login password." Ask them to open that
     page now so it is ready when needed.
   Wait for a simple go-ahead, then start.

### Part 1 - fetch and write the pack

1. Call the seo-manager MCP tool \`get_pipeline_pack\`. It returns every shim
   file as { path, content }, already personalized to this project.
2. Write each file at exactly its returned path (create directories as
   needed). If a file already exists, show the owner a diff summary and ask
   before overwriting - an existing install may carry local adaptations.

### Part 2 - adapt to THIS repo (the pack is a template, not gospel)

The pack is tuned for the reference stack (Next.js + pnpm + MDX content).
Inspect this repo and adjust these known spots before committing:

- **Package manager / Node setup** in seo-daily.yml, seo-tools.yml, and
  seo-tool-validate.yml: the pnpm/action-setup + cache steps and every
  \`pnpm install/build/start\` become this repo's real commands (npm, yarn,
  bun - and the Node version the repo actually uses). Two version rules
  learned the hard way:
  - If package.json has a \`packageManager\` field ("pnpm@x.y.z"), DELETE the
    \`version:\` input from pnpm/action-setup - the action reads the field,
    and version input + packageManager together hard-error on ANY mismatch
    (plain string compare, "11" vs "11.5.2" included). No field: keep a
    version matching the major that wrote pnpm-lock.yaml.
  - pnpm 11 requires Node 22+; keep node-version in sync with what the repo
    really builds on.
- **Prove the install step exactly the way CI will run it - BEFORE the PR
  opens.** Run the repo's install command fresh with the workflow's flags
  (\`pnpm install --frozen-lockfile\`, \`npm ci\`, ...) and require exit 0.
  pnpm 11 hard-fails unanswered dependency build scripts
  (ERR_PNPM_IGNORED_BUILDS - strictDepBuilds is on by default, where pnpm
  10 merely warned, so a locally-green repo can still be CI-red). If it
  complains, answer every listed script in pnpm-workspace.yaml
  (\`allowBuilds:\` with an explicit true/false per dep, plus an
  \`onlyBuiltDependencies\` list so older pnpm keeps working) and ship that
  answer IN this install PR.
- **Public env placeholders** (NEXT_PUBLIC_*) in those workflows exist so
  the build never trips on missing vars. Replace them with whatever public
  env THIS repo's production build needs; drop the ones it doesn't.
- **The auto-merge path gate** in seo-auto-merge.yml only auto-merges guide
  PRs whose files all live under the content dirs (reference:
  src/content/blog/ and src/components/blog/). Point those prefixes at this
  repo's content home. If the content home does not exist yet, leave the
  reference paths and fix them after the setup workflow (next step)
  discovers or scaffolds it.
- **The tool validator** (seo-tool-validate.yml) builds the PR and exercises
  the tool page on localhost:3000 - adjust the port/start command if this
  repo serves differently.
- **IndexNow dispatches** in the merge steps reference an indexnow.yml the
  repo may not have; the \`|| echo\` fallbacks make that harmless. Mention it
  as a nice-to-have, do not build it in this run.

### Part 3 - secrets and repo settings

The rule for every secret: **verify the value BEFORE it goes into GitHub.**
Secrets cannot be read back, and a bad one fails silently until a real run
dies - so prove each value works first, and never echo a value into the
conversation.

**Check what already exists first:** \`gh secret list --repo {{REPO}}\`. The
owner's one-command setup script (\`setup.sh\` from the dashboard) normally
already set SEO_MCP_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, and (when applicable)
the DataForSEO pair - all verified at set time. Skip whatever exists and
only fill gaps using the steps below; do not re-mint a Claude token that is
already stored.

1. \`SEO_MCP_API_KEY\` - set it yourself via \`gh secret set\`. The value is
   this session's MCP Bearer token (already proven to work - it is how you
   are connected); the owner can also read it on the dashboard's pipeline
   card. This key IS the project: every call made with it lands in this
   project's data, which is how one backend serves many sites.
2. \`CLAUDE_CODE_OAUTH_TOKEN\` - the token that fails in more ways than any
   other value. Three field-proven traps:
   - terminals (VS Code's, tmux) copy the line-wrapped token with a REAL
     newline inside - GitHub then stores a broken token;
   - the owner copying YOUR suggested commands overwrites the token in
     their clipboard, so "paste from clipboard" flows save command text;
   - a plain local test (\`CLAUDE_CODE_OAUTH_TOKEN=... claude -p\`) is a
     FALSE POSITIVE: when a keychain login exists the CLI silently ignores
     the env var and answers from the owner's login. Only a no-keychain
     environment (fake HOME) tests the actual token - that is the same
     auth path CI uses.
   So never hand the owner loose commands to juggle. Write this guided
   script to a temp file and have them run \`bash <path>\` - it prompts at
   each step, validates the clipboard itself, retries on mistakes, and
   only stores a token it has genuinely verified:

   \`\`\`bash
   #!/bin/bash
   echo "STEP 1: Press Enter; a browser opens - click Approve with your"
   echo "normal Claude account (the one with your subscription)."
   read -r
   claude setup-token
   echo ""
   echo "STEP 2: Select the long token above (sk-ant-oat..., two lines is"
   echo "fine), copy it (Cmd+C), then press Enter here."
   while true; do
     read -r
     TOKEN=$(pbpaste | tr -d '[:space:]')   # Linux: xclip -o instead of pbpaste
     case "$TOKEN" in
       sk-ant-oat*) [ \${#TOKEN} -gt 60 ] && break; echo "Too short - copy the WHOLE token, press Enter." ;;
       *) echo "Clipboard doesn't hold a token - copy JUST the token, press Enter." ;;
     esac
   done
   echo "STEP 3: verifying for real (no login fallback)..."
   mkdir -p /tmp/claude-fakehome
   if HOME=/tmp/claude-fakehome CLAUDE_CODE_OAUTH_TOKEN="$TOKEN" claude -p "reply with just: ok" </dev/null; then
     printf '%s' "$TOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo {{REPO}}
     echo "DONE - verified and saved."
   else
     echo "Token is bad AT THE SOURCE - the browser approved the wrong"
     echo "account. Log into the subscription account on claude.ai, rerun."
     exit 1
   fi
   \`\`\`

   Never store a token that failed the fake-HOME verification.
3. \`DATAFORSEO_LOGIN\` + \`DATAFORSEO_PASSWORD\` - only if this project's
   keyword source is DataForSEO; skip cleanly otherwise (the workflows
   tolerate their absence). LOGIN is the account email. PASSWORD is the
   **API password from app.dataforseo.com/api-access - NOT the dashboard
   login password** (the single most common mixup). Use the same
   credentials the owner connected on the DispatchSEO dashboard - the
   dashboard verified those against the live API when they were saved, so
   they are the known-good reference. The owner runs
   \`gh secret set DATAFORSEO_LOGIN --repo {{REPO}}\` (and PASSWORD) so the
   values never transit this conversation.
4. **Smoke-test the secrets once the install PR merges:** dispatch
   \`gh workflow run seo-trend-scan.yml --repo {{REPO}}\` and watch it. A bad
   Claude token fails within ~20 seconds with \`authentication_failed\`; a
   healthy run takes 3-6 minutes and puts real topics on the Trends radar.
   Do not call the install verified until this run is green.

Then enable PR creation for Actions: repo Settings -> Actions -> General ->
"Allow GitHub Actions to create and approve pull requests"
(\`gh api -X PUT repos/{{REPO}}/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true\`
does it from the CLI; fall back to telling the owner where to click).

Then pre-create the pipeline's labels - \`gh pr create --label\` fails on a
label that doesn't exist yet, so a repo without them passes install and dies
on its FIRST real build:
\`gh label create seo --repo {{REPO}} --color 0e8a16 --description "DispatchSEO SEO pipeline" 2>/dev/null; gh label create seo-tool --repo {{REPO}} --color 1d76db --description "DispatchSEO tool PR" 2>/dev/null\`
(exit code 1 = already exists = fine).

### Part 4 - ship, then continue into setup

1. Commit the shim on a branch and open a PR titled "Install the DispatchSEO
   pipeline" summarizing what was adapted for this repo. Never push to the
   default branch directly.
2. After the PR is open, run the \`setup\` workflow in this same session
   (get_instructions workflow=setup): it finds or scaffolds the content
   home, writes .dispatchseo/conventions.md, and personalizes the site
   profile. If setup lands on a different content home than the auto-merge
   path gate assumes, update the gate paths on the same install branch.
3. Call \`mark_pipeline_installed\` - one call, no arguments. This is what
   flips the owner's dashboard install card to its green done state;
   skipping it leaves the owner staring at an un-done card after you
   finished. Only call it now, at the end, with the PR open and setup run.
4. **Prove the PR machinery with the canary - before anything else runs.**
   Once the install PR is merged, dispatch
   \`gh workflow run seo-canary.yml --repo {{REPO}}\` and wait for its
   conclusion (poll \`gh run list --workflow seo-canary.yml\`). It opens a
   throwaway PR from inside a workflow - the exact thing GitHub's default
   settings block - then closes it, merging nothing. If it FAILS, stop and
   fix before continuing: the usual cause is "Allow GitHub Actions to
   create and approve pull requests" being off (Part 3 set it; re-check).
   A failed canary means every future builder run would write content it
   cannot publish - never leave an install in that state.
5. **Kick off the first runs - a fresh install must never wait for the
   calendar.** Every scheduled workflow anchors to a cron day (research on
   Mondays, builds daily), so a site installed on a Tuesday would sit idle
   for almost a week with an empty queue. Once the install PR is merged
   (the smoke test in Part 3 already required that; if it has not merged
   yet, ask the owner to merge now):
   - Dispatch \`gh workflow run seo-weekly-research.yml --repo {{REPO}}\`.
     This first research run fills the suggestions queue immediately -
     tell the owner ideas land on their dashboard in roughly 10-20
     minutes. Pacing does not block it: a fresh project has built nothing
     yet, so the daily slot is free.
   - Dispatch \`gh workflow run seo-geo-scan.yml --repo {{REPO}}\` as well:
     the first AI-visibility scan gives the dashboard's AI section a real
     baseline today instead of waiting for its Wednesday schedule.
     (Google's AI Overview half fills in on its own with the next daily
     rank cron - nothing to dispatch for that.)
   - When that run finishes, check \`get_suggestions\`. If it left an
     approved guide in the queue (it will on full-automatic projects),
     dispatch \`gh workflow run seo-daily.yml --repo {{REPO}}\` so the
     first content PR opens today too. On semi-automatic projects, tell
     the owner instead: approve an idea on the dashboard and the daily
     builder picks it up on its next morning run - or dispatch
     seo-daily.yml for them once they approve in this session.
   - **Watch every run you dispatch to its conclusion**
     (\`gh run watch --repo {{REPO}} <run-id>\`, or poll \`gh run list\`).
     A red first run is THIS session's bug to diagnose and fix now - the
     owner must never discover it as a surprise failure email tomorrow.
     The known first-run killers are exactly what the preflights call out:
     a broken CLAUDE_CODE_OAUTH_TOKEN secret, and an install step that
     was never proven with the workflow's exact flags (Part 2).
   If the owner cannot merge the PR in this session, say plainly that
   nothing runs until it merges, and give them the two dispatch commands
   above to fire right after they do (running \`/seo-research\` locally
   works as well).
6. Report: the PR URL, every adaptation made, which secrets were set (names
   only), the canary verdict, whether the first research run was kicked
   off, and the instructions version.

If get_pipeline_pack or get_instructions is unavailable, fail loudly and
change nothing.`;

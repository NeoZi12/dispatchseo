import type { AgentId } from "@/lib/agents";

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
  { title: "Secrets", plain: "Sets the Actions secrets with you - and verifies each value actually works BEFORE storing it (MCP key, your coding agent's credential, optional DataForSEO)." },
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
   point at. **One diagnosis to offer before anything else:** if the owner
   says they JUST connected this repo from the wizard, the near-certain
   cause is that this {{AGENT_NAME}} session started BEFORE their
   \`{{AGENT_CLI}} mcp add\` ran - connections load once, at startup, so the session
   is still holding an older project's key. Tell them to close and reopen
   {{AGENT_NAME}} in this folder and paste the install command again; that is
   a restart, not an error (2026-07-23: this exact case cost an owner three
   confused round-trips).

   **If \`get_project\` shows \`github_repo: null\`** (the rendered name above
   reads "the project repo"), the project has NO repo connected - a
   disconnect, or a creation that skipped it. That is fixable right here:
   confirm with the owner that THIS directory's repo is where content should
   publish, then call \`set_github_repo\` with the remote's \`owner/name\` and
   re-check \`get_project\` before proceeding. If the owner is not present,
   STOP and report - never pick a publish target for them. If the project
   shows a DIFFERENT repo and the owner says this one is right, the same
   tool changes it (on self-host it validates against the instance's stored
   GitHub token; remind them the OLD repo keeps any installed workflows -
   \`disconnect_repo\` is the teardown).
2. Confirm \`gh auth status\` works and the account can push branches and set
   secrets on this repo. If not, have the owner run \`gh auth login\` first.
3. **Brief the owner on everything this run will need - BEFORE doing
   anything else.** Nothing may surprise them mid-run. Tell them, in plain
   language:
   - "I already have your project's MCP key (it is how I am connected) -
     you do nothing for that one."
   - Only on a HOSTED backend (public URL - the local-backend fast path at
     the top of Part 3 decides): {{AGENT_CREDENTIAL_BRIEF}}
   - Only if this project will wire its OWN DataForSEO account into this repo
     (check \`get_project\`'s \`dataforseo_repo_mcp\` - NOT keyword_source: a
     cloud project can be DataForSEO-backed through the platform's bundled
     plan with nothing to collect here): "Have your DataForSEO login email
     and your API password ready - the API password is on
     app.dataforseo.com/api-access, and it is NOT your dashboard login
     password." Ask them to open that page now so it is ready when needed.
   Wait for a simple go-ahead, then start.

### Part 1 - fetch and write the pack

1. Call the seo-manager MCP tool \`get_pipeline_pack\` with NO arguments. It
   returns a MANIFEST - the list of shim file PATHS only (content omitted,
   because the whole pack overflows a single response). Then, for EACH path,
   call \`get_pipeline_pack\` again with that \`path\` - it returns
   { path, content } for that one file - and write the content at exactly that
   path with your file-write tool (create directories as needed). Write them
   ONE AT A TIME with the native file-write tool; do NOT dump them with a bulk
   extraction script - the permission gate blocks scripts that create many
   files at once, and a real install stalled on exactly that (2026-07-24).
2. **Already current? Stop before you rewrite anything.** Fetch
   \`.dispatchseo/pipeline-version\` FIRST (a single \`path=\` call) and compare
   it to the repo's copy. Identical means this repo already runs this exact
   shim: skip the remaining per-file fetches AND all of Part 2 - there is
   nothing to write, nothing to adapt, and no PR to open. Say that plainly,
   then go straight to Part 4 step 3, whose checklist has an already-installed
   path. Do NOT manufacture work to look busy: rewriting identical files
   produces an empty PR that can never merge, and the owner's wizard sits on
   the finale screen waiting for it forever.
3. On an update run (files exist but the version differs), overwrite the pack's
   own files freely - workflows carry no repo-specific truth anymore; everything
   repo-specific lives in \`.dispatchseo/\` files the pack does NOT include
   (conventions.md, publish-paths, serve), and those must be LEFT ALONE.
   **\`.dispatchseo/\` is a mixed directory, not a protected one:** the pack
   ships files into it too (pipeline-version, generate-cover.mjs). The rule is
   per-FILE - if the manifest lists it, it is pack-owned and you write it; if
   the manifest doesn't, it is the repo's and you don't touch it. The one
   exception worth a diff-and-ask: a file the owner visibly hand-edited
   beyond the known adaptation spots (custom steps, extra jobs) - never
   silently discard work like that.
4. Call \`mark_install_step\` with step=\`workflows\` - including on the
   already-current path above, where the step is satisfied by what is already
   there. An unstamped step reads on the owner's finale as "nothing happened".
   (These stamps feed the
   live checklist the owner watches on the wizard finale - stamp each step
   RIGHT AFTER finishing it, throughout this install. Best-effort always:
   if the tool is missing or errors, continue - a progress tick must never
   stop an install.)

### Part 2 - adapt to THIS repo (the pack is a template, not gospel)

The pack is tuned for the reference stack (Next.js + pnpm + MDX content).
Inspect this repo and adjust these known spots before committing:

- **Backend URL reality check - VERIFY before you offer or wire anything.**
  The pack bakes in the backend URL this project was created on. If it is a
  localhost/private address, GitHub Actions cannot reach it. Before asking
  the owner which URL to use, TEST each candidate yourself: hit
  \`<url>/api/mcp\` with this connection's bearer token (a tokenless request
  must 401; the token must be accepted). Only offer choices you have proven
  work, and say plainly which ones you ruled out and why ("production
  rejected this project's token - it was created on the local instance").
  Never present an option that you could have cheaply proven would fail.
  If no reachable backend accepts the token, keep the URLs as shipped, note
  loudly in the PR that CI runs stay paused until the instance is public,
  and skip the smoke/canary dispatches.

- **Package manager / Node setup** in seo-daily.yml, seo-tools.yml, and
  seo-tool-validate.yml: **there is nothing here for you to adapt, for ANY
  package manager.** As of 2026-08-02 a \`Detect this repo's package manager\`
  step (id \`pkg\`) resolves it at RUN time in this repo - \`packageManager\`
  pin first, then lockfile (pnpm-lock.yaml > package-lock.json > yarn.lock >
  bun.lock) - and every step after it is gated on its outputs
  (\`steps.pkg.outputs.pm\` / \`pnpm_pinned\` / \`cache\`). pnpm's two blessed
  shapes, npm, yarn, Bun, and "no package.json at all" each have their own
  guarded step already.
  - **Leave every one of those steps exactly as shipped** - do not edit,
    reorder, collapse, delete or replace them, whether this repo is pnpm or
    not. An earlier version of this playbook told you to replace the pnpm
    setup steps with the repo's own tool when it wasn't pnpm; that is now
    WRONG - the template does it itself, and a hand-edit fights the
    detection. Two incidents are why the rule is this absolute: 2026-07-30, a
    missed install-time edit killed the builder in every repo carrying a
    \`packageManager\` pin, at step 2, BEFORE the step that reports failures,
    so it died silently; 2026-08-02, the first real cloud customer's
    npm + Vite site died 25 seconds into every build because the pack assumed
    pnpm.
  - **Node version resolves at run time too** - \`.nvmrc\` if this repo has
    one, otherwise \`engines.node\` from package.json read as a FLOOR (">=18"
    is a minimum a Node 22 runner already meets, so it does not drag the
    build down onto an EOL major), otherwise 22. Leave the "Set up Node"
    step exactly as shipped. If this repo must build on a specific major,
    add an \`.nvmrc\` to the REPO - never edit the workflow, because a pack
    update rewrites it verbatim and your edit disappears with it.
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
  **This is the one adaptation that still lives INSIDE a pack file, so a
  pipeline update overwrites it** - unlike \`.dispatchseo/publish-paths\`,
  \`.dispatchseo/serve\` and \`.dispatchseo/conventions.md\`, which are
  repo-owned and survive. It fails loudly when it happens (the build stops
  on the missing var and reports home), so it is recoverable, not silent:
  if a build starts failing on a public env var right after an update, this
  is why - re-apply it and say so in the PR. Prefer values the build can get
  from the repo itself over anything hand-typed here.
- **The auto-merge path gate** only auto-merges guide PRs whose files all
  live under the repo's publish dirs. Those dirs come from
  \`.dispatchseo/publish-paths\` - one path prefix per line, # comments
  allowed (reference default when the file is absent: src/content/blog/,
  src/components/blog/, public/blog/covers/). WRITE that file now with this
  repo's real guide layout: the content dir, the guide-components dir, the
  cover-image dir, and any file every routine guide PR must touch (e.g. a
  registry module that guides always append to). Never edit the fallback
  paths inside seo-auto-merge.yml itself - the file is the config, the
  workflow is disposable. This file is deliberately not part of the pack, so
  pack updates can never clobber the adaptation (2026-07-23: an update
  overwrote an adapted gate and a green guide PR sat unmerged while the
  dashboard called it published). If the content home does not exist yet,
  skip the file and write it after the setup workflow (next step) discovers
  or scaffolds it.
- **The tool validator** (seo-tool-validate.yml) builds the PR and exercises
  the tool page against a locally-served production build. It defaults to
  \`<pm> run start\` on port 3000 (Next's shape). If THIS repo serves
  differently - Vite \`preview\` on 4173, Hugo \`server\` on 1313, a built
  dir behind \`python3 -m http.server\`, or any repo with no package.json -
  WRITE \`.dispatchseo/serve\` now, two lines:
  \`command=<what serves the production build>\` and \`port=<the port it
  listens on>\`. Never edit the port or start command inside
  seo-tool-validate.yml itself - that file is pack-owned and the next pack
  update reverts the edit, which is the 2026-07-30 failure shape.
  \`.dispatchseo/serve\` is repo-owned and survives updates, exactly like
  \`.dispatchseo/publish-paths\`. Get this wrong and every tool PR fails
  validation and strands unmerged.
- **IndexNow dispatches** in the merge steps reference an indexnow.yml the
  repo may not have; the \`|| echo\` fallbacks make that harmless. Mention it
  as a nice-to-have, do not build it in this run.

When the adaptation is done and the install command proved green, call
\`mark_install_step\` with step=\`adaptation\`.

### Part 3 - secrets and repo settings

The rule for every secret: **verify the value BEFORE it goes into GitHub.**
Secrets cannot be read back, and a bad one fails silently until a real run
dies - so prove each value works first, and never echo a value into the
conversation.

**Check what already exists first:** \`gh secret list --repo {{REPO}}\`. The
owner's one-command setup script (\`setup.sh\` from the dashboard) normally
already set SEO_MCP_API_KEY, {{AGENT_SECRET_NAME}}, and (when applicable)
the DataForSEO pair - all verified at set time. Skip whatever exists and
only fill gaps using the steps below; do not re-mint a credential that is
already stored.

**Local-backend fast path (backend URL is localhost / 127.x / a private
address):** GitHub-hosted workflows cannot reach this backend, and Part 4
disables the phone-home schedules accordingly - so GitHub never runs the
coding agent for this project. Therefore SKIP step 2 ({{AGENT_SECRET_NAME}}
- the builder container already holds the credential from the wizard's
automatic-builds step) and SKIP step 4 (the trend-scan smoke test - it
exercises a workflow Part 4 disables two steps later). Steps 1 and 3, the Actions PR permission,
and the labels still apply everywhere: the canary and tool-validate
workflows stay live on every install and depend on them. This fast path
plus Part 4's builder-first research cuts a local install from ~40 minutes
to ~10-15.

1. \`SEO_MCP_API_KEY\` - set it yourself via \`gh secret set\`. The value is
   this session's MCP Bearer token (already proven to work - it is how you
   are connected); the owner can also read it on the dashboard's pipeline
   card. This key IS the project: every call made with it lands in this
   project's data, which is how one backend serves many sites.
{{AGENT_CREDENTIAL_STEP}}
3. \`DATAFORSEO_LOGIN\` + \`DATAFORSEO_PASSWORD\` - only if \`get_project\`'s
   \`dataforseo_repo_mcp\` is true (this repo gets its own DataForSEO MCP
   server); skip cleanly otherwise - including a cloud project on the
   platform's bundled plan, where DataForSEO is billed server-side and its
   credentials must NEVER enter this repo (the workflows tolerate the
   secrets' absence either way). LOGIN is the account email. PASSWORD is the
   **API password from app.dataforseo.com/api-access - NOT the dashboard
   login password** (the single most common mixup). Use the same
   credentials the owner connected on the DispatchSEO dashboard - the
   dashboard verified those against the live API when they were saved, so
   they are the known-good reference. The owner runs
   \`gh secret set DATAFORSEO_LOGIN --repo {{REPO}}\` (and PASSWORD) so the
   values never transit this conversation.
4. **The moment the install PR merges, LOCAL BACKEND ONLY: disable the
   phone-home workflows FIRST**, before anything else - the exact list is in
   Part 4's workflow-states line. In the gap between the merge and that
   disable, a check event can fire seo-auto-merge, which cannot reach a
   local backend and emails the owner a scary "run failed" mid-install.
   (Current packs also self-skip on local backends, but never rely on that
   alone - the repo may hold an older pack.) Then
   **smoke-test the secrets:** dispatch
   \`gh workflow run seo-trend-scan.yml --repo {{REPO}}\` and watch it. {{AGENT_SMOKE_NOTE}} a
   healthy run takes 3-6 minutes and puts real topics on the Trends radar.
   Do not call the install verified until this run is green.

Then enable PR creation for Actions: repo Settings -> Actions -> General ->
"Allow GitHub Actions to create and approve pull requests"
(\`gh api -X PUT repos/{{REPO}}/actions/permissions/workflow -F can_approve_pull_request_reviews=true\`
does it from the CLI; fall back to telling the owner where to click). Do NOT
change the repo's default workflow token permission - every pipeline workflow
declares its own \`permissions:\`, so a read-only default is correct.

Then pre-create the pipeline's labels - \`gh pr create --label\` fails on a
label that doesn't exist yet, so a repo without them passes install and dies
on its FIRST real build:
\`gh label create seo --repo {{REPO}} --color 0e8a16 --description "DispatchSEO SEO pipeline" 2>/dev/null; gh label create seo-tool --repo {{REPO}} --color 1d76db --description "DispatchSEO tool PR" 2>/dev/null\`
(exit code 1 = already exists = fine).

With the permission set and both labels in place, call \`mark_install_step\`
with step=\`repo_settings\`.

### Part 4 - ship, then continue into setup

1. Commit the shim on a branch and open a PR titled "Install the DispatchSEO
   pipeline" summarizing what was adapted for this repo. Never push to the
   default branch directly.
2. After the PR is open, run the \`setup\` workflow in this same session
   (get_instructions workflow=setup): it finds or scaffolds the content
   home, writes .dispatchseo/conventions.md, and personalizes the site
   profile. If setup lands on a different content home than
   .dispatchseo/publish-paths lists (or the file was skipped in Part 2),
   write/update that file on the same install branch.
3. **Verify everything, then unlock.** \`mark_pipeline_installed\` is not a
   status update - it is what UNLOCKS the owner's dashboard, so it may only
   be called when every line below is verifiably green. Check each one NOW;
   anything that fails, fix it or hand the owner the exact link and WAIT,
   then re-check - never proceed on a promise:
   - **Install PR merged** - the workflows must be live on the default
     branch. Not merged? Ask the owner to merge (link the PR) and wait.
     **Nothing to install?** When Part 1 found the shim already current there
     is no PR and never will be, so waiting for one deadlocks the owner's
     finale. This line is satisfied the moment the workflows are provably live
     on the DEFAULT branch - check with
     \`gh api repos/{{REPO}}/contents/.github/workflows/seo-daily.yml --jq .name\`.
     Green it and move on; every other line below still gets checked for real.
   - **Actions can open PRs** (required in BOTH modes - the daily builder
     opens every content PR from inside a workflow; semi vs auto only
     changes who merges): \`gh api repos/{{REPO}}/actions/permissions/workflow\`
     shows \`can_approve_pull_request_reviews: true\` - GitHub's single
     "create and approve pull requests" switch, needed in every mode because
     it is what lets GITHUB_TOKEN open a PR at all. The default workflow
     token permission may stay read-only. If your
     Part 3 PUT was permission-blocked, send the owner to
     https://github.com/{{REPO}}/settings/actions with the exact toggle
     name ("Allow GitHub Actions to create and approve pull requests"),
     then RE-CHECK via the API.
   - **Workflow states match the backend type.** Check with
     \`gh workflow list --all --repo {{REPO}}\`:
     - **Hosted backend (public URL):** every seo-*.yml must be ACTIVE. A
       repo that had the pipeline before (uninstalled, reset, or long-idle -
       GitHub also auto-disables schedules after 60 quiet days) silently
       inherits DISABLED workflows even after the files are re-merged:
       nothing errors, nothing ever runs. Fix any:
       \`gh workflow enable <file> --repo {{REPO}}\`, then re-list. The
       backend re-checks this and refuses the unlock stamp while any seo
       workflow is disabled.
     - **Local backend (localhost / 127.x):** the in-stack builder owns
       the schedules, and GitHub-hosted runs would only fail phoning home
       to an unreachable URL. DISABLE the phone-home workflows
       (\`gh workflow disable\` for seo-daily, seo-weekly-research,
       seo-geo-scan, seo-auto-merge, seo-token-check, seo-tools,
       seo-trend-scan, seo-trend-expand) and keep seo-tool-validate and
       seo-canary ENABLED (PR/dispatch-triggered - they work anywhere).
       Tell the owner their builds run through the builder container and
       point them at the wizard finale's "Turn on automatic builds" step
       if they haven't done it.
   - **Labels exist:** \`gh label list --repo {{REPO}}\` includes both
     \`seo\` and \`seo-tool\`.
   - **Secrets set:** \`gh secret list --repo {{REPO}}\` shows every secret
     Part 3 required.
   - **The repo's key points at THIS backend.** A repo can carry a complete,
     current shim that is wired to a DIFFERENT DispatchSEO instance - the
     owner reinstalled, moved from cloud to self-host, or wiped their database
     (our own troubleshooting guide tells them to run
     \`docker compose down -v\`). Matching files prove nothing about which
     backend those workflows call, and GitHub never reads a secret back, so
     you cannot inspect the stored one. Just re-set it: \`gh secret set
     SEO_MCP_API_KEY --repo {{REPO}}\` with THIS session's bearer token, and
     confirm the workflows' backend URL is the one this connection uses.
     Skipping this hands the owner a repo that looks installed and reports to
     someone else's dashboard.
   - **Setup ran:** conventions.md is on its PR/branch and the site profile
     saved (get_site_profile returns it).
   Only when all pass, call \`mark_pipeline_installed\` - one call, no
   arguments. Calling it with failing checks hands the owner an unlocked
   dashboard that breaks on its first real run - the exact failure this
   checklist exists to prevent.
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
   - **Local backend? The builder runs research - do NOT run it in this
     session by default.** If the backend URL this connection uses is only
     reachable from this machine (localhost / 127.x / 0.0.0.0),
     GitHub-hosted runs cannot phone home to it, so skip every dispatch
     below. But do NOT run research inline either: check
     \`get_cron_health\` - if \`builder_token_configured\` is true (the owner
     pasted their agent credential on the wizard's automatic-builds step), the
     in-stack builder claims the research job on its next poll and runs it
     in the background within ~10 minutes. Use \`builder_token_configured\`,
     NOT \`builder_last_seen_at\`: the heartbeat lags a full poll (up to ~10
     min) after the token is set, so a freshly-configured builder still
     reads \`builder_last_seen_at: null\` - keying off the heartbeat makes
     you wrongly fall back to running research inline (2026-07-24: the owner
     pasted the token and the agent couldn't tell). Tell the owner: "your
     first keyword research starts automatically in the background - ideas
     appear on the dashboard in about 10-20 minutes", call
     \`mark_install_step\` with step=\`research\`, and END the session there.
     Only when \`builder_token_configured\` is false (no token pasted and no
     env override) does the old fallback apply: tell the owner to complete
     the wizard's automatic-builds step, and if they can't right now, run
     the research workflow YOURSELF in this session
     (get_instructions workflow=research) and confirm with get_suggestions.
     **If this session builds ANY content itself** (the fallback, or an
     owner asking for a first guide now): follow the FULL build contract
     from get_instructions workflow=build-guide - PR labeled \`seo\`,
     \`update_suggestion\` through in_progress to done, \`log_page\` with the
     final URL. A guide the backend never heard about is invisible on the
     dashboard (2026-07-23 e2e: a scaffold PR bundled a guide, skipped
     both calls, and Guides showed empty while the blog was live).
   - **Hosted backend only** (a public URL GitHub can reach). On a LOCAL
     backend you ALREADY ended the session above - do NOT run any of the
     \`gh workflow run\` dispatches below; they target workflows Part 4 just
     disabled, so GitHub rejects them. Hosted:
     Dispatch \`gh workflow run seo-weekly-research.yml --repo {{REPO}}\`.
     This first research run fills the suggestions queue immediately -
     tell the owner ideas land on their dashboard in roughly 10-20
     minutes. Pacing does not block it: a fresh project has built nothing
     yet, so the daily slot is free. Call \`mark_install_step\` with
     step=\`research\` once dispatched.
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
   (Hosted backend) If the owner cannot merge the PR in this session, say
   plainly that nothing runs until it merges, and give them the two dispatch
   commands above to fire right after they do. On a LOCAL backend there are no
   dispatch commands to hand over: the in-stack builder runs research on its
   own once the PR is merged and the agent credential is set - point the owner at
   the wizard finale's "Turn on automatic builds" step (or \`/seo-research\`
   locally) instead.
6. Report: the PR URL, every adaptation made, which secrets were set (names
   only), the canary verdict, whether the first research run was kicked
   off, and the instructions version.

If get_pipeline_pack or get_instructions is unavailable, fail loudly and
change nothing.`;

// The per-agent halves of Part 3. Which one renders is decided by the
// PROJECT's agent at get_instructions time - the same run-time resolution the
// workflows use - because this playbook is fetched by whichever CLI setup.sh
// launched, and telling a Codex install to mint a Claude token stalls it on a
// prerequisite that does not apply (or worse, makes the owner buy one).
export const CLAUDE_CREDENTIAL_STEP = `2. \`CLAUDE_CODE_OAUTH_TOKEN\` - the token that fails in more ways than any
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

   If verification fails with "Your organization has disabled Claude
   subscription access for Claude Code" (Anthropic's oauth_org_not_allowed):
   STOP re-minting - that is a server-side flag on the account itself, and a
   fresh token comes back just as blocked. Tell the owner their options: ask
   their Claude plan admin to enable Claude Code (company plans), sort out a
   lapsed or duplicate subscription with Anthropic support (personal plans),
   or run the builders on metered API billing instead - create a key at
   console.anthropic.com, then
   \`printf '%s' "$KEY" | gh secret set ANTHROPIC_API_KEY --repo {{REPO}}\`.
   The workflows fall back to ANTHROPIC_API_KEY automatically whenever no
   CLAUDE_CODE_OAUTH_TOKEN secret exists (the subscription token wins if
   both are set).`;

export const CODEX_CREDENTIAL_STEP = `2. \`OPENAI_API_KEY\` - what the builders bill their runs to. Two
   field-proven traps:
   - a key is shown ONCE at creation, so a half-copied key is the most
     common bad paste - and GitHub secrets are write-only, so a broken one
     is invisible until a real run dies on it;
   - a key can be real and still useless: an account with no credit passes
     every shape check ever written and fails on the first build. Only a
     live API call proves a key.
   So never hand the owner loose commands to juggle. Write this guided
   script to a temp file and have them run \`bash <path>\` - it prompts,
   validates the clipboard itself, makes one metered verification call
   (fractions of a cent), and only stores a key it has genuinely proven:

   \`\`\`bash
   #!/bin/bash
   echo "STEP 1: Open platform.openai.com/api-keys in a browser and create"
   echo "a key (a project key is fine - the ACCOUNT needs credit on it)."
   echo "Copy the key, then press Enter here."
   while true; do
     read -r
     KEY=$(pbpaste | tr -d '[:space:]')   # Linux: xclip -o instead of pbpaste
     case "$KEY" in
       sk-ant-*) echo "That's a Claude token, not an OpenAI key - copy the key from platform.openai.com, press Enter." ;;
       sk-*) [ \${#KEY} -gt 20 ] && break; echo "Too short - copy the WHOLE key, press Enter." ;;
       *) echo "Clipboard doesn't hold an OpenAI key - copy JUST the key, press Enter." ;;
     esac
   done
   echo "STEP 2: verifying for real (one live API call)..."
   code=$(curl -s -o /tmp/openai-verify.json -w "%{http_code}" https://api.openai.com/v1/responses \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"model":"gpt-5-mini","input":"ok","max_output_tokens":16}')
   err=$(jq -r '.error.code // empty' /tmp/openai-verify.json 2>/dev/null)
   case "$code:$err" in
     2*:*|429:rate_limit_exceeded)
       printf '%s' "$KEY" | gh secret set OPENAI_API_KEY --repo {{REPO}}
       echo "DONE - verified and saved." ;;
     429:*|402:*)
       echo "The key is real but the account can't run builds (OpenAI said:"
       echo "\${err:-quota exceeded}). Add credit at platform.openai.com/settings"
       echo "/organization/billing, then rerun this script."
       exit 1 ;;
     *)
       echo "OpenAI rejected the key (HTTP $code, \${err:-no code}) - create a"
       echo "fresh one at platform.openai.com/api-keys and rerun this script."
       exit 1 ;;
   esac
   \`\`\`

   Never store a key that failed the live verification.`;

export const CLAUDE_CREDENTIAL_BRIEF =
  '"You will create a Claude Code token when we get to secrets - two ' +
  'commands in your terminal, about a minute, and we will VERIFY it works ' +
  'before it goes anywhere." (The builders run on their subscription.) On a ' +
  'LOCAL backend say instead: "No token step here - your builds run in the ' +
  'builder container, which gets its token in the wizard\'s automatic-builds ' +
  'step."';

export const CODEX_CREDENTIAL_BRIEF =
  '"You will create an OpenAI API key when we get to secrets - one browser ' +
  'page, about a minute, and we will VERIFY it works with a live call before ' +
  'it goes anywhere." (Codex builds are metered to their OpenAI account, so ' +
  'the account needs credit on it.) On a LOCAL backend say instead: "No key ' +
  'step here - your builds run in the builder container, which gets its key ' +
  'in the wizard\'s automatic-builds step."';

export const CURSOR_CREDENTIAL_STEP = `2. \`CURSOR_API_KEY\` - what the overnight builders authenticate with. The
   builds run on a server with no browser, so the interactive
   \`cursor-agent login\` the owner already has does NOT reach them - only an
   API key does. Any plan can mint one at cursor.com/dashboard/api (that URL
   directly - the page is often missing from the dashboard's own menu). Two
   field-proven traps:
   - terminals (VS Code's, tmux) copy a line-wrapped key with a REAL
     newline inside - GitHub then stores a broken key;
   - \`cursor-agent models\` EXITS 0 even when the key is invalid, so a
     naive "did the command succeed" check passes on garbage. The OUTPUT
     is what proves the key, never the exit code.
   One thing works FOR us here: a key in \`CURSOR_API_KEY\` beats any
   interactive login on the machine (the CLI states the source it used), so
   unlike a Claude token this check cannot false-positive off the owner's
   own session. Write this guided script to a temp file and have them run
   \`bash <path>\` - it prompts, validates the clipboard itself, makes one
   real call to Cursor, and only stores a key it has genuinely verified:

   \`\`\`bash
   #!/bin/bash
   echo "STEP 1: Create an API key at cursor.com/dashboard/api (open that"
   echo "URL directly). Copy the key, then press Enter here."
   while true; do
     read -r
     KEY=$(pbpaste | tr -d '[:space:]')   # Linux: xclip -o instead of pbpaste
     case "$KEY" in
       sk-ant-*) echo "That's a Claude token, not a Cursor key - copy the Cursor one, press Enter." ;;
       sk-*) echo "That's an OpenAI key, not a Cursor key - copy the Cursor one, press Enter." ;;
       *) [ \${#KEY} -gt 20 ] && break; echo "Too short - copy the WHOLE key, press Enter." ;;
     esac
   done
   echo "STEP 2: verifying for real (the output is the check - the exit"
   echo "code lies)..."
   OUT=$(CURSOR_API_KEY="$KEY" cursor-agent models 2>&1)
   case "$OUT" in
     *"Available models"*)
       printf '%s' "$KEY" | gh secret set CURSOR_API_KEY --repo {{REPO}}
       echo "DONE - verified and saved." ;;
     *"API key is invalid"*|*"Authentication required"*|*Unauthorized*)
       echo "Cursor rejected the key - create a fresh one at"
       echo "cursor.com/dashboard/api and rerun this script."
       exit 1 ;;
     *)
       echo "Couldn't check the key - Cursor answered with something"
       echo "unexpected. Rerun this script; if it keeps failing, is"
       echo "cursor-agent installed and up to date?"
       exit 1 ;;
   esac
   \`\`\`

   Never store a key that failed the live verification.`;

export const CLAUDE_SMOKE_NOTE =
  "A bad\n   Claude token fails within ~20 seconds with \\`authentication_failed\\`;";

export const CODEX_SMOKE_NOTE =
  "A bad\n   OpenAI key fails within ~20 seconds at the resolve-the-agent step,\n   which names the broken secret outright;";

export const CURSOR_CREDENTIAL_BRIEF =
  '"You will create a Cursor API key when we get to secrets - one browser ' +
  'page (cursor.com/dashboard/api), about a minute, and we will VERIFY it ' +
  'works with a real call before it goes anywhere. The builds run where no ' +
  'browser exists, so your interactive login does not reach them - only the ' +
  'key does." On a LOCAL backend say instead: "No key step here - your builds ' +
  "run in the builder container, which gets its key in the wizard's " +
  'automatic-builds step."';

export const CURSOR_SMOKE_NOTE =
  "A missing or\n   cross-pasted Cursor key fails at the resolve-the-agent step, which\n   names CURSOR_API_KEY outright; a revoked one is rejected by Cursor on\n   the first call and classified loudly;";

// Keyed lookups over the per-agent halves above. Record<AgentId, …> makes a
// new agent a compile error here until its install text exists - the
// `codex ? X : Y` ternaries these replaced would have silently handed a
// third agent one of these two texts. All three registered agents run the
// builders today; a future connect-only agent must get entries that SAY so
// (stop and point at Settings) rather than inventing a credential flow no
// builder will ever read.
export const AGENT_CREDENTIAL_STEP: Record<AgentId, string> = {
  claude: CLAUDE_CREDENTIAL_STEP,
  codex: CODEX_CREDENTIAL_STEP,
  cursor: CURSOR_CREDENTIAL_STEP,
};

export const AGENT_CREDENTIAL_BRIEF: Record<AgentId, string> = {
  claude: CLAUDE_CREDENTIAL_BRIEF,
  codex: CODEX_CREDENTIAL_BRIEF,
  cursor: CURSOR_CREDENTIAL_BRIEF,
};

export const AGENT_SMOKE_NOTE: Record<AgentId, string> = {
  claude: CLAUDE_SMOKE_NOTE,
  codex: CODEX_SMOKE_NOTE,
  cursor: CURSOR_SMOKE_NOTE,
};

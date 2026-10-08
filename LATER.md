# LATER - deferred, out of MVP scope

Things that were tempting but deliberately not built. Add here instead of building.

- **ANTHROPIC_API_KEY beyond the Actions pipeline** (queued 2026-08-05, when
  Anthropic's `oauth_org_not_allowed` flag killed a paying customer's builds and
  the only escape hatch was Codex). The GitHub-Actions workflows now fall back
  to an `ANTHROPIC_API_KEY` repo secret when no subscription token exists, and
  every alert names that path - but it's repo-secret-only. Not built: a
  dashboard credential box for the key (registry `credential` entry, wizard tab,
  storage-time live verification like Codex's), the docker in-stack builder
  (`docker/builder/run.sh` only reads `CLAUDE_CODE_OAUTH_TOKEN`), and an
  `instance_settings` column for self-host. Build these if more than the one
  customer hits the flag, or if Anthropic's bug cluster (open since 2026-05)
  keeps growing.

- **Cross-post shipped guides via Postiz** (idea from Postiz's 2026-07 "AI slop SEO" blog
  post). After a guide merges, chop it into platform posts (X thread, LinkedIn) and
  schedule via Postiz (open source, 28+ platforms) so distribution feeds back into
  rankings. Deferred: needs a Postiz instance/account + per-project tokens (real manual
  setup per user), value unproven for connected sites. Revisit if shipped guides
  consistently rank but get no discovery-platform citations. The two steals from the
  same post that WERE built (2026-07-20): viral seed_url flowing trend-scan →
  trend-expand → build-guide, and the seeded-guide enrichment rules.

- **First-boot setup wizard - BUILT 2026-07-19**, same day it was queued (owner's
  call during the deploy-button test). /setup walks a fresh deploy through connect-db →
  run-migrations → claim (password chosen there, scrypt hash in instance_settings,
  migration 0026 applied); MCP + cron keys are generated at claim time (2026-07-26:
  their reveal screen is gone - claiming goes straight to /onboarding, and both keys
  stay readable on Settings).
  Deploy buttons ask for nothing. Env vars remain as overrides, so classic installs
  (including prod) are untouched - verified live against the real DB, plus a
  claim-and-login E2E in the browser.

- **Retire the REST weekly-opportunities cron** once the Claude-driven weekly research
  workflow (Phase 4, seo-weekly-research.yml) is verified: remove it from `vercel.json`,
  keep the route as a manual fallback. Superseded because keyword research now derives
  from the agent's product knowledge at run time (approved 2026-07-13).

- **Telegram / failure notifications for crons.** Spec marks it optional. For now crons
  return HTTP 500 on failure so Vercel's run log shows the failure. Add a webhook ping later
  if silent failures become a problem. (2026-07-13 review promoted this to a Phase 6 build item,
  gap A4 in SPEC.md - crons are now load-bearing, silent failure is a real risk.)
  **Update 2026-07-20:** largely built - cron failures email via Resend + show on the Home
  banner (`cron-alerts.ts`), a post-deploy smoke test (`deploy-check.yml` +
  `/api/cron/deploy-check`) catches broken deploys the moment they go live, the SEO
  workflows report their run outcomes to the same rails, and `secrets-canary.yml`
  validates the token/key machinery every 6h. Telegram/webhook specifically remains
  unbuilt.

- **Propagate outcome reporting + canary to connected project repos.** The report step
  and secrets canary live only in THIS repo's workflows for now. Connected repos run
  pipeline-pack copies and authenticate with their project MCP token, not CRON_SECRET -
  porting this needs the report endpoint to accept project-token auth (scoped to a
  `job` prefixed per project) plus a pipeline-pack bump. Do it when a second site's
  workflow failure actually goes unnoticed.
- **Config table for seed keywords.** Seeds live in the `SEED_KEYWORDS` env var (editing
  needs a redeploy). Move to a DB table only if the edit cadence gets annoying.
- **Exact cron timing.** Vercel Hobby crons fire approximately (within ~an hour) and cap at
  once/day and 2 jobs total. We use exactly 2 (daily ranks + weekly opportunities). Precise
  timing = Vercel Pro concern.
- **Guide-machine retirement/merge.** The existing ClockedCode guide-machine routine
  (04:00 UTC) and the new seo-daily action (05:00 UTC) both open guide PRs. Decision deferred
  to Phase 4: likely pause the guide machine once the seo action is proven and fold the
  tier-list items into the suggestions queue as pre-approved entries. (2026-07-13 review:
  this is now gap A1 in SPEC.md Phase 6 and the top-priority automation - the queue stays a
  notepad until one scheduled builder drains it.)

## Explicitly out of scope (do NOT build)

Chatbot in the dashboard, charting libraries, a light theme, a mobile app.

*(This list used to also name auth, billing, onboarding, DataForSEO metering, and
email notifications - all "never" items in the original single-user MVP spec. The
hosted cloud shipped every one of them, so they came off the list. Self-host keeps
running without any of them.)*

## Deferred - may build later

- **Per-project toggle for the AI-visibility Google check.** The nightly AI Overview
  check costs ~$0.002/keyword/day on the project's own DataForSEO account (disclosed on
  the Automations card, 2026-07-17). A real on/off flag would touch the automation-preset
  matching logic (modeForFlags), so it waits until an owner actually asks to turn it off.

- **IndexNow workflow in the pipeline pack.** `seo-auto-merge.yml` and
  `seo-tool-validate.yml` dispatch `indexnow.yml` after a merge, but the pack does not
  ship that workflow - repos without one hit the harmless `|| echo` fallback and the
  URL waits for the next crawl. Ship a generic `indexnow.yml` in `templates/pipeline/`
  so every connected repo gets instant Bing/Yandex pings, not just repos that already
  had one (RELIABILITY.md tracks this as Deferred).

- **In-stack builder, v2 niceties (v1 shipped 2026-07-21).** The docker `builder`
  container polls `/api/builder/jobs` and runs due work with headless Claude Code.
  Deferred from v1: (1) a wizard screen that collects CLAUDE_CODE_OAUTH_TOKEN into
  encrypted instance_settings so owners never edit .env; (2) on-demand triggers -
  "Build now" / trend-scan / trend-expand still fire repository_dispatch to GitHub,
  the jobs feed should carry them for localhost instances; (3) the auto-merge sweep
  covers guide PRs only - validated tool PRs (tool-validated label) still wait for
  the owner on docker; (4) a GitHub App instead of the PAT, for zero-token setup;
  (5) install instructions could skip shipping schedule workflows entirely when the
  backend is a docker instance with the builder on.

- **Retired Vercel/Supabase self-deploy leftovers (retired 2026-07-22).** The
  free-cloud self-deploy path is gone from every public surface; docker is the
  one self-host story. Still-working but unadvertised code that can be removed
  once no legacy installs depend on it: the Supabase/Vercel walkthrough screens
  in `src/app/setup/page.tsx` (docker installs never render them), and the
  `stores=` deploy-URL handling notes in docs history. If demand for one-click
  hosts shows up, the Postiz answer is third-party templates (Railway/Coolify/
  Elestio), not a revived Vercel path.

- **Flip landing self-host prominence at cloud launch.** Today the landing
  leads with self-host (hero button, OSS section, $0 pricing column) because
  the OSS repo is the growth engine pre-launch. When the paid cloud opens,
  switch to the Postiz layout: cloud CTAs primary everywhere, self-host demoted
  to footer/docs links and a pricing-page FAQ entry.

- **Optional in-stack Caddy for VPS installs.** A `caddy` service in
  docker-compose (profile-gated, off by default): owner sets
  `DOMAIN=dispatch.example.com` in `.env`, start.sh brings Caddy up on
  80/443 and HTTPS just happens - no host-level install, no Caddyfile.
  Would collapse the VPS guide's step 5 into one env var. Not a launch
  blocker: DNS + open ports remain manual either way, and it conflicts
  with proxies users already run, so it must stay opt-in.

- **Cloud OAuth redirect: pin the origin (flagged by automated security review
  2026-07-22).** `src/app/auth/google-action.ts` derives the Supabase OAuth
  `redirectTo` from `x-forwarded-host`. Not exploitable today (Vercel controls
  the forwarded headers and Supabase enforces its redirect allowlist), but the
  cloud-hardening pass should pin it to a deploy-time origin env instead of
  request headers - belongs to the CLOUD_MODE workstream.

- **Cloud: built-in alert email, zero config (CLOUD_MODE workstream).** On
  the cloud deployment, failure alerts must work without the user setting
  anything: our `RESEND_API_KEY` in the Vercel env, sender
  `alerts@dispatchseo.com` (verify the domain in Resend first - as of
  2026-07-20 the live sender is still alerts@clockedcode.com), recipient =
  the signed-in user's account email instead of a global `ALERT_EMAIL`.
  Self-host stays bring-your-own-key on purpose: shipping our key in a
  public repo is impossible, a relay endpoint is a spam/deliverability
  liability, and phoning home breaks the self-host promise. "Alerting built
  in" becomes a cloud-vs-self-host comparison row.

- **Demote a live page that starts 404ing.** 0033 verifies a page live once
  (first HTTP 200) and never re-checks. A guide later unpublished/renamed
  keeps showing as live until someone notices. A slow background sweep
  (daily cron, a few pages per run) could flip `live_at` back to null on
  sustained 404s - deferred because deletes/renames are rare, GSC
  impressions dropping to zero already hints at it, and false demotions
  (WAF, transient outage) are worse than a stale "live".

- **Project key rotation** - a "rotate key" action on Settings (+ matching MCP tool per the parity rule): generates a new mcp_token, shows the new connect command, old token dies instantly. The revocation story for URL-borne keys (?key= connect form) and for any leaked token; today the only revocation is deleting the project.

- **Proactive "trend radar needs a public URL" callout** (2026-08-02 audit). On a
  docker install with no DOMAIN, trend-scan/trend-expand can't run (GitHub Actions
  can't phone home to a loopback APP_URL). trendsUnreachable() already says so
  honestly - but only after the owner clicks "Scan now". Add a line to the wizard
  finale / Home so no-domain installs learn the trade-off before they hunt for the
  feature. Deferred: honest-on-click today, nobody has hit it confused yet.

- **Wizard finale verifies first research landed** (2026-08-02 audit). FirstRunStatus
  flips "done" on pipeline_installed alone; the install agent says "research lands in
  ~10-20 min" and ends. Add an ideas_queued (or first cron_runs row) check to the
  checklist so "installed but first research never ran" is visible on the same screen
  that promised it. Deferred: builder fail-rows (added same day) now cover the loud
  half; this is the belt to those suspenders.

- **Repo-wide sweep for compiler-eaten JSX spaces** (2026-08-02). This Next/SWC build
  drops the leading space of a text node that follows an inline element when the text
  wraps to the next source line (`<code>gh</code> there.⏎ works` rendered "ghthere" in
  prod). Fixed at the wizard site with explicit {" "}; every other `</b>`/`</code>`/
  `</a>` followed by wrapped prose is suspect. Sweep = grep candidates, eyeball the
  compiled chunks, add {" "} where eaten.

- **Consolidate agent-header-switch's credential hint onto MintLink** (2026-08-02
  review nit). The popover's how-to-mint block duplicates MintLink's
  command-vs-link branching with slightly different rendering; one component should
  own it. Cosmetic, sizes differ (text-xs popover vs text-sm card) - needs a small
  size prop, not a copy-paste.

- **Measure Cursor's headless web-search permission, then wire it on** (2026-08-06
  audit). Cursor CLI reportedly gates its web_search tool behind an
  `autoAcceptWebSearch` permission that `--trust/--force/--approve-mcps` do NOT
  cover - if true, geo-scan on a Cursor project can't sample real answers and only
  the playbook's fail-don't-fabricate rule stands between that and invented
  AI-visibility rows. Needs one measurement run with pool available (ask for a web
  search, inspect the result + cli-config.json), then the config write in
  cursor.mjs + run.sh, and a CURSOR_FACTS entry either way. Same sweep should port
  run.sh's Codex `web_search = true` line to the CI generator - the docker builder
  enables it for Codex, the GitHub Actions path never did.

- **Cursor canary should exercise the GENERATED config step** (2026-08-06 audit).
  cursor-canary.yml hand-rolls its mcp.json with jq, so its green run never
  tested the shipped render step - which is exactly where a no-op substitution
  bug hid. Either generate the canary's config step from scripts/agent-ci/, or
  add a canary assertion that the rendered file contains no `${` placeholder.

- **Setup path follow-ups (the hosted setup path shipped 2026-10-05).** Kept out of
  that build on purpose:
  - **Self-host port of the step engine.** `src/lib/setup-path-core.ts` is
    client-safe and branch-aware so the self-host wizard can use it later;
    `connectSteps` just needs the self-host (`s_*`) equivalents. The self-host
    wizard is untouched until then.
  - **Atomic jsonb / array writes for the path.** `install_progress` and `setup_deferred`
    are read-merge-write from supabase-js (no `array_append` / jsonb `||` there), so two
    writers landing in the same instant can lose one key or one parked id. Rare and
    self-healing today (the engine re-derives from evidence, and the connect-phase claim
    is already one conditional update); the fix is a small Postgres RPC
    (`jsonb_set` / `array_append` in one statement) if it ever shows up.
  - **ChatGPT connector.** ChatGPT stays "not available yet" everywhere it is shown.
  - **Onboarding / nudge emails.** None exist today; the path adds none.
  - **"Send this step to my developer" link.** A magic link on the technical steps that
    can't be parked (`github_app`, `agent_credential`): "Send to the person who built
    the site", so a non-technical owner can hand that one step off.
  - **Delete the legacy cloud wizard** once the `SETUP_PATH_LEGACY` flag is retired, on
    Neo's say-so: `cloud-onboarding-wizard.tsx`, `chat-next-steps.tsx`,
    `first-run-status.tsx`'s cloud use, and the `setWizardScreen` action.

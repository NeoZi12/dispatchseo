# LATER - deferred, out of MVP scope

Things that were tempting but deliberately not built. Add here instead of building.

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
  migration 0026 applied); MCP + cron keys are generated/revealed at /setup/keys.
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

## Explicitly out of scope (do NOT build - from the spec)
Auth/multi-user, billing, onboarding, DataForSEO proxying/metering, email notifications,
chatbot in dashboard, charts libraries, dark mode, settings pages, mobile app.

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

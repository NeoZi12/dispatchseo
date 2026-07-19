# LATER - deferred, out of MVP scope

Things that were tempting but deliberately not built. Add here instead of building.

- **First-boot setup wizard** (queued 2026-07-19, owner's call during the deploy-button
  test). Today the deploy form asks the user to invent MCP_API_KEY / CRON_SECRET /
  DASHBOARD_PASSWORD because at deploy time no app or database exists to generate or
  store them - env is the only storage alive at that moment. The better UX is the
  WordPress/Ghost pattern: deploy with zero secrets, first visit shows a claim-your-
  instance screen that sets the password (hash in DB, env stays as fallback), generates
  the MCP + cron keys itself, and shows them once. Needs: setup page, password-in-DB
  auth path, no-DB-yet handling, and closing the unclaimed-instance race. ~a day. The
  single best onboarding improvement before or right after launch week.

- **Retire the REST weekly-opportunities cron** once the Claude-driven weekly research
  workflow (Phase 4, seo-weekly-research.yml) is verified: remove it from `vercel.json`,
  keep the route as a manual fallback. Superseded because keyword research now derives
  from the agent's product knowledge at run time (approved 2026-07-13).

- **Telegram / failure notifications for crons.** Spec marks it optional. For now crons
  return HTTP 500 on failure so Vercel's run log shows the failure. Add a webhook ping later
  if silent failures become a problem. (2026-07-13 review promoted this to a Phase 6 build item,
  gap A4 in SPEC.md - crons are now load-bearing, silent failure is a real risk.)
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

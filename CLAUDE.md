# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DispatchSEO is free SEO automation for small websites: it researches keywords
with real search demand, writes fact-checked articles and publishes them to the
site, as pull requests to a GitHub repo. The hosted product
lives at dispatchseo.com (two articles a month free, paid plans for 5, 15 or 30
articles a month on up to 5 websites). This open-source repo is the same
product to self-host, driven by your own coding agent (Claude Code, Codex or
Cursor) over MCP.

Under the hood it is a multi-tenant "SEO manager" backend. One Vercel
deployment manages many sites: it exposes an **MCP server** that an external
Claude Code agent drives to research keywords and queue content ideas, runs
**crons** that track SERP ranks + Google Search Console stats, and hosts a
password-gated **dashboard** to approve ideas and merge the resulting PRs. The
agent does the thinking; this backend is state + scheduling + the door to that
state. See `docs/SPEC.md` for the original spec (phase history and launch
planning live in the maintainer's untracked `docs-private/`).

## Commands

Package manager is **pnpm**. There is no lint or test script — `pnpm build`
(which runs `tsc` via `next build`) is the type/build check.

```bash
pnpm dev      # next dev on localhost:3000 (first checks main vs origin: scripts/dev-sync.mjs)
pnpm build    # production build + typecheck (use this to verify changes)
pnpm start    # serve the production build

# one-off maintenance scripts (require .env.local loaded), e.g.:
node scripts/backfill-gsc.mjs
node scripts/gate-test.mjs        # smoke-tests the MCP bearer gate
```

Env lives in `.env.local` (template: `.env.local.example`). The production app
is served at **`dispatchseo.com`** (custom domain). The old
`seo-manager-backend.vercel.app` alias no longer resolves (returns 404), so any
external caller — GitHub Actions crons especially — must target `dispatchseo.com`.
The Vercel *project* may still be internally named `seo-manager-backend`; that is
just the dashboard label and does not affect the public URL.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind v4 (`@tailwindcss/postcss`,
no config file) · Supabase (service-role) · `mcp-handler` + `@modelcontextprotocol/sdk`
· DataForSEO + `googleapis` (GSC). Path alias `@/*` → `./src/*`.

### The tenant axis (read this first)

`src/lib/projects.ts` is the single place that answers "which site". Every
operational table carries a `project_id`; the three entry points each resolve a
project a different way, then scope every query to it:

| Entry point | Resolves project via | Code |
|---|---|---|
| Dashboard | `dash_project` cookie → slug | `active-project.ts` → `getActiveProject()` |
| MCP server | **bearer token IS the tenant** | `getProjectByToken()` |
| Crons | loop over `listProjects()` | each cron route |

The default project **ClockedCode** has a fixed id
`00000000-0000-4000-8000-000000000001`, which is also the column default on
every table, so pre-multi-tenant writes still land somewhere valid. When a
Supabase query errors (e.g. a migration hasn't run yet), `projects.ts`
synthesizes an env-fallback ClockedCode project so the deploy keeps working —
`site_profile` and `playbook_status` use the same tolerance pattern. The legacy
`MCP_API_KEY` env token keeps resolving to ClockedCode so existing CI secrets
never need rotation.

### MCP server — `src/app/api/[transport]/route.ts`

- Lives at `api/[transport]` with `basePath: "/api"`, so the connectable URL is
  **`/api/mcp`** (transport = `mcp`). Streamable HTTP (no SSE, no Redis).
- `authed()` wraps the handler: extracts the `Bearer` token → `getProjectByToken`
  → runs `mcpHandler` inside `projectStore.run(project, …)`. Tools read
  `currentProject()` from that `AsyncLocalStorage` (`mcp-context.ts`) instead of
  threading a project param through `mcp-handler`'s registration API.
- **The MCP is ONLY a door to Supabase state** — the suggestions queue,
  keywords, pages, GSC stats, backlink prospects, site profile. It does NOT call
  DataForSEO or generate content. The agent reasons and uses DataForSEO's own
  MCP for raw research. Don't add research/generation tools here.
- **Exception that proves the rule: `get_instructions`** serves the
  centrally-versioned agent playbook (`src/lib/instructions/`) — content-as-state,
  like `get_playbook`. Connected repos keep only a thin shim (GitHub workflows +
  a `.dispatchseo/conventions.md` of site facts that the `setup` workflow writes);
  every automation fetches its instructions from this tool before acting, so
  editing `src/lib/instructions/` updates every project's next run. Bump
  `INSTRUCTIONS_VERSION` on every meaningful edit; smoke-test with
  `node --env-file=.env.local scripts/mcp-instructions-test.mjs` (dev server up).
- **The dashboard is fully controllable via MCP, and stays that way** — every new
  dashboard capability needs a matching tool here. See the parity rule under
  Conventions & gotchas.
- Tools return pretty-printed JSON text via the `ok()` / `fail()` helpers.
- Approving a suggestion of type `tool` fires a `repository_dispatch` to wake the
  project repo's builder workflow immediately (`dispatchToolBuild`); guides wait
  for the daily cron.

### Data layer — `src/lib/db.ts`

`db()` returns a cached **service-role** Supabase client that bypasses RLS.
There is no user auth — every caller is trusted server code (MCP tools + crons).
Tables have RLS enabled with **zero policies**, so only the service-role key can
touch them. **Never import `db.ts` into anything that ships to the browser.**

### Auth (single user, gated at the edge)

- **Dashboard:** password gate in `dashboard-auth.ts`. Login is a server action
  that sets an HMAC-of-a-fixed-message cookie (`dash_auth`) keyed by
  `DASHBOARD_PASSWORD`; changing the password invalidates all sessions. There is
  no `middleware.ts` — its Next 16 successor is **`src/proxy.ts`**, which gates
  every non-allowlisted path on cookie *presence* (`dash_auth`, or a Supabase
  `sb-*-auth-token` in `CLOUD_MODE`) and 307s the rest to `/login`. Presence is
  only routing: every protected page still checks
  `isValidCookie(jar.get("dash_auth")?.value)` itself and `redirect("/login")`,
  so a forged cookie renders nothing. New dashboard pages must add that guard —
  and **any new route a logged-out visitor must reach (a public page, a script,
  an image) has to be added to `src/proxy.ts`'s allowlist or it 307s to `/login`
  in production.** Self-host rarely notices (no `LANDING_ENABLED`); cloud always
  does.
- **Crons:** `checkCron()` requires `Authorization: Bearer ${CRON_SECRET}`.
- **MCP:** per-project `mcp_token` (or legacy `MCP_API_KEY` → ClockedCode).

### Crons — split across two schedulers

The split dates from Vercel Hobby (once/day, 2 jobs); the project is on Pro now:

- `vercel.json` runs daily-ranks, jobs, autopilot, hourly-gsc and serp-collect.
  hourly-gsc and serp-collect moved there 2026-11-10 because GitHub fired their
  schedules 8-13 h apart and painted "overdue" on Home with nothing broken.
- Other frequent crons live in `.github/workflows/*.yml`, which `curl` the
  backend cron endpoints with `CRON_SECRET`. `hourly-gsc.yml` and
  `serp-collect.yml` keep their schedules as a backup (both routes are idempotent).
- Routes: `src/app/api/cron/{daily-ranks,hourly-gsc,weekly-opportunities,seo-dispatch,serp-collect,jobs,heartbeat,deploy-check}/route.ts`
  (self-host schedules live in `docker/cron/crontab`, whose header documents
  which routes are deliberately excluded there and why).

Every cron loops all projects and **isolates failures** with
`Promise.allSettled` — one project or one half (SERP vs GSC) failing must not
kill the rest — then returns **HTTP 500 if anything failed** so the Vercel run
log surfaces it. Every route also calls `reportCronRun()` (`cron-alerts.ts`):
runs log to `cron_runs`, failures show on the dashboard Home banner and the
`get_cron_health` MCP tool, and email the owner via Resend (debounced per job).
One deliberate exception: **`heartbeat`** is a single global ping to
`dispatchseo.com` (anonymous self-host install count), not a per-project loop,
and skips `reportCronRun()` on purpose — a failed heartbeat costs this project
one data point and costs the owner nothing, so it must never reach the
banner/email rail (`src/lib/heartbeat.ts`).

**Post-deploy smoke test:** every push to main triggers
`.github/workflows/deploy-check.yml`, which polls
`/api/cron/deploy-check?expect=<sha>` until Vercel serves the pushed commit,
lets the endpoint self-check its internals (core tables, project resolution,
GSC creds), then probes `/login`, the MCP gate (tokenless → 401 AND valid key
→ 200) from outside. Failures ride the same `cron_runs` → banner → email
rails, so a broken deploy announces itself instead of surfacing as morning
cron errors.

**Workflow outcome reporting + secrets canary:** the SEO workflows
(seo-daily, seo-auto-merge, seo-tools, seo-trend-scan, seo-trend-expand,
seo-weekly-research) end with a "Report outcome to the dashboard" step that
calls `/api/cron/deploy-check?job=<name>&ok=1|&fail=<msg>` — workflow
failures hit the banner + email instead of dying quietly in the Actions tab
(seo-tool-validate reports from its MERGE job only. Its validate job is NOT
secret-free: it builds and serves the PR's LLM-authored code and then runs
the validator agent with the Claude token in the same job, so PR code and the
agent credential share a runner. Splitting that job is tracked in LATER.md). `secrets-canary.yml` runs
every 6h validating CRON_SECRET, the Claude token's shape (the line-wrapped
paste gotcha), and that the backend accepts SEO_MCP_API_KEY — so a rotted
secret is flagged hours before the overnight builders die on it. Any new
scheduled workflow should add the same report step and, if relevant, a
`STALE_HOURS` entry in `cron-alerts.ts`.

### DataForSEO (`dataforseo.ts`) & GSC (`gsc.ts`)

Free-tier DIY: **each project brings its own DataForSEO account**, so every call
bills the project owner. `credsForProject()` resolves a project's creds; only
the default project falls back to `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` env.
A project without creds gets `null` and paid features skip gracefully. GSC uses
a service-account JSON (`GSC_SERVICE_ACCOUNT_JSON`); it's free, hence the hourly
re-snapshot.

## Conventions & gotchas

- **Crons never run what setup hasn't finished.** Every per-project capability
  a cron touches must pass a readiness check first (pattern:
  `src/lib/gsc-readiness.ts` + the setup gates at the top of each cron route's
  `runProject`). Unmet setup returns `{ skipped: "setup incomplete: …" }` —
  informational, never `hadError`/HTTP 500/alert email — because onboarding
  deliberately leaves projects half-set-up (it even guesses a GSC property
  before the owner grants access), so "prerequisite missing" is a normal state,
  and the Home "Initial setup" cards are the user-facing surface for it.
  Loudness is reserved for regressions: a capability that has verifiably worked
  before (data rows exist / creds validated at save time) and fails now must
  keep failing loudly (banner + email). Any new cron, or new per-project
  prerequisite in an existing cron, must implement this split — never let a
  mid-setup project 500 a run.
- **Every feature ships with an MCP version.** The dashboard and the MCP server
  are two faces of the same state — anything the dashboard can do, the agent must
  be able to do over MCP, and vice versa. A feature is not done until both exist.
  In practice: put the logic in a `src/lib/` module, then call it from the
  dashboard server action *and* register the matching MCP tool in
  `src/app/api/[transport]/route.ts` — never implement it inside the server
  action and leave MCP behind. This does not license research/generation tools
  (see the MCP section); the parity rule is about *state* — reads, writes,
  approvals, ordering, config. If a surface genuinely can't have a counterpart
  (e.g. a purely visual chart, or operator-only telemetry with no per-tenant
  state and nothing an agent should read or set, like the self-host heartbeat),
  say so in the PR rather than skipping quietly. The mirror of this rule:
  a tool that exists must be listed in `src/content/docs/mcp-tools.mdx` — an
  undocumented tool is one the agent never learns it has.
- **Migrations** (`supabase/migrations/NNNN_*.sql`) are numbered, additive, and
  zero-downtime — new columns use `ADD COLUMN … DEFAULT <clockedcode id>` so
  in-flight code keeps writing valid rows. Add a new numbered file rather than
  editing an existing one; they are applied to Supabase manually (no migration
  runner wired into the build).
- **Every migration must also apply on vanilla Postgres — the docker stack
  replays the concatenated `setup.sql` on every boot.** Supabase-only objects
  (the `auth` schema, `auth.uid()`, storage) must be guarded in a `DO` block
  that checks the object exists (pattern: `0031_cloud_users.sql`); an
  unguarded reference breaks every self-host install at first boot. After any
  migration change, run `node scripts/generate-setup-sql.mjs` and commit the
  regenerated `setup.sql` — CI (`migrations-vanilla-postgres.yml`) applies it
  twice against `postgres:17-alpine` and fails the push otherwise.
- **Nothing in `templates/pipeline/` may depend on an install-time edit whose
  omission is fatal.** The installer is an agent adapting an unfamiliar repo, so
  "usually adapts it correctly" is not a safety property when the failure mode
  is a permanently dead pipeline. Encode the decision in the workflow so it
  resolves at run time in the repo (two mutually-exclusive steps with `if:`
  conditions), rather than leaving an `INSTALL-ADAPT: … DELETE this line`
  comment. The rule exists because that exact comment on the pnpm setup step
  killed the builder in every installed repo carrying a `packageManager` pin on
  2026-07-30 — at step 2, before the step that reports failures, so it died
  silently as well. `scripts/pipeline-pack-lint.mjs` (a `pr-check` gate) fails
  the build on that shape, and `pr-check`'s `pnpm-setup-shapes` job executes the
  shipped setup path against a pinned and an unpinned fixture, because a
  template nobody ever runs is first run by customers.
- Any new operational table needs a `project_id` (default the ClockedCode id) and
  its uniqueness constraints scoped per-project — see `0004_projects.sql`.
- Server-only modules (`db.ts`, anything touching the service role or secrets)
  must never end up in a client component bundle.
- **User-visible work gets a changelog line; only a release cut announces it.**
  Append the line to `UNRELEASED` in `src/lib/changelog.ts` (owner's language,
  not the commit subject) and stop there — that list is invisible on purpose.
  Cutting a release is a separate, deliberate act, and only ever on the
  maintainer's say-so: the staged lines move into a new `CHANGELOG` entry with a
  semver `version`, a title and a summary, and `UNRELEASED` empties. **Never cut
  one unprompted** — that entry hits the `/changelog` page, the `get_changelog`
  MCP tool and a permanent post in the public Discord, all at once. The
  dashboard "DispatchSEO has been updated" banner is a separate, rarer opt-in:
  it fires only when the entry sets `announce: true`, which is the maintainer's
  call alone — default is silent, reserved for a release owners should stop and
  look at. Six releases went out on 2026-07-31 alone, which
  is what versions exist to stop; a day of work is one release, and a quiet week
  is fine. Bump minor for anything new, patch for fixes, major only for
  something a self-hoster must act on. Versions are anchor ids, cookie values
  and Discord deep links: never reuse, renumber or reorder one. Internal-only
  work ships without a line at all.
- Deferred/out-of-scope ideas go in `LATER.md`, not into code. The ethos is
  "working > pretty", single-user, no over-engineering.

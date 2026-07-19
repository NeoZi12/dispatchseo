# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DispatchSEO — a single-owner, multi-tenant "SEO manager" backend. One Vercel
deployment manages many sites: it exposes an **MCP server** that an external
Claude Code agent drives to research keywords and queue content ideas, runs
**crons** that track SERP ranks + Google Search Console stats, and hosts a
password-gated **dashboard** to approve ideas and merge the resulting PRs. The
agent does the thinking; this backend is state + scheduling + the door to that
state. See `docs/SPEC.md` for the original spec and `docs/PHASE4_HANDOFF.md`
for phase history.

## Commands

Package manager is **pnpm**. There is no lint or test script — `pnpm build`
(which runs `tsc` via `next build`) is the type/build check.

```bash
pnpm dev      # next dev on localhost:3000
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

### Auth (single user, no middleware)

- **Dashboard:** password gate in `dashboard-auth.ts`. Login is a server action
  that sets an HMAC-of-a-fixed-message cookie (`dash_auth`) keyed by
  `DASHBOARD_PASSWORD`; changing the password invalidates all sessions. There is
  **no `middleware.ts`** — every protected page checks
  `isValidCookie(jar.get("dash_auth")?.value)` itself and `redirect("/login")`.
  New dashboard pages must add this guard.
- **Crons:** `checkCron()` requires `Authorization: Bearer ${CRON_SECRET}`.
- **MCP:** per-project `mcp_token` (or legacy `MCP_API_KEY` → ClockedCode).

### Crons — split across two schedulers

Vercel Hobby caps crons at once/day and 2 jobs total, so schedules are split:

- `vercel.json` runs only **daily-ranks** (`0 4 * * *`).
- Higher-frequency crons live in `.github/workflows/*.yml`, which `curl` the
  backend cron endpoints with `CRON_SECRET` (e.g. `hourly-gsc.yml` at `:07`).
- Routes: `src/app/api/cron/{daily-ranks,hourly-gsc,weekly-opportunities}/route.ts`.

Every cron loops all projects and **isolates failures** with
`Promise.allSettled` — one project or one half (SERP vs GSC) failing must not
kill the rest — then returns **HTTP 500 if anything failed** so the Vercel run
log surfaces it (there is no failure-notification channel yet; see `LATER.md`).

### DataForSEO (`dataforseo.ts`) & GSC (`gsc.ts`)

Free-tier DIY: **each project brings its own DataForSEO account**, so every call
bills the project owner. `credsForProject()` resolves a project's creds; only
the default project falls back to `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` env.
A project without creds gets `null` and paid features skip gracefully. GSC uses
a service-account JSON (`GSC_SERVICE_ACCOUNT_JSON`); it's free, hence the hourly
re-snapshot.

## Conventions & gotchas

- **Every feature ships with an MCP version.** The dashboard and the MCP server
  are two faces of the same state — anything the dashboard can do, the agent must
  be able to do over MCP, and vice versa. A feature is not done until both exist.
  In practice: put the logic in a `src/lib/` module, then call it from the
  dashboard server action *and* register the matching MCP tool in
  `src/app/api/[transport]/route.ts` — never implement it inside the server
  action and leave MCP behind. This does not license research/generation tools
  (see the MCP section); the parity rule is about *state* — reads, writes,
  approvals, ordering, config. If a surface genuinely can't have a counterpart
  (e.g. a purely visual chart), say so in the PR rather than skipping quietly.
- **Migrations** (`supabase/migrations/NNNN_*.sql`) are numbered, additive, and
  zero-downtime — new columns use `ADD COLUMN … DEFAULT <clockedcode id>` so
  in-flight code keeps writing valid rows. Add a new numbered file rather than
  editing an existing one; they are applied to Supabase manually (no migration
  runner wired into the build).
- Any new operational table needs a `project_id` (default the ClockedCode id) and
  its uniqueness constraints scoped per-project — see `0004_projects.sql`.
- Server-only modules (`db.ts`, anything touching the service role or secrets)
  must never end up in a client component bundle.
- Deferred/out-of-scope ideas go in `LATER.md`, not into code. The ethos is
  "working > pretty", single-user, no over-engineering.

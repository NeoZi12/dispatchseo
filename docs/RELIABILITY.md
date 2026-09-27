# Reliability

The product goal: after one-time setup, a default-configuration user never
sees an error. This file is the doctrine that goal follows from, plus a
running register of the failure modes it was built to close. Update the
register whenever a new one is found or fixed; update the design rules only
when the doctrine itself changes.

## The contract

A failure this backend can reach is either prevented at setup, so it never
happens to a correctly-installed instance, or it happens anyway and
self-heals on the next scheduled attempt without anyone noticing. When
neither is possible, it surfaces as exactly one actionable alert - the
dashboard banner, and an email if one is configured - that names the fix. A
default-configuration user should never need to read an Actions log or a
Vercel function log to learn something broke; if they never see a banner,
nothing needs their attention.

## Design rules

- **Every workflow reports its outcome home, keyed to the project.** A job
  that never calls back is invisible the moment its own Actions log scrolls
  away. Every workflow ends with a call to `/api/cron/deploy-check?job=<name>`
  (`ok=1` or `fail=<message>`), authenticated with either `CRON_SECRET` (this
  repo) or the calling project's own MCP token (connected repos never hold
  the instance-wide secret) - see `checkCron()` and `reportCronRun()`.
- **No failure may exist only in an Actions log.** If the only trace of a
  broken run is GitHub's UI, it isn't reported - a default user has no reason
  to ever open that tab. The dashboard banner and the `get_cron_health` MCP
  tool are the only places a default user, or their agent, actually looks.
- **A green run that did nothing is a failure.** A workflow that "succeeds"
  because it silently found nothing to do - a stale MCP URL, an empty
  toolset, a label that doesn't exist - is worse than a red one: it hides the
  real problem behind a checkmark. Preflights that fail loudly beat
  postflight checks that fail silently.
- **Staleness - the absence of heartbeats - is detected backend-side.** A job
  doesn't have to fail to be broken; it can just stop running. `STALE_HOURS`
  gives every scheduled job an expected cadence, so `get_cron_health` flags a
  job whose last report is older than that window even if that last report
  was a success.
- **Retries are schedule-based and idempotent, never open-ended.** The
  builder runs on a fixed cadence - 05:00 / 12:00 / 19:00 UTC - with a
  built-today guard, so a failed 05:00 attempt gets picked back up at 12:00
  without ever double-building the same suggestion.
- **A usage-limit hit defers quietly instead of failing.** Running out of the
  plan's Claude usage window is an expected, temporary condition, not a bug -
  a run that dies from it should reschedule for the next slot, not raise an
  alert that sends the owner chasing a problem that isn't one.
- **External-API task-level errors must never masquerade as real data.**
  DataForSEO returns a request-level `status_code` and a `status_code` per
  task inside the batch; a task failure that only the outer code checks
  reads as legitimate zero-data, and zero-data is indistinguishable from
  "this keyword genuinely has no ranking."
- **Setup must PROVE, not configure.** A setup step that only writes a
  config value and calls itself done is unverified until something real
  exercises it - the install canary opens and closes an actual throwaway PR
  from inside a workflow, because "Allow GitHub Actions to create pull
  requests" is exactly the kind of repo setting that stays invisible until
  the first real build needs it.
- **Anything bounded must alert when it gives up.** A 3-strikes limit exists
  to stop a job from burning usage on something that will never resolve
  itself - but stopping quietly just moves the silent failure from "retries
  forever" to "gave up once and nobody noticed." Giving up is a valid
  outcome; giving up unreported is not.
- **Per-project scoping applies everywhere, including to health itself.** One
  backend serves many tenants: job names get suffixed `--<slug>` so two
  projects reporting the same job name never overwrite each other, and any
  endpoint that reads health or state back must filter by the calling
  project - an unscoped read leaks one customer's failures into another's
  dashboard.

## Findings register

Audit run 2026-07-20 (5 parallel agents: backend, dashboard, history, setup,
workflows). Rows marked **Fixed** landed the same session, in parallel with
this document; rows marked **Deferred** are tracked here and, where noted,
also in [`LATER.md`](../LATER.md).

| Finding | Status | Note |
| --- | --- | --- |
| Self-host backend URL DOA | Fixed | `backendBaseUrl()` (`src/lib/pipeline-pack.ts`) now chains `APP_URL` env → `instance_settings.app_url` (captured at claim) → `VERCEL_PROJECT_PRODUCTION_URL` → `dispatchseo.com`. Before this, a self-host that never discovered the undocumented `APP_URL` env shipped pipelines wired to the cloud backend - instant 401s on the first CI run. |
| `DATAFORSEO_ENC_KEY` unset on fresh installs | Fixed | `claimInstance()` (`src/lib/setup.ts`) generates and stores `instance_settings.enc_key` at claim time, so "connect DataForSEO" works with zero manual env setup. The env var still wins when set. |
| 8 pipeline templates with no outcome reporting, + CRON_SECRET-vs-project-key trap | Fixed | `templates/pipeline/.github/workflows/*.yml` now report through `/api/cron/deploy-check?job=...`; the route accepts a project's own MCP token as well as `CRON_SECRET`, since connected repos hold only the former. |
| `STALE_HOURS` didn't match `--slug`-suffixed job names | Fixed | Per-project reports arrive as `seo-daily--acme`; the staleness lookup now normalizes the job name before matching `STALE_HOURS`. Previously every suffixed report missed its bare-name entry and read as never-stale. |
| `get_cron_health` leaked every tenant's runs | Fixed | The tool now filters `cron_runs` by the calling project instead of returning the whole table. |
| DataForSEO task-level errors read as zero-data | Fixed | Per-task `status_code` inside a batch response is now checked, not just the request-level code. |
| Stuck `in_progress` suggestions stranded the queue | Fixed | `suggestions.started_at` (migration 0027) plus an hourly recovery sweep reverts a build stuck past its 45-minute workflow timeout back to `approved`. |
| Single-shot builder with no usage-limit handling | Fixed | The builder moved from one 05:00 UTC attempt to 05:00 / 12:00 / 19:00 with a built-today guard; a usage-limit hit now defers to the next slot instead of reporting a failure. |
| `seo`/`seo-tool` labels not guaranteed to exist | Fixed | Setup now pre-creates both PR labels; the install canary opens its throwaway PR with `--label seo` so a missing label fails at install time, not on the first real build. |
| Token-check's own report call swallowed a dead MCP key | Fixed | The report call now confirms its own delivery instead of firing-and-forgetting - a revoked project token no longer defeats the one path meant to alert about it. |
| Auto-merge's 3-strikes give-up was silent | Fixed | The stalled-tool-validation dispatcher in `seo-auto-merge.yml` already capped retries at 3 executed validations per head SHA; giving up now also reports home instead of only logging "leaving PR #n for the owner" to the Actions tab. |
| `daily-ranks` had no per-project time budget | Fixed | The per-project loop inside the 60s function now allocates each project a time slice, so one project's slow SERP calls can't starve the next project's rank check. |
| No migration-completeness gate on `/setup` | Fixed | `/setup` now verifies the full migration set has run (through 0027), not just that `instance_settings` exists, before marking the instance ready. |
| Proactive "gone quiet" email digest | Deferred | No periodic nothing-has-run-in-a-while digest yet; today's alerting is per-job-failure, not per-overall-silence. |
| GitHub workflow-disabled (60-day) probe | Deferred | GitHub auto-disables Actions workflows after 60 days of repo inactivity; the backend doesn't yet probe for that state. |
| Password change UI + `/login` recovery hint | Deferred | No self-service password change; a forgotten `DASHBOARD_PASSWORD` currently has no in-product recovery path. |
| Alert-email nudge card for auto-mode users | Deferred | Auto-mode installs without `RESEND_API_KEY`/`ALERT_EMAIL` set aren't nudged in-dashboard to add them. |
| Raw-error → fix-text rewrite table | Deferred | Some failure paths still surface a raw exception message instead of a rewritten, actionable instruction. |
| Sidebar red-dot badge | Deferred | Background-job trouble shows on the Home banner only; the nav sidebar has no unread/alert indicator yet. |
| PR-age escalation card | Deferred | A PR sitting open past some threshold (stuck check, awaiting review) has no escalating dashboard treatment yet. |
| GSC property picker write-back | Deferred (unless landed this session) | Check `src/app/(dashboard)/google/page.tsx` before relying on this row - the dashboard track was working this area in parallel; update the status once confirmed either way. |
| Conditional `dataforseo` block in `mcp-ci.json` | **Fixed 2026-07-20** | `getPipelinePack()` now strips the `dataforseo` server from `.github/mcp-ci.json` at serve time for projects without DataForSEO credentials (own creds, or env fallback for the default project) - free-mode installs never ship a stdio server wired to blank secrets. |
| `indexnow.yml` | Deferred | Tracked in [`LATER.md`](../LATER.md) ("IndexNow workflow in the pipeline pack"). |

Audit run 2026-08-02 (4 parallel agents: builders, self-host, onboarding,
pipeline), plus the first outside self-host install the same day - which
supplied two of these rows the audit had not reached. Rows marked **Fixed**
landed the same day; **Deferred** rows are tracked here and in
[`LATER.md`](../LATER.md).

| Finding | Status | Note |
| --- | --- | --- |
| Jobs feed handed out work the container had no identity to execute | Fixed | The feed now withholds jobs from a site with no stored merge token and no container-declared `BUILDER_GH_TOKEN` (`&gh=1`). A claim the container would then drop burned the cadence window and read as a stuck claim for up to 36h. |
| A site pointed at an agent nobody gave a key to was skipped silently | Fixed | It now writes a fail row per due job, self-debounced by the cadence clock, so there is a `cron_runs` row to go stale and alert on instead of nothing at all. |
| `buildsActive()` disabled the automatic-builds nag permanently | Fixed | Now recency-checked (14 days); one successful check-in no longer switches the reminder off forever. |
| `start.sh` had no preflight and no way back from `DOMAIN` | Fixed | Docker + Compose-v2 preflight names the real fix instead of surfacing a cryptic CLI error; the from-source fallback says why it fell back and what that needs; removing `DOMAIN` heals `APP_URL` back to localhost on the next start, leaving hand-set reverse-proxy URLs untouched. |
| A finished cloud install could fail to stamp itself installed | Fixed | `install-reconcile.ts` self-heals from its own evidence (a live page shipped by a PR in the connected repo, or setup proof - saved site profile or a green `seo-setup` report - plus a passing `verifyPipelinePrereqs`) rather than waiting on the setup agent's final `mark_pipeline_installed`, which sits at the end of a run the platform doesn't control. Research and daily builds used to never start. |
| `seo-tool-validate`'s readiness probe demanded an exact 200 from `/` | Fixed | Any site whose root redirects - login bounce, locale bounce, a marketing root that 30x's - failed the wait loop and stranded the tool PR unreviewed until auto-merge gave up. Readiness is not correctness: the loop now only waits out curl's `000`. Fixed in `templates/pipeline/` too, and `pipeline-pack.json` regenerated. |
| The three build workflows hardcoded `pnpm` | Fixed | Two mutually-exclusive `if:` steps resolve the repo's package manager at run time, per the conventions rule that no template may depend on an install-time edit whose omission is fatal. |
| Third-site GitHub cost acknowledgement could fail silently | Fixed | `recordGithubCostAck` swallowed write errors, then `createProjectCore` re-checked the gate on submit and refused - walking the owner into a dead end over a note they had just answered. It now returns false and the step says what happened. |
| Self-host builders read a repo secret the wizard never wrote | Fixed | GitHub-scheduled workflows read a **repo** secret; the wizard paste stored an **instance** credential, and with no GitHub App on self-host nothing copied it across, so workflows died in seconds over a token the owner had genuinely pasted. Pasting now syncs to every connected repo's Actions secret (and connecting a repo later pushes stored credentials to it), and `seo-dispatch` checks the secret before waking a workflow rather than dispatching one born dead. |
| Trend radar needs a public URL but only says so after "Scan now" | Deferred | Tracked in [`LATER.md`](../LATER.md). |
| Wizard finale doesn't verify the first research run landed | Deferred | Tracked in [`LATER.md`](../LATER.md); the builder fail-rows above cover the loud half. |

## How to add a new automation

Every new cron, GitHub workflow, or scheduled job in this codebase ships with
all five of these, not as a follow-up:

1. **Report its outcome home, keyed to the project.** Call `reportCronRun()`
   directly if it's a backend route, or hit
   `/api/cron/deploy-check?job=<name>&ok=1` / `&fail=<message>` if it's a
   GitHub workflow. Use the project's own MCP token when the workflow lives
   in a connected repo (it doesn't have `CRON_SECRET`) - the route accepts
   either.
2. **Register it in `STALE_HOURS`** (`src/lib/cron-alerts.ts`) with its real
   cadence, so an install that stops running gets flagged even though it
   never technically failed. Skip this only for jobs with no schedule to be
   late against (per-push, per-dispatch).
3. **Make retries idempotent.** A job that runs again after a partial
   failure must not double-charge, double-build, or double-post. Use a
   concurrency group, a status check, or a guard column (`started_at`,
   built-today) - whatever fits, but prove it's safe to run twice.
4. **Write failure text a human can act on, not a stack trace.** `::error::`
   and the `fail=` message are the only things a default user will ever read
   about this job - name the actual fix ("re-run the setup command", "check
   the DATAFORSEO secret"), not the exception message.
5. **Dogfood it in this repo first.** Ship the workflow in this repo's own
   `.github/workflows/` (or run the cron against the ClockedCode default
   project) before it goes into `templates/pipeline/` for connected repos. A
   failure mode caught here never reaches a self-hoster.

See also: [`CLAUDE.md`](../CLAUDE.md) for the dashboard/MCP parity rule this
doctrine sits next to, and [`LATER.md`](../LATER.md) for scope decisions.

# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](../../security/advisories/new)
("Report a vulnerability" under the repo's Security tab). Do not open a
public issue for anything exploitable.

You'll get an acknowledgment within a few days. This is a solo-maintained
project - fixes for real vulnerabilities are prioritized over everything
else, but there is no bug-bounty program.

## Supported versions

Only the latest `main` is supported. There are no release branches; deploy
from `main` and pull updates regularly.

## The security model (what's worth knowing before reporting)

DispatchSEO is a **single-owner** app - there is deliberately no user model,
no signup, and no role system. The trust boundaries are:

- **Dashboard**: one password (`DASHBOARD_PASSWORD`) gates every page. The
  session cookie is an HMAC keyed by that password, so rotating the password
  invalidates all sessions. Login is rate-limited (5 failed attempts per IP =
  15-minute lockout).
- **MCP server** (`/api/mcp`): per-project 192-bit bearer tokens. A token IS
  the tenant - it can only touch its own project's rows.
- **Crons** (`/api/cron/*`): a shared `CRON_SECRET` bearer token.
- **Database**: server code holds full read/write and it never reaches the
  browser - server-only modules (`src/lib/db.ts` and friends) are kept out of
  client bundles by design. On the **hosted/cloud** deployment the store is
  Supabase with RLS enabled and zero policies, gated by the service-role key.
  On a **self-hosted Docker** stack it's the bundled Postgres + PostgREST,
  reachable only on the stack's internal Docker network (never exposed to the
  host) - no Supabase and no service-role key involved.

Reports that assume a multi-user model (e.g. "user A can see user B's data"
within one deployment) are out of scope - there is only one user.

## Notes for self-hosters

- Use a **long, random `DASHBOARD_PASSWORD`** - it is the only thing between
  the internet and your dashboard.
- Never commit `.env.local`; the example file is the only env file that
  belongs in git.
- Treat your secrets as equal-weight full access to their surface. On a
  **Docker** stack that's `POSTGRES_PASSWORD` (set it before first boot),
  `MCP_API_KEY` / per-project MCP tokens, and `CRON_SECRET`; a from-source
  deploy uses `SUPABASE_SERVICE_ROLE_KEY` in place of `POSTGRES_PASSWORD`.
- Optional but recommended: add a rate-limit rule on `POST /login` in your
  host's firewall (free on Vercel Hobby) as a second layer in front of the
  built-in lockout.

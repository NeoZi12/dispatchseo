# Self-hosting DispatchSEO

Two ways to run it, both $0 hosting:

- **[Docker](#option-a-docker-one-command)** - one command on your own
  machine or any $5 VPS. No cloud accounts. The fastest way to try it.
- **[Free cloud tiers](#option-b-free-cloud-deploy-vercel--supabase)** -
  Vercel (Hobby) + Supabase (free) + GitHub Actions. No server to run;
  you bring your own free accounts.

Paid SERP data (DataForSEO) is optional either way - see
[Data tiers](#data-tiers).

## Option A: Docker (one command)

Runs the whole backend - dashboard, MCP server, database, crons - as 4 small
containers in ~1 GB RAM (any $5/month VPS, a Raspberry Pi, or your laptop).

Prerequisite: [Docker](https://docs.docker.com/get-docker/) (Docker Desktop
on Mac/Windows, `docker` + compose plugin on Linux).

```bash
git clone https://github.com/NeoZi12/dispatchseo
cd dispatchseo
cp .env.docker.example .env
echo "CRON_SECRET=$(openssl rand -hex 24)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
docker compose up -d
```

First boot builds the app image (a few minutes) and applies the database
schema automatically. Then open **http://localhost:3000** - the setup wizard
takes it from there (dashboard password, connecting your repo, GSC).

What's running:

| Container | Job |
|---|---|
| `app` | Dashboard, MCP server (`/api/mcp`), cron endpoints |
| `postgres` | Your data (persists in the `dispatch-pgdata` volume) |
| `postgrest` | REST layer between app and database (internal network only) |
| `migrate` | One-shot schema apply on each boot (idempotent) |
| `cron` | Rank tracking / GSC snapshots / weekly research on schedule |

Things to know:

- **The content pipeline needs a reachable URL.** DispatchSEO ships content
  by opening PRs via GitHub Actions in *your site's* repo, and those
  workflows call back to this backend. `localhost` is fine for exploring the
  dashboard and MCP locally, but before connecting a repo, put the instance
  on a public URL (reverse proxy with HTTPS, or a tunnel like Cloudflare
  Tunnel) and set `APP_URL` in `.env` to match.
- **Upgrading:** `git pull && docker compose build app && docker compose up -d`.
  Schema changes apply automatically (`setup.sql` is idempotent). Back up
  with `docker compose exec postgres pg_dump -U dispatch dispatchseo > backup.sql`.
- **Troubleshooting:** `docker compose ps` (everything except the one-shot
  `migrate` should be running; `app` turns `healthy` once it reaches the
  database), `docker compose logs app` / `logs cron`. Port taken? Set
  `DISPATCH_PORT` in `.env`. Fresh start: `docker compose down -v` deletes
  **all data**.

Skip to [Connect your site](#5-connect-your-site) - the wizard covers
everything in between. Google Search Console setup is the same as
[step 3](#3-google-search-console-free-rankings--traffic-data) below.

## Option B: free cloud deploy (Vercel + Supabase)

### What you need

- Your website's source in a **GitHub repo** (git-based sites only - the
  pipeline ships content as pull requests, so WordPress and other
  database-backed CMSes are out).
- A **Claude subscription with Claude Code** - your agent does the research
  and writing; DispatchSEO is the state, scheduling, and approval layer it
  works against.
- Free accounts: **GitHub**, **Vercel**, **Supabase**.
- **Google Search Console** access to your site, plus a free Google Cloud
  service account (steps below).

### 1. Deploy the backend

Click a deploy button in the README - neither asks you for anything:

- **Deploy · new database** clones the repo to your GitHub and provisions a
  free Supabase database through the Vercel Marketplace (its env vars get
  injected automatically).
- **Deploy · your own database** deploys the same app without creating a
  database. Use it if your Supabase account is already at its free-project
  limit (the free tier allows 2 active projects) or you want to reuse an
  existing project.
- **Manual path:** fork this repo, then import it into Vercel (Add New →
  Project → your fork). Equivalent to the second button.

Then **open your new site**. It shows a setup wizard that walks you through
whatever is left, in order:

1. **Connect your database** (skipped on the marketplace path): pick any
   Supabase project you already have, or create a free one. Copy its
   **Project URL** (shown on the project's home page, next to a Copy
   button) and its **secret key**
   (Project Settings → API Keys; starts with `sb_secret_`, called
   `service_role` on older projects - both work) into Vercel env vars
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. The
   wizard shows these exact steps with links.
2. **Run the migrations**: paste
   [`supabase/migrations/setup.sql`](../supabase/migrations/setup.sql)
   (every migration in one file, safe to re-run) into the Supabase SQL
   Editor and press Run. `/setup` checks that the full set has actually
   run - not just that the database is reachable - before letting you
   move on.
3. **Claim the instance**: choose your dashboard password. DispatchSEO
   generates its agent key (MCP token) and cron key itself, captures this
   deploy's own URL so connected pipelines phone home to the right backend
   (no `APP_URL` env var needed in the normal path), and shows you both keys.

### 2. Environment variables

The wizard handles the required ones. The rest go in Vercel (Project →
Settings → Environment Variables); the full annotated list lives in
[`.env.local.example`](../.env.local.example).

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | Wizard step 1 (the marketplace path injects it for you) |
| `SUPABASE_SERVICE_ROLE_KEY` | Wizard step 1 - server-only, never expose it. The marketplace injects it as `SUPABASE_SECRET_KEY`; both names work |
| `GSC_SERVICE_ACCOUNT_JSON` | Step 3 below (one line, the whole JSON) |
| `GSC_SITE_URL` | Your property, e.g. `sc-domain:example.com` |
| `DATAFORSEO_*`, `RESEND_API_KEY`, `ALERT_EMAIL` | Optional - volumes and failure emails |
| `DASHBOARD_PASSWORD`, `CRON_SECRET`, `MCP_API_KEY` | Optional overrides. Setting them bypasses the wizard's stored values (classic installs work this way); most people never set them |

Redeploy after saving so the functions pick them up.

### 3. Google Search Console (free rankings + traffic data)

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project (or reuse one), enable the **Search Console API**, and create a
   **service account** (no roles needed). Create a JSON key and download it.
2. In [Search Console](https://search.google.com/search-console) → Settings
   → Users and permissions, add the service account's email (it looks like
   `name@project.iam.gserviceaccount.com`) as a **Full** user.
3. Paste the JSON key (single line) into `GSC_SERVICE_ACCOUNT_JSON`.

### 4. Schedules

Two schedulers, split because Vercel Hobby caps crons at once daily:

- **Vercel cron** - `vercel.json` already runs the daily rank check. Nothing
  to do.
- **GitHub Actions** - the higher-frequency jobs live in
  [`.github/workflows/`](../.github/workflows/). On your fork: enable
  Actions (forks start disabled), then set
  - repository **secret** `CRON_SECRET` = your cron key. The setup wizard
    generated it and shows it at `https://your-app.vercel.app/setup/keys`
    (classic installs: whatever you set as the `CRON_SECRET` env var),
  - repository **variable** `BACKEND_URL` = your deployment URL
    (e.g. `https://your-app.vercel.app`).

  Only `hourly-gsc.yml` matters for a fresh install. The `seo-*.yml`
  workflows are this repo's own content pipeline for dispatchseo.com's blog -
  your site gets its own copies during setup (next step), so leave the ones
  here disabled or delete them from your fork.

### 5. Connect your site

Open your deployment, log in with your dashboard password, and add your site
as a project. The dashboard gives you one command to paste into Claude Code
**inside your site's repo** - your agent connects to the MCP server, follows
the served instructions, writes the workflow files, and sets its own repo
secrets. That's the whole install: your agent sets you up.

## Data tiers

The tiers stack - start free, add keys when you want more signal:

| Tier | Costs | You get |
| --- | --- | --- |
| **GSC-only** (default) | $0 | Rankings from Search Console, keyword research from Google Autocomplete + your own impression data |
| **+ SerpApi key** | $0 (250 searches/mo free) | Live SERP checks: real positions weekly, page-1 recon before writing |
| **+ DataForSEO** | ~pay-per-call, prepaid | Search volumes, keyword difficulty, domain rating - the "is this keyword worth winning" numbers |

Honest framing: free mode finds keywords you can win; paid mode also knows
which ones are worth winning.

## When something breaks

Every scheduled job logs its runs. Failures show as a red banner on the
dashboard Home page, and - if you set `RESEND_API_KEY` + `ALERT_EMAIL` - you
get an email, at most one per job per day. Setting those two is strongly
recommended if you run in auto mode: nobody opens the dashboard on a normal
day, so the email is what actually surfaces a broken job. Full detail lands
in Vercel's function logs and the GitHub Actions run logs.

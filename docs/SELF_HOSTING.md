# Self-hosting DispatchSEO

The whole product runs on free tiers: Vercel (Hobby) + Supabase (free) +
GitHub Actions. You bring your own accounts, so hosting costs $0. Paid SERP
data (DataForSEO) is optional - see [Data tiers](#data-tiers).

## What you need

- Your website's source in a **GitHub repo** (git-based sites only - the
  pipeline ships content as pull requests, so WordPress and other
  database-backed CMSes are out).
- A **Claude subscription with Claude Code** - your agent does the research
  and writing; DispatchSEO is the state, scheduling, and approval layer it
  works against.
- Free accounts: **GitHub**, **Vercel**, **Supabase**.
- **Google Search Console** access to your site, plus a free Google Cloud
  service account (steps below).

## 1. Deploy the backend

**Fast path:** the Deploy-to-Vercel button in the README clones the repo to
your GitHub, provisions a Supabase database through the Vercel Marketplace
(its env vars get injected automatically), and prompts you for the three
secrets you invent (`MCP_API_KEY`, `CRON_SECRET`, `DASHBOARD_PASSWORD`).
If you took it, skip to step 2's migration part - the database exists, but
it's empty until you run the migrations.

**Bring-your-own-Supabase path:** the second deploy link in the README skips
the Marketplace store. Use it if your Supabase account is already at its
free-project limit (the free tier allows 2 active projects) or you want to
reuse an existing project: create the database at supabase.com first (step
2), and the deploy flow prompts you for its `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` alongside the three invented secrets.

**Manual path:** fork this repo, then import it into Vercel (Add New →
Project → your fork). The defaults work; you'll add environment variables in
step 3.

## 2. Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL Editor and run every file in
   [`supabase/migrations/`](../supabase/migrations/) **in numeric order**
   (0001 first). Each one is additive; running them all takes a couple of
   minutes.
3. From Project Settings → API, copy the **URL** and the **service_role
   key** for the next step.

## 3. Environment variables

Set these in Vercel (Project → Settings → Environment Variables). The full
annotated list lives in [`.env.local.example`](../.env.local.example).

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | From step 2 (the deploy button injects it for you) |
| `SUPABASE_SERVICE_ROLE_KEY` | From step 2 - server-only, never expose it. The deploy button injects it as `SUPABASE_SECRET_KEY`; both names work |
| `MCP_API_KEY` | Invent it: `openssl rand -hex 24` |
| `CRON_SECRET` | Invent it: `openssl rand -hex 24` |
| `DASHBOARD_PASSWORD` | Your dashboard login. Make it long and random - it is the only gate |
| `GSC_SERVICE_ACCOUNT_JSON` | Step 4 (one line, the whole JSON) |
| `GSC_SITE_URL` | Your property, e.g. `sc-domain:example.com` |
| `DATAFORSEO_*`, `RESEND_API_KEY`, `ALERT_EMAIL` | Optional - volumes and failure emails |

Redeploy after saving so the functions pick them up.

## 4. Google Search Console (free rankings + traffic data)

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project (or reuse one), enable the **Search Console API**, and create a
   **service account** (no roles needed). Create a JSON key and download it.
2. In [Search Console](https://search.google.com/search-console) → Settings
   → Users and permissions, add the service account's email (it looks like
   `name@project.iam.gserviceaccount.com`) as a **Full** user.
3. Paste the JSON key (single line) into `GSC_SERVICE_ACCOUNT_JSON`.

## 5. Schedules

Two schedulers, split because Vercel Hobby caps crons at once daily:

- **Vercel cron** - `vercel.json` already runs the daily rank check. Nothing
  to do.
- **GitHub Actions** - the higher-frequency jobs live in
  [`.github/workflows/`](../.github/workflows/). On your fork: enable
  Actions (forks start disabled), then set
  - repository **secret** `CRON_SECRET` = the same value as in Vercel,
  - repository **variable** `BACKEND_URL` = your deployment URL
    (e.g. `https://your-app.vercel.app`).

  Only `hourly-gsc.yml` matters for a fresh install. The `seo-*.yml`
  workflows are this repo's own content pipeline for dispatchseo.com's blog -
  your site gets its own copies during setup (next step), so leave the ones
  here disabled or delete them from your fork.

## 6. Connect your site

Open your deployment, log in with `DASHBOARD_PASSWORD`, and add your site as
a project. The dashboard gives you one command to paste into Claude Code
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
get an email, at most one per job per day. Full detail lands in Vercel's
function logs and the GitHub Actions run logs.

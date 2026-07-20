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

1. **Connect a database** (skipped on the marketplace path): open the
   Supabase project you want to reuse - or create a free one at
   [supabase.com](https://supabase.com) - then copy its **Project URL**
   and **service_role key** from Project Settings → API into Vercel env vars
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, redeploy. The wizard
   shows these exact steps.
2. **Run the migrations**: in the Supabase SQL Editor, run every file in
   [`supabase/migrations/`](../supabase/migrations/) **in numeric order**
   (0001 first). Each one is additive; a couple of minutes, one time. `/setup`
   checks that the full set has actually run - not just that the database is
   reachable - before letting you move on.
3. **Claim the instance**: choose your dashboard password. DispatchSEO
   generates its agent key (MCP token) and cron key itself, captures this
   deploy's own URL so connected pipelines phone home to the right backend
   (no `APP_URL` env var needed in the normal path), and shows you both keys.

## 2. Environment variables

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

## 3. Google Search Console (free rankings + traffic data)

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project (or reuse one), enable the **Search Console API**, and create a
   **service account** (no roles needed). Create a JSON key and download it.
2. In [Search Console](https://search.google.com/search-console) → Settings
   → Users and permissions, add the service account's email (it looks like
   `name@project.iam.gserviceaccount.com`) as a **Full** user.
3. Paste the JSON key (single line) into `GSC_SERVICE_ACCOUNT_JSON`.

## 4. Schedules

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

## 5. Connect your site

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

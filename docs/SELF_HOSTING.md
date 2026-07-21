# Self-hosting DispatchSEO

This guide takes you from nothing to a working DispatchSEO install, in plain
English. If you've never touched Docker or heard the words "service account"
before, you're in the right place - every step is spelled out.

There are two ways to run it. Both cost $0 to host:

- **[Docker](#option-a-docker-one-command)** - one command on your own
  computer or any $5/month server. No cloud accounts. The fastest way in.
- **[Free cloud](#option-b-free-cloud-vercel--supabase)** - Vercel +
  Supabase + GitHub Actions, all on their free tiers. Nothing runs on your
  machine; you bring your own free accounts.

Both roads end at the same place: a **setup wizard** in your browser that
walks you through connecting your site, checks every step on the spot, and
unlocks the dashboard once everything is verified. The whole wizard is
covered below in [The setup wizard, step by step](#the-setup-wizard-step-by-step).

## What you need (either way)

- **Your website's code in a GitHub repo.** DispatchSEO publishes every
  article and tool as a pull request - a suggested change you can look at
  before it goes live. That means git-based sites only; WordPress and other
  database-backed CMSes won't work.
- **Claude Code with a Claude subscription.** Your own AI agent does the
  research and the writing, on the plan you already pay for. DispatchSEO
  bills you nothing.
- **Google Search Console access to your site.** That's Google's free tool
  showing how your site performs in search. If your site isn't on it yet,
  add it first at [search.google.com/search-console](https://search.google.com/search-console).

## Option A: Docker (one command)

Runs the whole backend - dashboard, MCP server, database, scheduled jobs -
as a few small containers in about 1 GB of RAM. A $5/month VPS, a Raspberry
Pi, or your laptop all work.

The one prerequisite is [Docker](https://docs.docker.com/get-docker/)
(Docker Desktop on Mac/Windows, `docker` + the compose plugin on Linux).

```bash
git clone https://github.com/NeoZi12/dispatchseo &&
  cd dispatchseo &&
  sh start.sh
```

On Windows, paste that in WSL or Git Bash. The first boot builds the app
image, which takes a few minutes; the database schema applies itself.

When it finishes, it prints your dashboard URL - usually
**http://localhost:3000**. Open it, choose a dashboard password, and the
setup wizard starts. From here, jump to
[The setup wizard, step by step](#the-setup-wizard-step-by-step).

### What the command actually did

`start.sh` does four things, and it skips whatever is already done, so
re-running it is always safe:

1. Creates a `.env` file from the template.
2. Generates the one required secret (`CRON_SECRET`).
3. Picks the port: 3000, or the next free one if something already uses it.
   Want a specific port? Set `DISPATCH_PORT` in `.env`.
4. Starts everything with `docker compose up -d`.

The stack has a pinned name (`dispatchseo`), so cloning the repo a second
time somewhere else updates your existing install instead of creating a
duplicate.

| Container | Job |
|---|---|
| `app` | Dashboard, MCP server (`/api/mcp`), cron endpoints |
| `postgres` | Your data (persists in the `dispatch-pgdata` volume) |
| `postgrest` | REST layer between app and database (internal only) |
| `migrate` | Applies the database schema on each boot (safe to repeat) |
| `cron` | Rank tracking, Search Console snapshots, weekly research |

### The one localhost catch

Everything in the wizard works on localhost. One thing doesn't, later on:
the content pipeline runs as GitHub Actions in *your site's* repo, and
those jobs need to call back to your DispatchSEO instance. GitHub's servers
can't reach an address that only exists on your machine.

So: explore, set up, research keywords, track rankings - all fine locally.
When you want articles built automatically, put the instance on a public
URL (a reverse proxy with HTTPS, or a tunnel like Cloudflare Tunnel) and
set `APP_URL` in `.env` to match. The wizard reminds you about this too.

### Good to know

- **Your own database password:** set `POSTGRES_PASSWORD` in `.env`
  **before the very first start**. It gets baked into the database volume,
  so changing it later means wiping the volume (`docker compose down -v` -
  which deletes all data). The default is fine for most people: the
  database is only reachable inside Docker's private network, never from
  the internet.
- **Upgrading:** `git pull && docker compose build app && docker compose up -d`.
  Schema changes apply themselves.
- **Backups:** `docker compose exec postgres pg_dump -U dispatch dispatchseo > backup.sql`
- **Troubleshooting:** `docker compose ps` shows what's running (everything
  except the one-shot `migrate` should be up; `app` turns `healthy` once it
  reaches the database). `docker compose logs app` shows the app's logs.
  Fresh start: `docker compose down -v` - deletes **all data**.

## Option B: free cloud (Vercel + Supabase)

You'll need free accounts on **GitHub**, **Vercel**, and **Supabase**.

### 1. Deploy the backend

Click a deploy button in the [README](../README.md) - neither asks you for
anything up front:

- **Deploy · new database** clones the repo to your GitHub and creates a
  free Supabase database for you through the Vercel Marketplace. Easiest.
- **Deploy · your own database** deploys the app without creating a
  database. Use it if your Supabase account is already at its 2-project
  free limit, or you want to reuse an existing project.
- **Manual path:** fork this repo, then import the fork into Vercel
  (Add New → Project). Same result as the second button.

### 2. First open: claim your instance

Open your new site. A short setup flow walks you through whatever is left,
with exact instructions and links on each screen:

1. **Connect your database** (skipped if the marketplace created one):
   copy your Supabase project's URL and secret key into two Vercel
   environment variables, redeploy.
2. **Run the database setup**: paste one SQL file into Supabase's SQL
   Editor and press Run. It checks the result before letting you continue.
3. **Choose your dashboard password.** DispatchSEO generates its own agent
   key and cron key and shows you both.

### 3. Turn on the schedules

Two schedulers share the work (Vercel's free tier only allows one daily
cron, so the rest run on GitHub Actions):

- **Vercel cron** - already configured, runs the daily rank check. Nothing
  to do.
- **GitHub Actions** - on your fork of this repo: enable Actions (forks
  start with them off), then add
  - repository **secret** `CRON_SECRET` = your cron key (shown at
    `https://your-app.vercel.app/setup/keys`),
  - repository **variable** `BACKEND_URL` = your deployment URL.

  Only `hourly-gsc.yml` matters for a fresh install. The `seo-*.yml`
  workflows in this repo are dispatchseo.com's own content pipeline - your
  site gets its own copies during the install, so leave these disabled.

### 4. The wizard takes it from here

Log in with your password and the setup wizard starts - Search Console,
keyword data, publish mode, connecting Claude Code, all of it. Keep
reading.

## The setup wizard, step by step

This is the same wizard on Docker and cloud - it knows which install you
have and only shows what applies. It takes about 10 minutes, checks each
step on the spot, and saves your progress as you go: close the tab
whenever, and it reopens exactly where you stopped.

**Stuck? Every screen also has a link back to this guide.**

### Step 1 - Add your site

Name, domain, and GitHub repo of **your website** - the site you want
Google traffic for, not the machine DispatchSEO runs on. The repo is the
`owner/repo` part of its GitHub URL. Then one question: does your site have
a blog? "Not sure" is a valid answer - Claude checks the repo and decides
during setup.

### Step 2 - Connect Google Search Console

This is where your ranking and traffic numbers come from. DispatchSEO
reads them through a **service account** - a robot Google account that it
signs in as. You create one once and it works for every site you ever add.

The wizard walks you through it with direct links: create a Google Cloud
project, enable the Search Console API, create the service account,
download its key file, and paste the file's contents into the wizard. The
key is stored encrypted in your own database.

Then you add the service account's email as a user in Search Console
(the wizard shows the exact clicks) and press **Verify connection** - it
asks Google right then and tells you if it worked. Google occasionally
takes a few minutes to catch up; you can continue and it re-checks on its
own.

### Step 3 - Pick a keyword data source

Two choices, switchable later in Settings:

- **DataForSEO (paid, recommended):** real Google search volumes and
  difficulty scores - the same data most SEO tools resell. Pay as you go;
  a typical site costs $2-5/month, and new accounts get $1 free.
- **Free mode ($0 forever):** Claude finds opportunities in your own
  Search Console data and Google's autocomplete suggestions. If you go
  free, the wizard offers one optional upgrade: a free SerpApi key
  (250 searches/month, no credit card) that lets Claude look at the real
  Google results page before writing, to judge whether a keyword is
  winnable.

Whatever you pick, the wizard verifies the credentials against the real
service before saving them.

### Step 4 - Claude Code

Nothing to do here - it just explains the division of labor: Claude Code is
the brain, DispatchSEO is its memory and dashboard. The connection itself
happens at the finish line.

### Step 5 - Publish mode

Should anything go live without you?

- **Semi-automatic (recommended to start):** Claude researches and builds
  on its own, but you approve ideas and click Merge on finished pages. A
  few minutes of your attention a week.
- **Automatic:** everything runs itself; pages that pass their checks
  publish without anyone touching them. You can watch and undo from the
  dashboard.

There's a Semi/Auto toggle in the dashboard's top bar, so this is never a
final answer.

### Step 6 - One-tap merge (optional)

Claude ships pages as GitHub pull requests. If you give the dashboard a
GitHub token, its Approve button also merges - approve = live on your site.
The wizard links you to a pre-filled GitHub page, you press Generate,
paste the token, and it's verified against your repo before saving
(encrypted, like everything else). Skipping is fine: you'll just merge each
PR on GitHub yourself.

### Step 7 - The honest timeline

A month-by-month picture of what SEO actually looks like, so a quiet first
month reads as "on schedule" instead of "broken". Just read it.

### The finish line: two pastes

The last screen gives you two things to copy:

1. **A terminal command** that connects your Claude Code to this project.
   Run it inside your site's repo folder.
2. **A chat message** to paste into Claude Code itself (open the repo,
   type `claude`, paste). This one does the actual install.

From that second paste, your agent takes over: it writes the automation
workflow files into your repo, sets the repo secrets, opens one pull
request with all of it, and kicks off your first keyword research. You
approve its steps in the chat as it goes. It needs Claude Code and the
GitHub CLI (`gh`) installed, and it's safe to re-run if anything is
interrupted.

The wizard tracks all of it live. When the pipeline PR is open, it shows
**"Your move: merge the pipeline PR"** with a direct link - merging that PR
is your one required click. The agent then verifies the full checklist
(workflows on the main branch, permissions, labels, secrets) and reports
back over MCP; the backend double-checks it independently. The dashboard
only unlocks once everything genuinely works. If the wizard says
it's still waiting, the agent isn't done yet - check its chat.

There's also an optional third paste that personalizes the backlink
playbook for your product. Skip it if you want; you can run it any time
later.

## Data tiers

The tiers stack - start free, add keys when you want more signal:

| Tier | Costs | You get |
| --- | --- | --- |
| **GSC-only** (default) | $0 | Rankings from Search Console, keyword ideas from Google Autocomplete + your own impression data |
| **+ SerpApi key** | $0 (250 searches/mo free) | Live SERP checks: real positions weekly, page-1 recon before writing |
| **+ DataForSEO** | pay per call, prepaid | Search volumes, keyword difficulty, domain rating - the "is this keyword worth winning" numbers |

Honest framing: free mode finds keywords you can win; paid mode also knows
which ones are worth winning.

## Advanced: environment variables

The wizard stores everything it collects (encrypted) in your own database,
so a normal install needs no hand-set variables beyond what the deploy
creates. Power users can still set any of these - an environment variable
always wins over the wizard's stored value:

| Variable | What it is |
| --- | --- |
| `GSC_SERVICE_ACCOUNT_JSON` | The service-account key, as one line - instead of pasting it in the wizard |
| `GSC_SITE_URL` | Your Search Console property, e.g. `sc-domain:example.com` |
| `GH_MERGE_TOKEN` | The one-tap-merge GitHub token - instead of the wizard |
| `DATAFORSEO_*`, `RESEND_API_KEY`, `ALERT_EMAIL` | Keyword volumes and failure-alert emails |
| `DASHBOARD_PASSWORD`, `CRON_SECRET`, `MCP_API_KEY` | Classic-install overrides; setting them bypasses the stored values |

The full annotated list lives in
[`.env.local.example`](../.env.local.example) (cloud) and
[`.env.docker.example`](../.env.docker.example) (Docker).

## When something breaks

Every scheduled job logs its runs. Failures show as a red banner on the
dashboard's Home page, and - if you set `RESEND_API_KEY` + `ALERT_EMAIL` -
you get an email, at most one per job per day. Setting those two is
strongly recommended in auto mode: nobody opens the dashboard on a normal
day, so the email is what actually surfaces a broken job. Full detail lands
in Vercel's function logs (cloud) or `docker compose logs` (Docker), plus
the GitHub Actions run logs.

# Self-hosting DispatchSEO

This guide takes you from nothing to a working DispatchSEO install, in plain
English. If you've never touched Docker or heard the words "service account"
before, you're in the right place - every step is spelled out.

The short version:

```bash
git clone https://github.com/NeoZi12/dispatchseo &&
  cd dispatchseo &&
  sh start.sh
```

That command starts the whole product on your machine - dashboard, database,
MCP server, schedules, and a headless Claude Code that does the building.
When it finishes, it prints a local URL. Open it and a **setup wizard** walks
you through connecting your site, checks every step on the spot, and unlocks
the dashboard once everything works. The wizard is covered below in
[The setup wizard, step by step](#the-setup-wizard-step-by-step).

## What you need

- **A computer that can run [Docker](https://docs.docker.com/get-docker/).**
  Your laptop or desktop works for trying it out; something that stays on
  works better for running it seriously. The next section explains that
  trade-off honestly. The stack needs about 1 GB of RAM.
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

## Laptop or always-on machine? An honest answer

DispatchSEO is background automation: it researches, writes, and checks
rankings on a schedule. **Schedules only run while the machine is on.**
That single fact decides where you should run it.

**On a laptop**, everything works while the lid is open. When the laptop
sleeps, the stack pauses with it - and here is exactly what that costs you:

- **Content building catches up by itself.** The builder doesn't run at a
  fixed hour; it asks "is anything due?" every 10 minutes. If the daily
  guide was due at 4am while your laptop slept, it gets built a few minutes
  after you open the lid. You lose nothing except the timing.
- **Search Console stats also self-heal.** Each snapshot re-reads the last
  few days from Google, so a missed pass is covered by the next one.
- **Rank checks leave gaps.** Positions are sampled from the live results
  page once a day (4:00 UTC). A day the machine slept through is a day with
  no data point in your ranking charts. The trend survives; the daily
  resolution doesn't.

So a laptop is a fine way to evaluate DispatchSEO for a week or two. You'll
just see the pipeline work in bursts (whenever the machine is awake) instead
of quietly overnight.

**For running it seriously**, give it any machine that stays on:

| Option | Cost | Notes |
| --- | --- | --- |
| Small VPS (Hetzner, DigitalOcean, ...) | ~$4-6/month | The usual choice. 1 GB RAM is enough, 2 GB is comfortable. |
| Raspberry Pi or any old PC at home | ~$0 | Works great. Turn off sleep mode; that's the whole trick. |
| Your desktop, if it runs 24/7 anyway | $0 | Set Docker to start on login and forget about it. |

Nothing on the internet ever needs to reach your machine (see
[the builder](#automatic-builds-fully-local-the-builder)), so a computer at
home behind a normal router works as-is, without port forwarding or a
domain.

And if none of these appeal to you, that is exactly what the
[cloud version](https://dispatchseo.com) will be for: we run the machine.

## Install on your own computer

1. **Install Docker.**
   - **Mac / Windows:** install [Docker Desktop](https://docs.docker.com/get-docker/)
     and open it once, so the whale icon shows in your menu bar / tray.
   - **Linux:** install `docker` and the compose plugin from
     [docs.docker.com/engine/install](https://docs.docker.com/engine/install/).
2. **Run the command.** In a terminal (on Windows: WSL or Git Bash, not
   plain PowerShell):

   ```bash
   git clone https://github.com/NeoZi12/dispatchseo &&
     cd dispatchseo &&
     sh start.sh
   ```

   The first boot downloads and builds the images, which takes a few
   minutes. Re-runs take seconds.
3. **Open the URL it prints** - usually **http://localhost:3000**. If the
   page doesn't answer right away, give it ~20 seconds and refresh.
4. **Choose a dashboard password** and the setup wizard starts. Jump to
   [The setup wizard, step by step](#the-setup-wizard-step-by-step).

## Install on a VPS

Same install, done over SSH. Any provider works (Hetzner, DigitalOcean,
Vultr, ...); a 1 GB Ubuntu or Debian box is enough.

1. **Connect** from your own terminal:

   ```bash
   ssh root@your-server-ip
   ```

2. **Install Docker** with the official one-liner:

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

3. **Clone and start**, same as anywhere:

   ```bash
   git clone https://github.com/NeoZi12/dispatchseo &&
     cd dispatchseo &&
     sh start.sh
   ```

4. **Open the dashboard.** The stack listens on port 3000 of the server,
   and you have three ways to reach it:

   - **SSH tunnel (encrypted, zero setup)** - on your own computer run
     `ssh -L 3000:localhost:3000 root@your-server-ip`, then open
     `http://localhost:3000`. The server's firewall stays fully closed.
   - **Open the port (quick look only)** - allow port 3000 in the
     firewall (`ufw allow 3000`, or your provider's panel) and browse
     `http://your-server-ip:3000`. This is plain HTTP: your dashboard
     password crosses the internet unencrypted, so treat it as a first
     look, not a way to run.
   - **Domain + HTTPS (the way to run long-term)** - point a subdomain's
     DNS at the server, install [Caddy](https://caddyserver.com)
     (`apt install caddy`), and give it two lines in
     `/etc/caddy/Caddyfile`:

     ```
     dispatch.your-domain.com {
         reverse_proxy localhost:3000
     }
     ```

     `systemctl reload caddy` and Caddy fetches the HTTPS certificate by
     itself. Then set `APP_URL=https://dispatch.your-domain.com` in
     `.env` and run `sh start.sh` again.

   To be clear about which is which: the first two exist so you can see
   the wizard in the next sixty seconds. Day to day you'll use the
   domain - set it up once and the dashboard is just a bookmark, from
   any device, no terminal involved.

   (Already running Nginx, Traefik, or another proxy? Any of them works -
   just proxy your subdomain to `localhost:3000`. Caddy is documented here
   because it's the shortest path for a first-timer.)

5. **The builder token comes from your own computer**, not the VPS:
   `claude setup-token` opens a browser login, which a headless server
   can't do. Run it locally, copy the `sk-ant-oat...` token into the
   VPS's `.env`, then `docker compose up -d builder` on the server.

That's the whole difference from a local install. The wizard and
everything after it are identical - except this machine never sleeps, so
the schedules actually fire at their scheduled times.

### What the command actually did

`start.sh` does four things, and it skips whatever is already done, so
re-running it is always safe:

1. Creates a `.env` file from the template.
2. Generates the one required secret (`CRON_SECRET`).
3. Picks the port: 3000, or the next free one if something already uses it.
   Want a specific port? Set `DISPATCH_PORT` in `.env`.
4. Starts everything with `docker compose up -d --build`.

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
| `builder` | Headless Claude Code that builds what's due (next section) |

## Automatic builds, fully local: the builder

The stack includes a `builder` container - your own Claude Code, running
headlessly inside Docker. Every 10 minutes it asks the backend what's due
and runs it: the daily guide build, the weekly keyword research, approved
tool builds, the weekly AI-visibility scan - and, on auto-mode projects,
it merges guide PRs once every check passes. Nothing on the internet ever
needs to reach your machine; the builder only makes outbound connections
(to GitHub and Anthropic). This is what makes a laptop or home-server
install fully automatic, no public URL, no tunnel.

Turning it on is one token:

1. On your own computer, run `claude setup-token` and copy the
   `sk-ant-oat...` token it prints. (This runs the builds on your existing
   Claude subscription - DispatchSEO bills nothing, same as everywhere
   else.)
2. Put it in `.env`: `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...`
3. Run `docker compose up -d builder`.

For GitHub access (cloning your repo, opening and merging PRs) it reuses
the token you connect in the wizard's **One-tap merge** step - nothing to
configure twice. Until the Claude token is set, the container just idles
and prints what it's waiting for: `docker compose logs builder`.

### So when DO you need a public URL?

Only if you skip the builder and want the GitHub-hosted schedules (the
workflow files the install puts in your repo) to do the building instead -
those run on GitHub's servers and must call back to your instance, which
localhost can't offer. In that case put the instance behind a public URL
(reverse proxy with HTTPS, or a tunnel like Cloudflare Tunnel) and set
`APP_URL` in `.env` to match. PR checks (like tool validation) run on
GitHub either way and work fine regardless.

## Day to day: what using it actually looks like

Once the wizard finishes, DispatchSEO settles into a rhythm. Your part
takes a few minutes a week; here is where those minutes go.

- **Ideas arrive in the queue.** Once a week the agent researches keywords
  and files suggestions - each one a card with the keyword, why it looks
  winnable, and the angle. You approve, reject, or reorder them on the
  **Queue** page (or from Claude Code chat; everything the dashboard does,
  the agent can do over MCP).
- **Approved ideas become pull requests.** The builder picks up the oldest
  approved idea (one guide a day at most - publishing pace ramps up slowly
  on purpose) and opens a PR against your site's repo. In semi-automatic
  mode you press **Merge** on the dashboard; in automatic mode green PRs
  merge themselves and you just see "published" in the activity feed.
- **Numbers accumulate on their own.** Rankings, clicks, and impressions
  land on the dashboard daily. The **Home** page tells you which SEO stage
  you're in and what, if anything, needs you.
- **Problems announce themselves.** A failed job shows a red banner on
  Home, and emails you if you set up alerts. No news means it's working.

A normal week: open the dashboard once or twice, approve a couple of ideas,
merge a couple of PRs, glance at the charts. That's the product.

## Good to know

- **Your own database password:** set `POSTGRES_PASSWORD` in `.env`
  **before the very first start**. It gets baked into the database volume,
  so changing it later means wiping the volume (`docker compose down -v` -
  which deletes all data). The default is fine for most people: the
  database is only reachable inside Docker's private network, never from
  the internet.
- **Upgrading:** `git pull && sh start.sh`. That's the whole procedure -
  the script rebuilds what changed and the database schema applies itself.
  (You always run the compose file that matches the code you pulled, so
  upgrades can't drift out of sync with the containers.)
- **Stopping and starting:** `docker compose stop` pauses everything,
  `sh start.sh` brings it back. Data survives stops, restarts, and reboots.
- **Backups:** `docker compose exec postgres pg_dump -U dispatch dispatchseo > backup.sql`
- **Moving to another machine:** back up as above, run the quickstart on
  the new machine, restore with
  `docker compose exec -T postgres psql -U dispatch dispatchseo < backup.sql`.
- **Troubleshooting:** `docker compose ps` shows what's running (everything
  except the one-shot `migrate` should be up; `app` turns `healthy` once it
  reaches the database). `docker compose logs app` shows the app's logs.
  Fresh start: `docker compose down -v` - deletes **all data**.
- **Uninstalling:** `docker compose down -v` removes the containers and
  data; delete the cloned folder and it's gone.

## The setup wizard, step by step

The wizard takes about 10 minutes, checks each step on the spot, and saves
your progress as you go: close the tab whenever, and it reopens exactly
where you stopped.

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
request with all of it, personalizes the backlink playbook for your
product, and kicks off your first keyword research. You approve its steps
in the chat as it goes. It needs Claude Code and the GitHub CLI (`gh`)
installed, and it's safe to re-run if anything is interrupted.

The wizard tracks all of it live. When the pipeline PR is open, it shows
**"Your move: merge the pipeline PR"** with a direct link - merging that PR
is your one required click. The agent then verifies the full checklist
(workflows on the main branch, permissions, labels, secrets) and reports
back over MCP; the backend double-checks it independently. The dashboard
only unlocks once everything genuinely works. If the wizard says
it's still waiting, the agent isn't done yet - check its chat.

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
so a normal install needs no hand-set variables beyond what `start.sh`
creates. Power users can still set any of these in `.env` - an environment
variable always wins over the wizard's stored value:

| Variable | What it is |
| --- | --- |
| `GSC_SERVICE_ACCOUNT_JSON` | The service-account key, as one line - instead of pasting it in the wizard |
| `GSC_SITE_URL` | Your Search Console property, e.g. `sc-domain:example.com` |
| `GH_MERGE_TOKEN` | The one-tap-merge GitHub token - instead of the wizard |
| `DATAFORSEO_*`, `RESEND_API_KEY`, `ALERT_EMAIL` | Keyword volumes and failure-alert emails |
| `DASHBOARD_PASSWORD`, `CRON_SECRET`, `MCP_API_KEY` | Classic-install overrides; setting them bypasses the stored values |

The full annotated list lives in
[`.env.docker.example`](../.env.docker.example).

## When something breaks

Every scheduled job logs its runs. Failures show as a red banner on the
dashboard's Home page, and - if you set `RESEND_API_KEY` + `ALERT_EMAIL` -
you get an email, at most one per job per day. Setting those two is
strongly recommended in auto mode: nobody opens the dashboard on a normal
day, so the email is what actually surfaces a broken job. Full detail lands
in `docker compose logs`, plus the GitHub Actions run logs if your repo
uses the GitHub-hosted schedules.

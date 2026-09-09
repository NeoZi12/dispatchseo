# Self-hosting DispatchSEO

**The full guide lives on the docs site:
[dispatchseo.com/docs](https://dispatchseo.com/docs).** It's the same
step-by-step content, one page per task, and it's also served by your own
instance at `/docs` once you're running - so it works offline too. This
file is just the map.

The short version - run from any plain folder (not inside your website's
repo; it creates its own `dispatchseo` folder). **On a VPS, `ssh` in first
and run this on the server**, not on your own computer:

```bash
git clone https://github.com/NeoZi12/dispatchseo &&
  cd dispatchseo &&
  sh start.sh
```

On Windows, paste this version instead - it works in plain PowerShell
([Git](https://git-scm.com/downloads/win) must be installed) and installs
into your user folder no matter where the window opened:

```powershell
cd ~; git clone https://github.com/NeoZi12/dispatchseo; cd dispatchseo; .\start.cmd
```

Open the URL it prints (usually **http://localhost:4005**), choose a
dashboard password, and the setup wizard takes it from there. (The VPS
guide below has a shorter one-line installer plus your own domain with
automatic HTTPS - this block is the plain version that works anywhere.)

## The guide, page by page

- **[Install on your own computer](https://dispatchseo.com/docs/docker-compose)** -
  Docker Desktop, the one command, what's running, the builder, upgrading.
  Includes the honest laptop-vs-always-on trade-off: builds catch up when a
  laptop wakes and GSC stats mostly catch up too, but daily rank checks
  leave permanent gaps, so **we highly recommend a machine that stays on**
  (a ~$5 VPS, a Raspberry Pi, or a desktop that never sleeps) for real use -
  a laptop is fine for a first look, not for day-to-day.
- **[Install on a VPS](https://dispatchseo.com/docs/vps)** - one line
  installs everything (Docker included), then one DNS record + one .env
  line puts the dashboard on your subdomain with automatic HTTPS. This is
  the path we recommend once you're past trying it out.
- **[Install on Coolify](https://dispatchseo.com/docs/coolify)** - already
  running Coolify? Deploy the ready-made template
  (`docker/coolify/docker-compose.yml`) from its UI: generated secrets,
  your domain with HTTPS, no SSH.
- **[The setup wizard, step by step](https://dispatchseo.com/docs/setup-wizard)** -
  what each screen asks for and why: your site, the Search Console service
  account, keyword data (free mode vs DataForSEO), publish mode, one-tap
  merge, and the two pastes that connect your coding agent.
- **[Day to day](https://dispatchseo.com/docs/day-to-day)** - what using it
  actually looks like after setup, plus the data tiers.
- **[The dashboard, page by page](https://dispatchseo.com/docs/dashboard)** -
  every screen, what it shows, and when to open it.
- **[Automations and modes](https://dispatchseo.com/docs/automations)** - the
  three modes, all twelve automations, publishing pace, and the quality gates.
- **[Troubleshooting](https://dispatchseo.com/docs/troubleshooting)** -
  what each failure means and how to fix it, symptom by symptom.
- **[Upgrading and backups](https://dispatchseo.com/docs/upgrading)** -
  pulling a new image, backing up Postgres, and moving to another machine.

Reference, once you want the details:

- **[Environment variables](https://dispatchseo.com/docs/environment-variables)** -
  every variable, whether you need it, and where to get the value.
- **[Schedules and jobs](https://dispatchseo.com/docs/schedules)** - what runs
  when, and what you see when something fails.
- **[MCP tools](https://dispatchseo.com/docs/mcp-tools)** - every tool your
  agent can call.
- **[Security and your data](https://dispatchseo.com/docs/security)** - the
  auth model, what is stored, and what leaves your machine.
- **[Architecture](https://dispatchseo.com/docs/architecture)** - how the
  pieces fit together.

## What you need

- **A computer that can run [Docker](https://docs.docker.com/get-docker/)** -
  about 1 GB of RAM. A laptop works for a test drive; something always-on
  for running it seriously.
- **Your website's code in a GitHub repo.** Content ships as pull
  requests, so git-based sites only; WordPress and other database-backed
  CMSes won't work.
- **A coding agent - Claude Code, Codex, or Cursor.** Your own agent does the
  research and the writing, and it also runs the in-stack builder that works
  while you're away. Claude Code runs on the Claude subscription you already
  pay for; Codex runs on your own OpenAI API key, which OpenAI meters per
  run; Cursor runs on your Cursor plan's included usage, via an API key any
  plan can mint. Pick one on the dashboard's **Settings → Coding agent** - the
  builder reads that, so switching needs no reinstall. Its credential goes in
  one of two places: pasted on Home's "Turn on automatic builds" card, or set
  as `CLAUDE_CODE_OAUTH_TOKEN` / `OPENAI_API_KEY` / `CURSOR_API_KEY` in your
  `.env`.
- **Google Search Console access to your site** - free, at
  [search.google.com/search-console](https://search.google.com/search-console).

## Advanced: environment variables

The wizard stores everything it collects (encrypted) in your own database,
so a normal install needs no hand-set variables beyond what `start.sh`
creates. An environment variable always wins over the wizard's stored
value.

The full annotated list is on the docs site -
**[Environment variables](https://dispatchseo.com/docs/environment-variables)** -
and in [`.env.docker.example`](../.env.docker.example) as raw comments.

## The daily install ping

Once a day your install tells `dispatchseo.com` two things: a random id
generated on your machine at first boot, and the version you're running.
That is the entire payload - no domain, no email, no keywords, no site or
Search Console data, no tokens, and the id isn't derived from any of them.

It exists because nothing else can answer "how many people actually run
this". Clone counts and image pulls measure download attempts, and one
person re-running `start.sh` looks identical to ten separate installs.

To turn it off, put this in your `.env` and re-run `sh start.sh`:

```
DISPATCHSEO_TELEMETRY=off
```

Nothing else changes - no nag, no degraded features, no reduced support.
The code is [`src/lib/heartbeat.ts`](../src/lib/heartbeat.ts) if you'd
rather read it than take our word for it.

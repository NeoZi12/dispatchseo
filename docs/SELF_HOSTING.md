# Self-hosting DispatchSEO

**The full guide lives on the docs site:
[dispatchseo.com/docs](https://dispatchseo.com/docs).** It's the same
step-by-step content, one page per task, and it's also served by your own
instance at `/docs` once you're running - so it works offline too. This
file is just the map.

The short version:

```bash
git clone https://github.com/NeoZi12/dispatchseo &&
  cd dispatchseo &&
  sh start.sh
```

Open the URL it prints (usually **http://localhost:3000**), choose a
dashboard password, and the setup wizard takes it from there.

## The guide, page by page

- **[Install on your own computer](https://dispatchseo.com/docs/docker-compose)** -
  Docker Desktop, the one command, what's running, the builder, upgrading.
  Includes the honest laptop-vs-always-on trade-off: builds catch up when a
  laptop wakes, but daily rank checks leave gaps, so serious use wants a
  machine that stays on (a ~$5 VPS, a Raspberry Pi, or a desktop that never
  sleeps).
- **[Install on a VPS](https://dispatchseo.com/docs/vps)** - the same
  command over SSH, three ways to reach the dashboard, and a copy-paste
  Caddy recipe for a real domain with automatic HTTPS.
- **[The setup wizard, step by step](https://dispatchseo.com/docs/setup-wizard)** -
  what each screen asks for and why: your site, the Search Console service
  account, keyword data (free mode vs DataForSEO), publish mode, one-tap
  merge, and the two pastes that connect Claude Code.
- **[Day to day](https://dispatchseo.com/docs/day-to-day)** - what using it
  actually looks like after setup, plus the data tiers.
- **[Troubleshooting](https://dispatchseo.com/docs/troubleshooting)** -
  where failures surface and fixes for the common cases.

## What you need

- **A computer that can run [Docker](https://docs.docker.com/get-docker/)** -
  about 1 GB of RAM. A laptop works for a test drive; something always-on
  for running it seriously.
- **Your website's code in a GitHub repo.** Content ships as pull
  requests, so git-based sites only; WordPress and other database-backed
  CMSes won't work.
- **Claude Code with a Claude subscription.** Your own agent does the
  research and writing on the plan you already pay for.
- **Google Search Console access to your site** - free, at
  [search.google.com/search-console](https://search.google.com/search-console).

## Advanced: environment variables

The wizard stores everything it collects (encrypted) in your own database,
so a normal install needs no hand-set variables beyond what `start.sh`
creates. An environment variable always wins over the wizard's stored
value; the full annotated list lives in
[`.env.docker.example`](../.env.docker.example).

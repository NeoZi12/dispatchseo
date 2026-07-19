# DispatchSEO

**Turn Claude Code into your SEO manager.**

The open-source alternative to SEObot and Outrank, built for Claude Code.
Other SEO tools learn about your product by crawling your homepage. Your
Claude Code already knows your product, because it probably built half of it.
DispatchSEO gives that agent the missing pieces: a research playbook, a
content pipeline that ships pull requests, rank tracking, and a dashboard
where you stay in control.

[![Deploy - new database](docs/buttons/deploy-new-db.svg)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNeoZi12%2Fdispatchseo&env=MCP_API_KEY,CRON_SECRET,DASHBOARD_PASSWORD&envDescription=Invent%20three%20random%20secrets%20-%20run%20%60openssl%20rand%20-hex%2024%60%20three%20times.%20They%20become%20your%20agent%27s%20MCP%20key%2C%20the%20cron%20key%2C%20and%20your%20dashboard%20password.&envLink=https%3A%2F%2Fgithub.com%2FNeoZi12%2Fdispatchseo%2Fblob%2Fmain%2Fdocs%2FSELF_HOSTING.md&project-name=dispatchseo&repository-name=dispatchseo&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)
&nbsp;
[![Deploy - your own database](docs/buttons/deploy-own-db.svg)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNeoZi12%2Fdispatchseo&env=MCP_API_KEY,CRON_SECRET,DASHBOARD_PASSWORD&envDescription=Invent%20three%20random%20secrets%20-%20run%20%60openssl%20rand%20-hex%2024%60%20three%20times.%20They%20become%20your%20agent%27s%20MCP%20key%2C%20the%20cron%20key%2C%20and%20your%20dashboard%20password.%20You%20connect%20your%20Supabase%20database%20right%20after%20deploying%20-%20see%20the%20guide%20link.&envLink=https%3A%2F%2Fgithub.com%2FNeoZi12%2Fdispatchseo%2Fblob%2Fmain%2Fdocs%2FSELF_HOSTING.md&project-name=dispatchseo&repository-name=dispatchseo)

The first creates a free Supabase database for you. The second skips that -
use it if your Supabase free plan is full, and connect your own database
right after deploying ([guide](docs/SELF_HOSTING.md)).

License: AGPL-3.0. Self-hosted has zero feature limitations. Everything the
paid cloud will do, this repo does today, in your own accounts, at $0.

![The dashboard Home: journey stage, publishing pace, and live Search Console stats for a connected site](docs/screenshots/home.png)

## How it works

1. **Your agent researches.** Claude Code connects to DispatchSEO over MCP,
   reads the served playbook, and mines keywords from your Search Console
   data, Google Autocomplete, and what it already knows about your product.
   Ideas land in a queue with the reasoning attached.
2. **You approve, or don't.** Each idea is a card on the dashboard: the
   keyword, why it's winnable, the angle. Approve, reject, or reorder.
   Prefer full autopilot? Flip on auto mode and skip the queue entirely.
3. **The pipeline builds.** Every morning a GitHub Action picks the oldest
   approved idea and builds it into a real pull request against your site's
   repo: a guide or a small free tool, checked against the live SERP and run
   through a sameness reviewer so page twelve doesn't read like page three.
4. **It tracks what happened.** Daily rank checks, hourly Search Console
   snapshots, index verification, and a journey view that tells you which
   SEO stage you're actually in. When a scheduled job breaks, you get a red
   banner and an email instead of silence.

The backend is deliberately boring: state, scheduling, and an approval gate.
The thinking happens in your agent, where your product knowledge already
lives.

<table>
  <tr>
    <td><img src="docs/screenshots/queue.png" alt="The queue: keyword ideas with volume and difficulty, each waiting for approval or set to auto"></td>
    <td><img src="docs/screenshots/guide-pr.png" alt="A pull request the pipeline built: target keyword, SERP gate verdict, archetype, and information-gain asset, all named in the description"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/search-traffic.png" alt="Search traffic: clicks and impressions from Google Search Console, snapshotted hourly"></td>
    <td><img src="docs/screenshots/rankings.png" alt="Keyword rankings: daily position checks with 30-day trend sparklines"></td>
  </tr>
</table>

## What's in the box

- **MCP server** with ~40 tools: the queue, keywords, rankings, pages, GSC
  stats, backlink prospects, trend topics, site profile. Anything the
  dashboard can do, your agent can do over MCP; parity between the two is a
  hard rule in this codebase.
- **Trend radar**: scan for rising topics in your niche, expand a topic into
  concrete guide angles, and queue the good ones.
- **Guide and tool builders**: guides publish on a pace matched to your
  site's age (so a three-week-old blog doesn't suddenly ship 30 posts);
  free-tool ideas build on approval.
- **Backlink playbook**: a prospect list prefilled with your product's copy,
  tracked per submission.
- **Multi-site**: one deployment manages any number of sites. Each project
  gets its own MCP token, its own data, its own settings.
- **A password-gated dashboard** for the one human in the loop.

## What it costs to run

Nothing, unless you want paid data. The tiers stack:

| Tier | Price | What you get |
| --- | --- | --- |
| Search Console only | $0 | Rankings from GSC, keyword ideas from Autocomplete plus your own impression data |
| + SerpApi free key | $0 | Live SERP checks, real positions weekly (250 free searches/month) |
| + DataForSEO | pay per call | Search volume, keyword difficulty, domain rating |

Free mode finds keywords you can win. Paid mode also knows which ones are
worth winning.

## What you need

- Your site's source in a GitHub repo. The pipeline ships content as pull
  requests, so git-based sites only; WordPress won't work.
- A Claude subscription with Claude Code. Your agent is the engine and it
  runs on your existing plan.
- Free accounts on Vercel and Supabase, and Google Search Console access to
  your site.

## Quick start

Click the deploy button above, then follow
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md). The short version: run the
database migrations, add a Google service account, enable the GitHub Actions
schedule, then paste one command into Claude Code inside your site's repo.
Your agent does the rest of the install itself, including writing its own
workflow files and setting its own secrets.

There's also an [llms.txt](public/llms.txt) and a [SKILL.md](SKILL.md) if
you'd rather point an agent at this repo and let it figure the setup out.

## Cloud version

A hosted version is coming for people who'd rather not manage a Vercel
deployment: bundled SERP data, one-click Search Console connection, managed
crons. Join the waitlist at [dispatchseo.com](https://dispatchseo.com).
Self-hosting will stay feature-complete either way; the cloud sells
convenience, not capability.

## Architecture, briefly

Next.js App Router on Vercel, Supabase for state, GitHub Actions for
schedules and builds, `mcp-handler` for the MCP server at `/api/mcp`. One
deployment is multi-tenant: the MCP bearer token selects the project, crons
loop over all projects, the dashboard switches with a cookie.
[CLAUDE.md](CLAUDE.md) has the full conventions; it's written for agents,
which turns out to make it decent documentation for people.

## Contributing

Issues before PRs, and you must understand every line you submit, including
the AI-assisted ones. Details in [CONTRIBUTING.md](CONTRIBUTING.md).
Questions go to [Discussions](https://github.com/NeoZi12/dispatchseo/discussions);
vulnerabilities go through [private reporting](SECURITY.md).

## License

[AGPL-3.0](LICENSE). Use it, self-host it, fork it. If you run a modified
version as a service, share the source. That's the whole deal.

---

[![Star History Chart](https://api.star-history.com/svg?repos=NeoZi12/dispatchseo&type=Date)](https://star-history.com/#NeoZi12/dispatchseo)

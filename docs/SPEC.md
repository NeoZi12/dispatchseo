# SEO Manager MVP — Claude Code Handoff Spec

## What we're building

A personal "SEO Manager" system for clockedcode.com. My own Claude Code becomes my SEO manager: it researches keywords, proposes guides/free tools/backlink targets, generates content as PRs on a schedule, and a backend tracks rankings + stats over time. Single user (me). No auth, no billing, no polish. Working > pretty.

**The loop when done:** daily cron finds opportunities + checks ranks → suggestions appear on a dashboard → I approve → daily agent run picks up approved items, generates the guide/tool, opens a PR on the ClockedCode repo → I merge → backend logs the page and tracks its keyword.

## Existing context

- Site: clockedcode.com (Next.js on Vercel). Blog/guides live in the repo as MDX (adjust paths to match actual repo structure — inspect first).
- Supabase account available (create a new project or new schema in existing one — ask me).
- DataForSEO account with API credentials (env: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`).
- Google Search Console already verified for clockedcode.com. Use a Google Cloud service account added to the GSC property (env: `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL=sc-domain:clockedcode.com`).
- My SEO playbook (encode into the skill):
  - Target keywords: KD < 10, volume > 500 (soft thresholds; KD<15/vol>300 acceptable if intent is perfect).
  - Every page must be genuinely the best answer on page 1 — no thin content.
  - Two content types: **guides** (MDX articles) and **free interactive tools** (React components/pages, e.g. calculators, generators) that funnel to ClockedCode with UTM-tagged CTAs.
  - Internal linking: every new page links to 2-3 existing relevant pages and gets linked from at least 1.
  - CTA/funnel block on every page with UTM params: `?utm_source=seo&utm_medium={guide|tool}&utm_campaign={slug}`.

## Architecture (3 repos/parts, keep it simple)

1. **`seo-manager-backend`** — Next.js (App Router) project deployed to Vercel. Contains: MCP server endpoint, cron endpoints, the dashboard page. One project, one deploy.
2. **Supabase** — state.
3. **ClockedCode repo** — receives generated PRs via GitHub Action + gets the skill file.

External MCP: use the existing official DataForSEO MCP server in Claude Code for ad-hoc research (I'll configure it myself in `.mcp.json`). The backend ALSO calls DataForSEO REST API directly for crons. Don't rebuild what DataForSEO MCP already does — my MCP only handles STATE.

---

## Phase 1 — Supabase schema

Tables (use SQL migration file):

```sql
-- tracked keywords
keywords (
  id uuid pk default gen_random_uuid(),
  keyword text not null unique,
  search_volume int,
  keyword_difficulty numeric,
  cpc numeric,
  intent text,                        -- informational/commercial/etc
  status text default 'tracking',     -- tracking | paused
  target_page_id uuid null references pages(id),
  created_at timestamptz default now()
)

-- rank history (one row per keyword per check)
rank_checks (
  id uuid pk default gen_random_uuid(),
  keyword_id uuid references keywords(id) on delete cascade,
  position int,                       -- null = not in top 100
  url text,                           -- which page ranks
  checked_at timestamptz default now()
)

-- published pages
pages (
  id uuid pk default gen_random_uuid(),
  url text not null unique,
  title text,
  type text,                          -- guide | tool | landing
  primary_keyword text,
  published_at timestamptz,
  pr_url text,
  created_at timestamptz default now()
)

-- the suggestions queue (heart of the system)
suggestions (
  id uuid pk default gen_random_uuid(),
  type text not null,                 -- guide | tool | backlink | update
  title text not null,
  primary_keyword text,
  keyword_volume int,
  keyword_difficulty numeric,
  rationale text,                     -- why this is worth doing
  spec jsonb,                         -- brief: outline, angle, tool functionality, target url for backlinks
  status text default 'pending',      -- pending | approved | rejected | in_progress | done
  result_pr_url text,
  created_at timestamptz default now(),
  decided_at timestamptz,
  completed_at timestamptz
)

-- daily GSC snapshot
gsc_stats (
  id uuid pk default gen_random_uuid(),
  date date not null,
  clicks int, impressions int, ctr numeric, avg_position numeric,
  top_queries jsonb,                  -- [{query, clicks, impressions, position}] top 20
  top_pages jsonb,
  unique(date)
)

-- backlink prospects
backlink_prospects (
  id uuid pk default gen_random_uuid(),
  domain text not null,
  url text,
  domain_rating numeric,
  reason text,                        -- why relevant / where found
  status text default 'new',          -- new | contacted | acquired | rejected
  created_at timestamptz default now()
)
```

No RLS complexity — single user. Use the service role key server-side only.

## Phase 2 — Backend API + MCP server

Next.js project `seo-manager-backend`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`, `MCP_API_KEY` (single static key I generate — simple bearer check), `CRON_SECRET`.

### MCP server

Route: `app/api/mcp/route.ts` using `@vercel/mcp-adapter` (or `mcp-handler`) — Streamable HTTP transport so it works in Claude Code, Codex, and Cursor. Auth: require `Authorization: Bearer ${MCP_API_KEY}`.

Tools (zod-validated, return structured JSON):

| Tool | Input | Behavior |
|---|---|---|
| `get_suggestions` | `status?` (default `approved`), `type?` | List suggestions from queue |
| `propose_suggestion` | `type, title, primary_keyword, volume, kd, rationale, spec` | Insert with status `pending` |
| `update_suggestion` | `id, status?, result_pr_url?` | Agent marks `in_progress`/`done`, attaches PR |
| `track_keywords` | `keywords: [{keyword, volume?, kd?, cpc?, intent?}]` | Upsert into keywords table |
| `get_rankings` | `keyword?`, `days?` (default 30) | Rank history, incl. position deltas |
| `log_page` | `url, title, type, primary_keyword, pr_url?` | Insert into pages |
| `get_pages` | — | List published pages (for internal-linking decisions) |
| `get_site_stats` | `days?` (default 28) | Latest GSC snapshots + trend summary |
| `add_backlink_prospect` | `domain, url?, reason` | Insert prospect |
| `get_backlink_prospects` | `status?` | List prospects |

Keep tool descriptions rich — the agent decides from them.

### Cron endpoints (Vercel Cron, protected by CRON_SECRET)

**`/api/cron/daily-ranks`** (daily ~06:00 Israel):
1. For all `tracking` keywords, batch-call DataForSEO SERP API (Google organic, live or task-based — prefer `serp/google/organic/live/regular`, location: United States, language: en). Find clockedcode.com position in top 100. Insert `rank_checks` rows.
2. Pull GSC Search Analytics for yesterday (clicks, impressions, ctr, position + top 20 queries/pages). Upsert `gsc_stats`.

**`/api/cron/weekly-opportunities`** (weekly, Monday):
1. Call DataForSEO Labs `keyword_ideas`/`related_keywords` seeded from: my tracked keywords + top GSC queries + seed list in a config table or env (e.g. "claude code", "mcp servers", "ai coding setup").
2. Filter: volume > 500 AND KD < 10 (and not already tracked/covered by an existing page).
3. For top 5-10, insert `suggestions` rows: type `guide` or `tool` (heuristic: "calculator/generator/checker/template" pattern keywords → tool, else guide), with rationale (volume, KD, intent, gap) and a minimal spec `{suggested_angle, serp_notes}`.
4. Also: check pages ranking positions 5-15 in GSC → propose type `update` suggestions ("push to top 3").

Log everything; failures should not silently pass (send failure to console + a simple Telegram webhook if easy — optional).

## Phase 3 — The skill (in ClockedCode repo)

`.claude/skills/seo-manager/SKILL.md` — the playbook. Contents:

- **Role:** "You are the SEO manager for clockedcode.com."
- **Data tools:** DataForSEO MCP for raw research; `seo-manager` MCP for all state (queue, tracking, logging).
- **Quality bar + thresholds** (from playbook above), content patterns for guides (MDX frontmatter format, H2 structure, FAQ block, internal links, CTA block with UTM) and tools (where components live in the repo, page route pattern, styling conventions — INSPECT THE REPO and document actual conventions in the skill).
- **Workflows** (as named procedures):
  - `/seo-research <topic>` — research keywords via DataForSEO MCP, apply filters, `track_keywords` the winners, `propose_suggestion` for the best 3.
  - `/seo-build` — `get_suggestions(status=approved)`, take the oldest, mark `in_progress`, generate the guide/tool per conventions, create branch + commit + PR (via `gh` CLI), `update_suggestion(done, pr_url)`, `log_page`.
  - `/seo-report` — `get_rankings` + `get_site_stats`, summarize what moved and what to do next.
  - `/seo-backlinks` — given a keyword/competitor, find linking domains via DataForSEO backlinks endpoints, `add_backlink_prospect` for relevant ones with reasons.
- **Rules:** never publish directly to main; always PR. Never fabricate data — if a tool call fails, say so.

## Phase 4 — Scheduled generation (GitHub Action)

`.github/workflows/seo-daily.yml` in ClockedCode repo:
- Schedule: daily 05:00 UTC + `workflow_dispatch`.
- Steps: checkout → run Claude Code headless (`claude -p "Run the /seo-build workflow. If no approved suggestions exist, exit without changes."`) using `anthropics/claude-code-action` or CLI with `CLAUDE_CODE_OAUTH_TOKEN` secret → action opens PR via `gh`.
- Secrets needed: `CLAUDE_CODE_OAUTH_TOKEN` (I'll generate with `claude setup-token`), `SEO_MCP_URL`, `SEO_MCP_API_KEY` (inject MCP config for headless run via `--mcp-config`).
- Concurrency: skip if a previous seo PR is still open (check via `gh pr list --label seo` first) — avoid PR pileup. Label all PRs `seo`.

## Phase 5 — Dashboard (one page, ugly is fine)

Route `/` in the backend project, protected by a simple password check (env `DASHBOARD_PASSWORD`, cookie). Server components + a few client bits. Sections top to bottom:

1. **Stats strip:** last 28d GSC clicks/impressions + trend arrows.
2. **Suggestions queue:** pending suggestions as cards (title, type badge, kw + volume/KD, rationale, expandable spec) with Approve / Reject buttons (server actions updating status). Show in_progress/done below with PR links.
3. **Keywords table:** keyword, volume, KD, current position, 7d/30d delta, tiny sparkline (last 30 checks — inline SVG, no chart lib needed).
4. **Pages:** published pages with primary keyword + current rank.
5. **Backlink prospects:** table with status dropdown.

Mobile-usable (I'll approve from my phone). No design system needed — Tailwind defaults.

## Build order & acceptance

1. Supabase schema + seed a few keywords manually → ✅ tables exist.
2. MCP server deployed → ✅ I connect it in Claude Code (`claude mcp add --transport http seo-manager <url> --header "Authorization: Bearer <key>"`) and `track_keywords` + `get_rankings` work.
3. Daily ranks cron → ✅ rank_checks rows appear for seeded keywords; gsc_stats row for yesterday.
4. Skill written → ✅ `/seo-research "claude code hooks"` produces tracked keywords + pending suggestions.
5. Dashboard → ✅ I approve a suggestion from my phone.
6. `/seo-build` manual run → ✅ PR opens on ClockedCode repo with a guide meeting the conventions.
7. GitHub Action → ✅ scheduled run picks up an approved suggestion and opens a PR unattended.
8. Weekly opportunities cron → ✅ Monday: new suggestions appear without my input.

---

## Phase 6 — Post-MVP review (added 2026-07-13): gaps to "fully automated" + SEO quality bar

Audit of the built system against the "my Claude Code is my fully-automated SEO manager" goal. Two buckets: (A) the connective-tissue automations still missing, and (B) the SEO quality/safety upgrades the content pipeline needs to survive 2026 Google. Nothing here contradicts the MVP; it's the next layer.

### A. Gaps to "fully automated" (connective tissue)

1. **Scheduled builder wired to the approved queue [automation, HIGH].** Phase 4's `seo-daily.yml` is specced but NOT built, so approved suggestions from `/seo-research` never build unattended. Separately, the ClockedCode guide machine (04:00 UTC) builds from `guides-tier-list.md`, not the suggestions queue, so the two content pipelines are disconnected. Resolve the Phase-4 deferral in `LATER.md`: fold the tier-list items into the queue as pre-approved entries, then ship one scheduled builder that drains the queue. Until then, the queue is a notepad and the founder still pastes `/seo-build` by hand.
2. **Auto-indexing on publish [automation, MEDIUM].** IndexNow ping + GSC URL submission are manual for guide PRs (only the changelog machine auto-pings). On PR merge, auto-run `pnpm indexnow` and submit the new URL. GSC has no URL-submission path today.
3. **Backlink loop [automation, MEDIUM].** `add_backlink_prospect`/`get_backlink_prospects` are pure storage. Prospects sit at status `new` forever: no discovery cron, no status refresh, no outreach wiring. Either connect the existing creator-outreach VPS cron to the `backlink_prospects` table, or add a weekly prospecting cron. Outreach itself stays human.
4. **Cron failure alerting [automation, MEDIUM].** Crons return HTTP 500 into Vercel logs with no notification (see `LATER.md`). A dead nightly rank cron goes unnoticed. Promote the deferred Telegram/webhook ping to built now that crons are load-bearing.
5. **One dashboard that shows AND triggers [dashboard, MEDIUM].** The backend dashboard shows status but the only action is Approve/Reject. Every other action ("build this", "run research") routes back through pasting a slash command into Claude Code. Add trigger buttons (call the scheduled builder / kick research) so the dashboard is a control panel, not just a mirror. Optional stretch: surface a read-only SEO strip inside ClockedCode's own product dashboard so there's a single pane. Note: rankings/GSC live in the separate "Neo-Seo" Supabase, so a shared read path is needed first.

### B. SEO quality bar for 2026 (verified against Google's March 2026 core update)

Context: Google's **March 2026 core update explicitly targeted "scaled content abuse"** — AI-heavy info sites publishing at volume lost 50-80% of traffic. The current design is safe ONLY because a human is on the merge button and volume is low. These upgrades harden the content itself.

6. **The human merge is a permanent design rule, not a temporary MVP shortcut [safety, CRITICAL].** Never auto-merge ranking content (guides/tools). Draft PR -> human review -> merge is the line between "AI content that ranks" and "deindexed." Cap reviewed output at ~1 guide per 1-2 days; an unnaturally consistent high-volume cadence is itself a spam signal. The changelog auto-push stays acceptable only because posts are short factual product updates, not ranking-bait — keep them genuinely informative.
7. **Named-author E-E-A-T on every guide [quality, HIGH — cheapest, highest ROI].** Guides currently read as disembodied AI output. Add to the guide template: a real byline, a one-line credential ("solo dev, built ClockedCode, analyzed N token-waste reports"), Organization + Author JSON-LD tied to a verified profile, and visible published/updated dates. This is the specific thing the March 2026 update rewarded on recovery.
8. **Required first-hand-proof slot per guide [quality, HIGH].** Google penalized "no first-hand experience, content identical to what already ranks." Add a mandatory template slot for something only a real Claude Code user could produce — an own screenshot, a UsageCut token-waste number, a real config. Enforce it as a merge gate: a guide that can't fill it does not merge. This is also what earns AI-engine citations.
9. **Deliberate internal linking / topic clusters [quality, HIGH — free PageRank].** No evidence of a hub-and-spoke system today. Every guide should link into the money pages (Templates, tool pages, ClockedCode home) with descriptive anchors and cross-link related guides. Have the manager track and flag "orphan" pages (fewer than 2 internal links in). The MVP spec already asked for "links to 2-3 existing pages + linked from 1" (line 19) — this makes it measurable and enforced.
10. **AI-citation tracking, not just GSC ranks [data, MEDIUM].** GSC shows Google rankings only. It does not show whether ChatGPT / Perplexity / Google AI Overviews cite clockedcode.com. Add a monthly ~20-minute check: ask the 10 target questions across those engines, log cited/not next to GSC data. Pages updated within 30 days get ~3.2x more AI citations; stale-3-months pages are ~3x more likely to lose them — so also flag best guides for a <30-day refresh cadence. This is the real 2026 scoreboard.

### What SHOULD stay automated vs human (the ceiling)

- **Fully automate:** keyword research, SERP/backlink/rank data pulls, ranking tracking, content *suggestions*, backlink *prospecting*, ecosystem-news radar, and drafting guides as *draft PRs*. Pure research + drafting = leverage, zero ranking risk.
- **Keep human judgment (never automate):** the publish/merge trigger, the unique-value/first-hand-proof check, and publishing volume/cadence.
- **Verdict:** the realistic ceiling of a "fully automated SEO manager" for a solo founder is a fully automated *research-and-draft* manager with a human editor-in-chief. That's not a limitation; it's the design that survives core updates. Keep SEO in its lane as the background channel (~10-15% of time); short-form video + the DM funnel stays primary.

---

## Explicitly OUT of scope (do not build)

Auth/multi-user, billing, onboarding, DataForSEO proxying/metering, email notifications, chatbot in dashboard, charts libraries, dark mode, settings pages, mobile app. If tempted, add a `LATER.md` note instead.

## Questions to ask me before starting

1. New Supabase project or schema in existing one?
2. ClockedCode repo structure for guides (MDX path) and tools (routes/components) — inspect and confirm conventions with me.
3. Seed keyword list for the opportunities cron.
4. Confirm DataForSEO plan has SERP + Labs API access.

# The quality & delivery plan: better output, better pace, better felt progress

Written 2026-07-15, expanded same day. Basis: three research passes — (1) how
the successful AI-SEO products (SEObot, Outrank, Arvow, Koala, Byword)
operate, (2) which anti-sameness/quality mechanisms have real evidence,
(3) what the SEO market pays for + how products survive the 3-6-month
results lag. Standing verdicts live in project memory
(`market-research-verdicts.md`); this file is the EXECUTION plan. Everything
here is buildable in the current product today — no billing, no landing
page, no new accounts except one optional email provider in the last phase.

**Why this plan:** DispatchSEO already has the category's converged pipeline
plus the two guards competitors skip (human approval, age-based pacing). The
documented failure modes of the successful products are (a) low-intent
keyword selection, (b) template sameness at scale, (c) customers churning in
the first 90 days because nothing *feels* like progress before traffic
arrives. Tracks A-C attack exactly those three, in that order.

**Keep untouched:** approval gate, SERP thin-content gate, one-PR-in-flight,
"Why this pace" dialog.
**Never build:** a customer-to-customer backlink exchange (the one competitor
feature reviewers consistently call a genuine Google link-scheme risk).

---

# Track A — Content quality (the output itself)

## A1. Commercial-intent keyword selection — instructions edit, ~1h

**Why:** the #1 documented complaint against Outrank/Babylovegrowth: default
keyword picks are easy informational queries → impressions rise, revenue
flat. Selection quality beats prose quality.

**Changes:**
- `src/lib/instructions/research.ts` — add an intent-mix rule to the weekly
  research workflow: each run's queued ideas must be ≥50% commercial or
  comparison intent ("X vs Y", "best X for Y", "X alternatives", "X
  pricing", use-case + tool queries). Informational "what is X" ideas are
  capped and must justify themselves in the rationale (feeder for a
  commercial cluster, or AI-answer visibility play). Each proposal's
  rationale names its intent class.
- Update `RESEARCH_STEPS` plain text to match (the Instructions page renders
  it).
- Bump `INSTRUCTIONS_VERSION`; smoke-test:
  `node --env-file=.env.local scripts/mcp-instructions-test.mjs`.

**Done when:** the next research run's queue is majority commercial-intent
and every rationale names the intent class.

## A2. Information gain as a required, named build step — instructions edit, ~1-2h

**Why:** strongest-evidenced survival factor across 2024-2026 Google updates
(proprietary data was a top-3 predictor of holding traffic in a 400-site
post-update analysis) and the mechanism that earns citations from AI answer
engines. Today it's one buried line ("include ONE thing that exists nowhere
else"); promote it to a mandatory pipeline step.

**Changes:**
- `src/lib/instructions/build-guide.ts` — new named step **INFORMATION
  GAIN** between GATE and DRAFT. Before drafting, the builder must produce
  at least one asset that exists on no competitor page, from this menu:
  (a) a command/config actually run for this article, with its real output;
  (b) an original measurement or benchmark (timed, counted, compared);
  (c) the site's own data turned into a citable statistic — `get_site_stats`
      / `get_rankings` give rank + traffic history over MCP;
  (d) an original worked example or config no docs page shows;
  (e) a defended, explicit stance where the SERP hedges.
  The run report must name the asset ("information gain: measured cold-start
  times for X vs Y, table in section 3"). No asset, no draft — same posture
  as the thin-content gate. For manual ideas the rule is advisory (owner
  asked by name), but the report still says what was or wasn't added.
- `src/lib/instructions/build-tool.ts` — lighter mirror: every tool page's
  description/FAQ carries one real, tool-specific data point or tested
  example, never generic filler copy.
- Bump `INSTRUCTIONS_VERSION`; smoke-test as A1.

**Done when:** every new guide PR's run report names its information-gain
asset and spot-checks confirm the asset is real.

## A3. Corpus sameness defense — the one real feature

**Why:** template convergence across a site's OWN articles is the
scaled-content-abuse fingerprint, invisible in per-PR review, and NO
commercial tool (Surfer/Clearscope/MarketMuse/Semrush) checks it. Two
layers: stop it pre-publish, see it site-wide.

### A3a. Pre-publish sameness gate — SHIPPED 2026-07-15

**Built as an MCP tool, not a pipeline-pack script** (deviation from the
original plan, on purpose). The connected repo runs one prompt — "call
`get_instructions(build-guide)` and follow it" — and holds only workflows +
`mcp-ci.json`; a script living there would have to be committed to every
project repo and re-synced forever, which is exactly the thin-shim rule this
product exists to keep. The gate is centrally served instead: it reaches
every project's next run with zero repo churn, like every other policy.

- `src/lib/similarity.ts` — deterministic, dependency-free comparison math.
  Three signals: an identical opening 6-word run; an H2 skeleton >60% the
  same *once each guide's own keyword is stripped* (which is the trick —
  "What is <kw>?" across two topics collapses to the same skeleton and the
  template shows itself); >3 stock 5-word phrases shared with most of the
  catalogue. Thresholds are constants at the top. Also exports `pairScore`
  for A3b.
- `check_sameness` MCP tool — takes the final markdown + primary keyword,
  fetches this project's last 8 published guides (the real live corpus,
  which the agent cannot influence), returns pass/fail + the exact offending
  strings. **Fails open** on any DB/fetch error, matching `getPacing` — a
  hiccup can never halt a morning build.
- `build-guide.ts` VERIFY step calls it after the humanizer and must rewrite
  until it passes; never argue with a fail, never reword the check.
- `scripts/sameness-test.mjs` — smoke test: synthetic corpus proves all
  three signals fire and that the false-positive guards hold; live-corpus
  half asserts extraction still works against the real site.

**Two bugs the real-data testing caught** (both would have failed builds or
lied):
1. *Title leak.* 64 of 65 "shared phrases" across the real catalogue were
   other guides' **titles**, arriving as related-post/link anchor text. Since
   the body contract mandates 2-3 sibling links, a compliant draft would have
   been flagged for obeying instructions. Fixed by pooling words from prose
   `<p>` only and stripping anchors within each paragraph.
2. *Paragraph-eating regex.* A document-wide `/<a...>[\s\S]*?<\/a>/` silently
   swallowed the intro, TL;DR and first two paragraphs of a live guide (the
   next `</a>` sat far below). Fixed by stripping anchors only inside
   already-bounded chunks. Plus `&#x27;` (27 per page) now decodes, so
   contractions match instead of tokenizing as `wasn`/`x27`/`t`.

**Done:** planted duplicate → flagged with the exact string; distinct draft →
passes; the 5 real published guides do not flag each other; verified live
over MCP end-to-end.

### A3b. Weekly drift audit + dashboard card — DROPPED 2026-07-15

Cut after the gate shipped, on the owner's challenge: *"what's the point if
we're already checking each guide, and what would I even do about the card?"*
Both halves land.

**It is nearly redundant.** The gate compares each new draft against the last
8 published guides — a ROLLING window. For a corpus to converge into one
template you need many guides sharing a skeleton, and the gate makes that
impossible: no guide can match the 8 before it, so there is no run of 9 to
converge, and alternating patterns (A,B,A,B) are caught too since the twin is
inside the window. What the audit adds over that is long-range pairs (guide
#40 vs #12, never compared) — two similar pages 28 apart is not the
scaled-content profile, it is a coincidence.

**And its output is not actionable.** A card saying "#12 and #40 read alike"
concerns two pages that are already published and indexed. The realistic
options are rewrite (expensive, nobody will), delete (worse), or ignore.
A card you will always ignore is noise, and noise on a dashboard costs
attention that the cards that DO demand action need.

**The residual need is already covered, for free.** The legacy question —
"are the guides published BEFORE the gate existed already converging?" — is a
one-time check, and `scripts/sameness-test.mjs` answers it on demand: its
live-corpus half compares every published guide against all the others. Run
it whenever the question comes up. It answered "no" on the first run
(5 guides, zero flags). `pairScore` stays exported in similarity.ts if a
future need for scored pairs appears.

**If it ever comes back**, the honest trigger is not "two pages look alike" —
it is "the gate's fail rate is climbing", which is a signal about the system,
not about a page.

## A4. Archetype rotation by SERP intent — instructions edit, ~1h

**Why:** structural sameness starts at the outline, and intent mismatch is
the documented reason identical templates rank #1 for one query and #7 for
its twin (NerdWallet case). Let the SERP pick each article's shape.

**Changes:**
- `src/lib/instructions/build-guide.ts` TEMPLATE step: classify the target
  query's dominant SERP shape from the `check_serp` results already fetched
  — tutorial / comparison / data piece / opinionated take /
  checklist-reference — and pick the archetype accordingly. The archetype
  must differ from the last 2-3 published guides unless the SERP clearly
  demands otherwise. Record the pick in the run report and in the
  suggestion's spec (`archetype: "comparison"`), so A3b can later report
  archetype distribution.
- Bump `INSTRUCTIONS_VERSION`; smoke-test.

**Done when:** the last 5 guide PRs show ≥3 distinct archetypes, each report
naming its pick and the SERP evidence for it.

---

# Track B — Delivery pace

## B1. Compress the pacing ramp: daily at day 60 — SHIPPED 2026-07-15 (`1e03020`)

**Why (research verdict):** Google does not police publishing velocity — on
record, repeatedly. The ramp's real jobs are (1) matching output to what a new
domain can absorb (nothing ranks in the first weeks anyway) and (2) limiting
blast radius while a new site's template proves itself. Four months to daily
was more conservative than any evidence requires.

Shipped as three tiers: `{0: 3/week}, {30: 5/week}, {60: 7/week}`. Superseded
same day by B2 — see below.

## B2. Fast lane: daily from day 30 — SHIPPED 2026-07-15

`PACING_TIERS` is now two tiers: `{0: 5/week "brand new"}, {30: 7/week
"established"}`.

The gate changed the calculus rather than time passing. Of the ramp's two
jobs, blast-radius control is now carried by something strictly better than
waiting: `check_sameness` blocks a re-skinned guide from shipping AT ALL,
whatever the site's age — a mechanical stop, not a slower drip. What is left
is only the crawl-capacity hedge for a fresh domain, which day 0-29 at 5/week
covers. (The original gate on this was "A3a + A3b clean for two weeks"; A3b
was dropped as redundant, and the two-week soak was a proxy for confidence the
gate works — which its test suite demonstrates directly.)

Everything downstream reads the constant — instructions via
`{{WEEKLY_GUIDE_TARGET}}`, the MCP, the why-this-pace dialog (fully
data-driven: it maps the tiers and derives the ranges) — so this was a
one-place edit.

**Effect:** ClockedCode (~40 days) moves from 5/week to daily. Watch the GSC
per-page indexing rate over the next fortnight; if new pages start taking
noticeably longer to index, that — not a Google penalty — is the real signal
the pace outran the domain.

---

# Track C — What the client sees (felt progress before traffic)

**MOVED OUT 2026-07-15 → `docs/DASHBOARD_PROGRESS.md`.** C1-C3 (the journey
stage line, the weekly delta strip, milestone moments) are being folded into
the dashboard UI redesign rather than bolted on as separate cards - they are
a story the whole dashboard should tell, not three widgets. The what and why,
including every data source and the honesty rule, live in that file.

Why it still matters, in one line: 67% of churn in this category happens in
the first 90 days - exactly the window where SEO cannot show traffic yet - and
the survivors all bridge it by making something move weekly that isn't traffic
plus saying the timeline out loud at signup.

## C4. Weekly digest email — deferred 2026-07-15

Resend (free tier, `RESEND_API_KEY`, verify the sending domain once), a
`weekly-digest` cron, content = the journey line + weekly deltas + milestones
+ what shipped and what's queued. Deferred by the owner - not today. The
in-dashboard version (DASHBOARD_PROGRESS.md) carries the same value without a
new vendor; the email is reach, not information. Whenever it happens, the same
channel also solves the LATER.md "cron failure notifications" item for free.

---

# Parked (real decisions, wrong time — revisit at landing page / cloud launch)

Not part of this plan's execution; recorded so they aren't lost (details in
memory `market-research-verdicts.md`):
- **Positioning copy:** sell as the $49-149/mo tool tier (SEObot/Outrank's
  validated segment), never as an agency replacement; the link-execution gap
  is category-standard.
- **Annual billing** ("2 months free" framing): the best-quantified
  retention lever (92% vs 68% twelve-month retention) — needs billing to
  exist first.
- **90-day money-back guarantee tied to impressions** (Babylovegrowth
  model): needs a pricing page to exist first.

---

# Execution order

| # | Session | Items | Size | Notes |
|---|---|---|---|---|
| 1 | Instructions + pace | A1, A2, A4, B1 | ~half day | ✅ DONE 2026-07-15 (`1e03020`) — plus two headless-realism fixes (`5bf0cf3`, `aa655a4`) |
| 2 | Sameness gate | A3a | ~half day | ✅ DONE 2026-07-15 (`1b4c2d0`) — as an MCP tool, not a repo script (see A3a) |
| 3 | Fast lane | B2 | ~1h | ✅ DONE 2026-07-15 — daily from day 30; the gate replaced the soak period |
| 4 | Client-facing progress | C1–C3 | — | → folded into the dashboard UI redesign (`docs/DASHBOARD_PROGRESS.md`) |
| — | Dropped | A3b | — | Redundant against the rolling-window gate, and its card was unactionable |
| — | Deferred | C4 | ~half day | Digest email — owner's call, another day; needs Resend |

**This plan is essentially complete.** Everything that changes what gets
BUILT and SHIPPED is live. What remains is the progress story (now the
redesign's job) and an optional email.

# How we'll know it worked

- Research queue: majority commercial-intent, intent class named per idea.
- Every guide PR report names a real information-gain asset + archetype.
- Sameness gate: fails planted duplicates, passes normal drafts. Watch its
  fail RATE — climbing means the prose is genuinely converging and the
  instructions need work; permanently zero on a growing corpus means the
  thresholds are too loose to be doing anything. Re-run
  `scripts/sameness-test.mjs` whenever the thresholds are touched.
- ClockedCode on daily from day 30: the number to watch is the GSC per-page
  indexing rate as volume rises. If new pages take steadily longer to get
  indexed, the pace has outrun what the domain can absorb — that, not a
  penalty, is the honest signal to ease off.
- Home tells a story on day 3 of a new project rather than showing zeros
  (owned by the redesign — `docs/DASHBOARD_PROGRESS.md`).

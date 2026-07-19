# The progress story: what the dashboard tells you before traffic arrives

Split out of `docs/QUALITY_PLAN.md` (track C) on 2026-07-15 to be folded into
the dashboard UI redesign rather than bolted on as its own screens. This file
is the WHAT and WHY; the redesign owns the where and how it looks.

## The problem this solves

SEO shows nothing for the first two months. Impressions move around month 3,
real clicks months 4-7. That gap is the single biggest killer in this
category: **67% of churn in AI-SEO products happens in the first 90 days** -
exactly the window where the product physically cannot show traffic yet, so
the dashboard shows zeros and the owner concludes it isn't working and quits.

The products that survive the gap all do the same thing: make something move
every week that ISN'T traffic, and say the timeline out loud up front so "no
traffic yet" reads as an expected checkpoint instead of a failure.

Every number below is derivable from data DispatchSEO already stores - no new
vendor, no new table, no new integration.

**The honesty rule that governs all of it:** never manufacture movement. A
flat week says flat. A down week says down. The journey line is what supplies
the context ("flat is normal at this stage"), not a massaged number. The
moment this becomes a vanity dashboard it stops being trusted, and a
dashboard nobody trusts is worse than zeros.

## 1. The journey line — where you are, and what happens next

A stage derived from data, shown near the top of Home, with an honest
expectation attached. New module (`src/lib/journey.ts`) computing:

- **Foundation** — no impressions yet. "Content is being built and indexed.
  Impressions typically start moving around month 2-3."
- **First signals** — impressions > 0. "Google is showing your pages. Clicks
  usually follow within weeks."
- **Traction** — clicks arriving, first top-10 ranks. "Pages are earning
  clicks. The compounding phase starts here."
- **Compounding** — 6mo+, sustained clicks. "Authority is building. Every new
  guide starts from a stronger base."

Inputs, all already stored: `siteAgeDays` (pacing.ts), pages shipped
(`pages`), first non-zero impressions / first click (`gsc_stats`), first
top-10 (`rank_checks`). Output: stage, month number, the expectation line,
and the next milestone to watch for.

Also: a **"what happens next" step in the onboarding wizard** carrying the
same month-by-month script in static form (months 1-2 foundation, month 3
impressions, 4-7 first traffic, 6-12 compounding). Setting the expectation at
signup is what converts "nothing yet" from a cancel trigger into a checkpoint.

MCP parity: add the journey object to `get_overview`.

## 2. The weekly strip — leading indicators with real deltas

New module (`src/lib/progress.ts`): week-over-week deltas from existing
tables - guides + tools shipped (`pages`, last 7d vs prior 7d), impressions
and clicks (`gsc_stats`), keywords tracked (`keywords`), pages newly indexed
(`indexed_at` / first impressions), DR movement (`domain_ratings`).

Reads as one compact line: *"This week: 3 guides shipped · impressions +18% ·
2 pages newly indexed · DR 12 → 13"*. Show a metric only when it genuinely
moved, or when flat is itself informative (and then say so plainly).

MCP parity: expose via `get_site_stats` or `get_overview`.

## 3. Milestones — the first-time moments

Derived on the fly, no migration needed at this scale: first page live, first
page indexed, first impression, first click, first top-10 rank, 100th click.
Natural home is `journey.ts`.

Surface: a one-line celebration on Home when one happened in the last 7 days
("First click from Google this week 🎉"), plus a line in the Activity card.
These are the moments worth remembering in month 2, when the traffic graph is
still a flat line.

## Done when

A fresh project shows Foundation with the timeline on day 1 - a story, not
zeros - and ClockedCode shows its true stage, real deltas, and real milestone
dates from live GSC data.

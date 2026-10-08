# DispatchSEO site facts

The reference card every SEO workflow reads before acting. Written by the
setup workflow (2026-07-16, instructions v2026-07-16.4); re-run `/seo-setup`
after stack or positioning changes. Dogfood note: this site IS a DispatchSEO
backend deployment - the product manages its own marketing site.

## Product

DispatchSEO - a self-hosted SEO manager the owner's coding agent (Claude Code
or Codex) drives over
MCP: agents research keywords, queue content ideas, build guides/tools as
PRs; the backend tracks ranks (DataForSEO) + Google Search Console daily and
serves a password-gated dashboard for approvals. One deployment manages many
sites (multi-tenant by MCP bearer token). A paid cloud version is planned;
the launch plan lives in the maintainer's untracked `docs-private/`.

**The problem it sells the fix to:** a founder running a code-built site
(a SaaS, an indie product, a dev tool) knows SEO compounds and never gets to
it - keyword research, a post a week, watching ranks and Search Console.
DispatchSEO is the answer to "who does my SEO and marketing content", not to
"how do I run a coding agent". **The subject of this site's content is SEO,
GEO (showing up in ChatGPT, Perplexity and AI Overviews) and marketing for
SaaS and indie founders:** keyword research, content operations, rank
tracking, Search Console, technical and programmatic SEO, AI visibility,
launch and distribution marketing, and automating any of it as a founder.
Coding agents, MCP, Vercel and the rest are how the product is BUILT and what
its readers happen to run - they are not the subject. (See the quality bar's
product-is-the-answer test; this paragraph is what it reads.)

**Off-remit, hard - owner's decision 2026-10-08.** Claude Code, Codex,
Cursor, MCP servers, agent orchestration and every coding-agent how-to
("claude code timeout", "claude code hooks", "best mcp servers for claude
code", "claude code vs cursor") are OUT, whatever their volume or KD. Those
queries belong to the owner's other site, clockedcode.com, which already
holds 60+ guides on them; a second copy here ranks for nothing and blurs
what this site is about (35 such guides shipped here between July and
October 2026 - none of them index or rank). The only place Claude Code or
Codex appears on this site is as the thing that runs the SEO workflow,
inside a guide whose subject is the SEO work. Strike these at the remit
step, before pricing anything.

**Also off-remit: "<tool> alternative" churn.** This site shipped ten
"<SEO tool> alternative" pages in ten days (2026-08-15 to 08-24) and lost
~99% of its impressions in Google's August 2026 spam update the same week.
Comparison and alternative pages are allowed only when the product is the
honest answer and the page carries real first-hand data, and a run may queue
at most ONE of them per week.

**Facets** - the honest descriptions of this product's job, most direct first.
The research run measures these against the site's current authority every week
and works whichever is winnable (research step 1.5). All five are SEO or
marketing markets; there is deliberately no "agents" or "coding-agent
tooling" facet any more - that is what produced the Claude Code drift.
1. **SEO for SaaS and indie founders** - the whole SEO job for a one-person
   company: what to do, in what order, what to skip, what it costs
2. **SEO automation** - doing the SEO work itself unattended, keyword
   research to published page, as a founder's workflow rather than an agency's
3. **GEO / AI visibility** - getting cited by ChatGPT, Perplexity and AI
   Overviews, and measuring whether you are
4. **Rank tracking + Search Console** - the measurement half: reading the
   data, cheap or self-hosted tooling, what the numbers mean for a young site
5. **Founder marketing for code-built sites** - content, programmatic SEO,
   launch distribution, done from a repo instead of a CMS

Product-surface files to read fresh each research run.

Positioning - what the site is ABOUT; the topic remit comes from here:
- `src/app/page.tsx` (+ `feature-showcase.tsx`, `landing-nav.tsx`) - the
  landing page: the promise, the objections, the buyer
- `README.md` - the repo's landing page, same positioning in long form
- `src/app/docs/**` - the public docs site, product-wide
- `docs/SPEC.md` - the original spec (launch plan: `docs-private/LAUNCH_PLAN.md`,
  maintainer machine only)

Capability - what it does, feature by feature:
- `CLAUDE.md` - architecture + product ethos (repo root)
- `src/lib/instructions/*.ts` - the agent playbooks (what the product actually does)
- `src/app/(dashboard)/page.tsx` and siblings - the dashboard surface

## Stack & build

- Next.js 16 App Router + React 19 + Tailwind CSS v4 (`@tailwindcss/postcss`,
  no config file) + TypeScript. Supabase (server-only). Path alias `@/*` -> `src/*`.
- Package manager: **pnpm**. Build/verify: **`pnpm build`** (runs tsc; no
  separate lint/test). Confirmed to pass with zero env - every dashboard
  route is force-dynamic, and /blog is filesystem-only.
- CI gates on PRs: Vercel preview deploy; the seo-auto-merge workflow's
  green-checks gate.

## Guides

- Files: `src/content/blog/<slug>.mdx` - slug is the kebab-case filename.
- Frontmatter contract: `title` (string), `description` (string, meta
  description length), `date` (YYYY-MM-DD), optional `keyword` (the primary
  keyword targeted), optional `cover` (absolute-from-root image path, e.g.
  `/blog/covers/<slug>.webp` - generated via
  `.dispatchseo/generate-cover.mjs`, see the playbook's COVER IMAGE step).
  Nothing else is read.
- Rendering: `next-mdx-remote/rsc` with the component map in
  `src/components/blog/registry.tsx` (`src/app/blog/[slug]/page.tsx` is the
  template). The platform renders automatically: canonical URL, OG
  (type article), the `/blog` index entry, and `src/app/sitemap.ts`
  coverage. No RSS, no JSON-LD, no OG images yet.
- Bespoke visuals: one component file per guide in `src/components/blog/`,
  registered in `registry.tsx`, referenced by name in the MDX.
- Internal links: standard markdown `[text](/blog/other-slug)`.
- Exemplars: none yet - this scaffold is new. The first merged guides
  become the exemplars; until then match the dashboard's plain, concrete
  tone (see Voice).

## Tools

- Public base path: **`/free-tools/<slug>`**. `/tools` is taken - it is the
  password-gated dashboard screen in the `(dashboard)` route group, NOT a
  public surface, and it must not be moved or reused.
- **Tools home is live** (scaffolded by the internal-linking-tool build,
  2026-07-31): a registry module at `src/lib/free-tools.ts` (one `ToolEntry`
  per tool: slug, title, h1, value line, meta description, description copy
  as an array of paragraph strings, FAQ items, `Widget` component
  reference), the index page at `src/app/free-tools/page.tsx` (cards, same
  visual grammar as `/blog`), and the detail template at
  `src/app/free-tools/[slug]/page.tsx` rendering the locked funnel: back
  link -> hero (h1 + value line, centered) -> the tool's `Widget` -> CTA
  panel (links to `/signup`) -> description paragraphs (supports
  `[text](/href)` markdown links only, via the template's own tiny parser -
  not full MDX) -> FAQ (`<details>`/`<summary>`). Widget components live
  under `src/components/free-tools/`, one file per tool, client components
  (`"use client"`), pure - no fetch, no backend calls, all state local.
  Sitemap coverage lives in `src/app/sitemap.ts` (`getAllTools()` mapped
  alongside the blog/docs entries).
- **CORS means "paste a URL and we'll fetch it" does not work.** A tool that
  needs to read another page's content (the internal-linking tool is the
  precedent) must collect that content by having the visitor paste it in,
  not by fetching a URL client-side - cross-origin `fetch()` to an arbitrary
  third-party site is blocked by the browser for the vast majority of
  sites, and the "purely client-side, no backend calls" build rule rules out
  a server-side proxy fetch as the workaround. Design the interaction around
  paste-in content from the start; don't discover this after committing to a
  fetch-based spec.
- **`src/proxy.ts` (Next 16's `middleware.ts` successor - despite what
  `CLAUDE.md`'s Auth section says, this repo does have route-level gating)
  allowlists public paths and 307-redirects everything else to `/login`.**
  `/free-tools` and `/free-tools/*` are in that allowlist now, alongside
  `/blog` and `/docs`. Any FUTURE public route (a second tools-adjacent
  surface, a new marketing page) needs its own allowlist entry here or it
  silently redirects logged-out visitors to `/login` - the exact failure the
  build-tool playbook's "verify like a logged-out stranger" step exists to
  catch. Always run that check for real (`pnpm build && pnpm start`, `curl`
  with no cookies) rather than assuming "no middleware.ts" means no gate.
- Reference implementation: **`internal-linking-tool`**
  (`src/components/free-tools/internal-linking-tool.tsx`,
  `src/lib/internal-linking-analysis.ts` for the pure scoring logic,
  registry entry in `src/lib/free-tools.ts`) - archetype **analyzer**,
  adapted: instead of one paste box, a repeatable list of page-entry cards
  (URL + title + body paste, 2 minimum) feeding a single Analyze action,
  since comparing pages inherently needs more than one input. Read this one
  first for the registry shape, the funnel template wiring, and the
  paste-not-fetch pattern before building the next tool.
- Tool ideas ARE queued every week regardless of the above; see the research
  workflow's tool slot.

## Design system

- Dark-only (`color-scheme: dark`). Body: `bg-neutral-950 text-neutral-100`,
  base font-weight 450 (`src/app/globals.css`).
- Fonts (root layout): Hanken Grotesk = `--font-hanken` (sans), Geist Mono =
  `--font-geist-mono`. Mapped to Tailwind tokens in globals' `@theme inline`.
- Idioms: cards `rounded-xl bg-neutral-900 p-4 sm:p-5`; primary buttons
  `bg-violet-500 text-neutral-950 rounded-lg`; links `text-violet-400
  hover:text-violet-300` (dashboard uses sky-400 for inline how-to links);
  success `text-emerald-400`; warnings `text-amber-300`; muted labels
  `text-xs uppercase tracking-wide text-neutral-500`.
- Icons: inline SVG strokes (strokeWidth 1.7-2.2), no icon library.
- Logomark: `src/components/logo.tsx` (DispatchMark).
- Exemplar visual components: `src/components/ui.tsx`,
  `src/components/journey-card.tsx`, `src/components/glance-stats.tsx`.

## Voice & writing rules

- Plain, concrete, no hype ("revolutionary", "game-changing" are banned).
- Spaced hyphen " - " for asides, never em dashes.
- Speak to the owner as "you"; the product is "DispatchSEO" or "the
  manager"; the user's agent is "your agent" or "your coding agent". Never
  imply the product is Claude-Code-only - Claude Code and Codex are both
  first-class, so name both or say "your coding agent".
- Sentence case for titles and headings.
- The owner's machines carry a `humanizer` skill (`~/.claude/skills/humanizer/`)
  - run drafts through it when available.

## Analytics

`@vercel/analytics` in the root layout - page views only, no custom event
convention. PostHog exists org-side but is not wired into this app.

# DispatchSEO site facts

The reference card every SEO workflow reads before acting. Written by the
setup workflow (2026-07-16, instructions v2026-07-16.4); re-run `/seo-setup`
after stack or positioning changes. Dogfood note: this site IS a DispatchSEO
backend deployment - the product manages its own marketing site.

## Product

DispatchSEO - a self-hosted SEO manager the owner's Claude Code drives over
MCP: agents research keywords, queue content ideas, build guides/tools as
PRs; the backend tracks ranks (DataForSEO) + Google Search Console daily and
serves a password-gated dashboard for approvals. One deployment manages many
sites (multi-tenant by MCP bearer token). A paid cloud version is planned;
see the launch plan.

Product-surface files to read fresh each research run:
- `CLAUDE.md` - architecture + product ethos (repo root)
- `docs/SPEC.md` - the original spec; `docs/LAUNCH_PLAN.md` - launch plan + positioning
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
  `/blog/covers/<slug>.webp` - generated via `scripts/generate-cover.mjs`,
  see the playbook's COVER IMAGE step). Nothing else is read.
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

**Not wired yet - do not approve or build tool suggestions.** `/tools` is a
password-gated dashboard screen, not a public tool surface. Shipping public
SEO tools needs a registry + public route + template first (future work;
when built, update this file and the tool-validate workflow's assumptions).

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
  manager"; the user's agent is "your agent" or "your Claude Code".
- Sentence case for titles and headings.
- The owner's machines carry a `humanizer` skill (`~/.claude/skills/humanizer/`)
  - run drafts through it when available.

## Analytics

`@vercel/analytics` in the root layout - page views only, no custom event
convention. PostHog exists org-side but is not wired into this app.

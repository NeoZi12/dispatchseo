# Launch Plan — open source + cloud waitlist

Agreed 2026-07-16 (Postiz research + Google verification research behind it; standing
decisions in auto-memory: `open-source-direction`, `cloud-business-model`,
`market-research-verdicts`, `postiz-playbook-verdicts`). This doc is the execution
checklist; memory holds the reasoning.

## Step 1 — Make open source launchable (main track)

- [x] LICENSE: AGPL-3.0 (official GNU text, added 2026-07-17)
- [x] Sanitize repo for strangers (2026-07-17): `.env.local.example` rewritten with
      placeholders; layout.tsx metadata + dashboard copy de-ClockedCoded; plaintext
      dashboard password + Supabase ref scrubbed from `docs/PHASE4_HANDOFF.md`
      (ROTATE `DASHBOARD_PASSWORD` before public flip — it lived in git history).
      Kept: default-project mechanism refs, one-time backfill scripts (self-labeled),
      code comments
- [x] Free data tiers — verified already built (2026-07-17): `serp.ts` provider adapter
      (dataforseo/serpapi/gsc), migration 0009, GSC-only rank source in daily-ranks cron,
      autocomplete research (`suggest.ts`), onboarding + settings UI with live key
      validation, MCP tools route by keyword_source. Serper-as-alternate not built
      (optional; add on demand)
- [x] Cron failure notifications (gap A4) — built 2026-07-17: `cron_runs` log table
      (migration 0020, applied), `cron-alerts.ts` (records every run; emails via Resend
      with 24h-per-job debounce — optional `RESEND_API_KEY`/`ALERT_EMAIL` env), red
      Home-page banner for failed/stale jobs, `get_cron_health` MCP tool (parity).
      Env set 2026-07-19: `RESEND_API_KEY` + `ALERT_EMAIL` + `ALERT_EMAIL_FROM`
      (dispatchseo.com verified in Resend) — alert emails live
- [x] Security (2026-07-17): lockout built + applied (migration 0021: 5 fails/IP in
      15 min → 15-min lock, atomic Postgres counter, fails open pre-migration);
      timing-safe compare for legacy `MCP_API_KEY`; SECURITY.md (GitHub private
      reporting + self-hoster notes incl. strong `DASHBOARD_PASSWORD`).
      WAF rate-limit rule on `POST /login`: DONE 2026-07-19 (`login-rate-limit`,
      10 req/60s per IP, Deny 403). Hobby includes exactly ONE rate-limit rule —
      this is it; more would need Pro.
      Skip Upstash/CSP/app-wide limits — bearer tokens (192-bit) don't need brute-force protection
- [x] Deploy path (2026-07-17): Deploy-to-Vercel button in README (`stores` param
      auto-provisions Supabase via Marketplace; injects `SUPABASE_SECRET_KEY` — db.ts now
      accepts it alongside `SERVICE_ROLE_KEY`); workflows' backend URL parameterized via
      repo variable `BACKEND_URL` (defaults to dispatchseo.com); docs/SELF_HOSTING.md
      walkthrough. NOTE: button untested end-to-end — click it once before flip
- [x] README-as-landing-page (2026-07-17): tagline + alternative-to line, deploy button,
      how-it-works, tiers table, honest requirements, self-host promise, cloud waitlist
      line, star-history chart, AGPL. Screenshots added 2026-07-19 (Home hero + 2x2
      grid: queue, built PR, search traffic, rankings — `docs/screenshots/`)
- [x] Docs + llms.txt + SKILL.md; CONTRIBUTING.md + issue templates (bug/feature YAML
      forms + config.yml routing questions to Discussions); Discussions ENABLED (2026-07-17)
- [ ] Flip public with FRESH GIT HISTORY (squash to one initial commit; keep private archive).
      At flip: enable secret scanning + Dependabot.
      ⚠ SQUASH IS MANDATORY, NOT OPTIONAL: Neo decided (2026-07-17) to KEEP the current
      dashboard password, and it exists in old git history (was in PHASE4_HANDOFF.md).
      Flipping public without the squash exposes the LIVE password. Never skip.

Stack stays opinionated: Vercel + Supabase is the blessed path (Postiz precedent).
Non-Vercel hosts already work (GitHub Actions cron path). Non-Supabase unsupported;
the later Docker Compose answer is self-hosted Supabase, never a plain-Postgres rewrite.

## Step 2 — Landing page + waitlist (parallel with 1)

- [x] Public pages on dispatchseo.com coexisting with the gated dashboard (built
      pre-2026-07-20; verified live: homepage 200, /privacy 200). Waitlist lives on the
      landing page. NOTE 2026-07-20: `/cloud` itself 307s to /login — either allowlist
      it as a public page or drop the /cloud references; waitlist-on-homepage is fine
- [ ] `/cloud`: what cloud adds (bundled DataForSEO, one-click GSC OAuth, managed crons),
      planned $49/$99/$149, FREE email waitlist → Supabase table (+ MCP-parity insert tool)
- [ ] NO pre-orders / no Polar yet — payment provider (Stripe vs Polar MoR) is a
      cloud-build decision and irrelevant to Google verification

## Step 3 — Privacy policy + demo video (parallel with 1)

- [x] "Connect Google Search Console" OAuth flow (2026-07-17): /google page (button →
      consent → properties list + live 28-day sample), /api/oauth/google/{start,callback},
      gsc-oauth.ts (HMAC-signed state, encrypted refresh token, migration 0023 applied).
      DONE 2026-07-20: GCP project `dispatchseo` created (dedicated, not My First Project),
      OAuth client "DispatchSEO Web" (both redirect URIs), app published In production,
      Search Console API enabled, branding saved (homepage + /privacy + dispatchseo.com
      domain). GOOGLE_OAUTH_CLIENT_ID/SECRET set in Vercel + redeployed. Flow tested
      end-to-end on prod: connected, 5 properties listed, live GSC data rendered.
      NOTE: local `.env.local` still needs the two vars for localhost testing
- [x] Privacy policy at /privacy (2026-07-17): public via proxy allowlist, includes the
      Google API Services Limited Use disclosure + deletion path. TODO: link it from the
      homepage footer once the landing page lands
- [ ] Record demo video: click Connect → Google consent screen with the scope visible →
      app displaying real GSC data (1–2 min) → upload UNLISTED to YouTube

## Step 4 — Submit Google verification

- [x] GCP: consent screen configured, publishing status "In production" (2026-07-20;
      domain dispatchseo.com is the authorized domain, branding saved)
- [ ] Submit form: homepage, privacy policy link, scope justification, YouTube link
- Facts: NO paywall/payment/live-product requirement (verified vs official docs).
  Sensitive scope = free checklist review, ~10 days official / 1–3 weeks real.
  Unverified = 100-user cap + warning screen (+ 7-day token expiry in Testing).
  GitHub App needs NO review ever — self-serve, instant.

## Step 5 — Market the open source version (starts at public flip)

- [x] HN account registered 2026-07-19 (aging clock started; launch-ready ~Aug 2)
- [ ] Launch week, concentrated: Show HN (link the REPO), r/selfhosted, dev.to
- [ ] Ongoing engine: monthly Reddit re-launches tied to real release notes;
      MCP directory / awesome-mcp-servers / Claude skill marketplace submissions
- [ ] Cloud-waitlist button (low-key) in the dashboard sidebar
- Skip: Product Hunt as the main event, paid backlinks, paid creator collabs
  (all audience/revenue-dependent — Postiz research). Expect a post-launch plateau; normal.

## After the plan = launched, NOT cloud-ready

Cloud build (next phase, separate project): Supabase Auth accounts, Stripe/Polar billing,
5-step paid onboarding (GitHub App flow, customer GSC OAuth — step 3's button grows into
this), bundled DataForSEO with per-tier metering.
**Trigger:** waitlist proves demand (~50–100 emails) or steady OSS install traction.
QUALITY_PLAN sameness work is not launch-blocking but rises in priority once strangers
run the pipeline (retention + reputation insurance).

## User requirements (for README honesty)

Required: website in a GitHub repo (git-based sites only — no WordPress), Claude
subscription with Claude Code, free GitHub/Vercel/Supabase accounts, Google Search
Console + free service-account key. Optional: free SerpApi/Serper key (ranks),
DataForSEO account (volumes — the gap cloud fills). Pitch: "runs in your own
accounts at $0, your agent sets you up."

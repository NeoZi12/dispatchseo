# Phase 4 handoff - scheduled automation is 95% done, blocked on ONE bad GitHub secret

Written 2026-07-13 after a long debugging session. Phases 1-3 and 5 are DONE and
working (schema, MCP server, crons, skill, dashboard, one-tap merge, auto-IndexNow,
one guide already shipped via PR #5). Phase 4 (the two scheduled GitHub Actions) is
BUILT and CORRECT but the daily builder run fails at the very first model call because
a GitHub Actions secret is corrupted with a trailing whitespace character. That is the
entire remaining blocker. Do NOT rebuild anything - just fix the secret.

## THE ONE THING TO FIX (start here)

The daily builder workflow (`.github/workflows/seo-daily.yml` in the ClockedCode repo,
`NeoZi12/clockedcode`) fails on turn 1 with:

```
API Error: Header '14' has invalid value: '***'
```

`'***'` is a MASKED GitHub secret (Actions masks every registered secret in logs).
An HTTP header "invalid value" almost always means the value contains an ILLEGAL
CHARACTER - a trailing newline (`\n`) or carriage return (`\r`). This session proved
the pattern: secrets set via `gh secret set` from a piped/pasted value carried a
trailing newline, which corrupts them.

Journey (all RULED OUT - do not re-investigate):
- NOT a usage limit: `claude -p "reply OK"` works locally; `claude-sonnet-5` works locally.
- NOT the API-vs-subscription question: logs show `apiKeySource: none` / `anthropic_api_key: ""` - we ARE on the subscription via `CLAUDE_CODE_OAUTH_TOKEN`, correctly.
- NOT the prompt/skill/MCP path: the EXACT CI config (`--mcp-config ./.github/mcp-ci.json --permission-mode bypassPermissions`) ran perfectly LOCALLY and returned the right data (1 approved suggestion). Skill loads (`seo-build`, `seo-manager` appear in slash_commands/skills).
- NOT the OAuth token being invalid: the token itself is valid (verified locally with `CLAUDE_CODE_OAUTH_TOKEN="<token>" claude -p "reply OK"` -> OK).
- Error #1 was `401 Invalid bearer token` (OAuth token had a trailing newline). FIXED by re-storing with `printf %s`. After that fix the 401 disappeared (`api_error_status` went from 401 to null).
- Error #2 (current) is `Header '14' has invalid value` - a DIFFERENT corrupted secret. Re-setting `SEO_MCP_API_KEY` with `tr -d '\n'` did NOT clear it, which means either (a) that strip left a `\r`, or (b) header 14 is actually the OAuth token's authorization header still carrying a stray char, or (c) another secret.

### Root-cause thesis
One of the four repo secrets still has a trailing `\n` or `\r`. The masked value in the
error is whichever secret is in "header 14". Because it survived a `tr -d '\n'`, suspect
a `\r` (CRLF) or that it's a different secret than assumed.

### THE FIX - do this in order

1. **Add a diagnostic step to identify the corrupt secret WITHOUT revealing values.**
   Temporarily add this step to `seo-daily.yml` (before the builder step), then run
   `gh workflow run seo-daily.yml` and read its output:

   ```yaml
   - name: Check secrets for trailing whitespace (diagnostic)
     env:
       CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
       SEO_MCP_API_KEY: ${{ secrets.SEO_MCP_API_KEY }}
       DATAFORSEO_LOGIN: ${{ secrets.DATAFORSEO_LOGIN }}
       DATAFORSEO_PASSWORD: ${{ secrets.DATAFORSEO_PASSWORD }}
     run: |
       for v in CLAUDE_CODE_OAUTH_TOKEN SEO_MCP_API_KEY DATAFORSEO_LOGIN DATAFORSEO_PASSWORD; do
         val="${!v}"
         n=${#val}
         last=$(printf '%s' "$val" | tail -c1 | od -An -tx1 | tr -d ' ')
         # 0a=\n 0d=\r 20=space - anything but a normal char on the end = corrupt
         echo "$v: length=$n last_byte_hex=$last"
       done
   ```

   Any secret whose `last_byte_hex` is `0a`, `0d`, or `20` is corrupt. (Values stay masked;
   only length + last byte print.)

2. **Re-set EVERY corrupt secret stripping ALL whitespace.** The values live in
   `/Users/neozino/Web Projects/seo-manager-backend/.env.local`. Use `tr -d '[:space:]'`
   (none of these tokens contain legitimate spaces, so this is safe and thorough):

   ```bash
   cd "/Users/neozino/Web Projects/seo-manager-backend"
   grep '^MCP_API_KEY='         .env.local | cut -d= -f2- | tr -d '[:space:]' | gh secret set SEO_MCP_API_KEY     --repo NeoZi12/clockedcode
   grep '^DATAFORSEO_LOGIN='    .env.local | cut -d= -f2- | tr -d '[:space:]' | gh secret set DATAFORSEO_LOGIN    --repo NeoZi12/clockedcode
   grep '^DATAFORSEO_PASSWORD=' .env.local | cut -d= -f2- | tr -d '[:space:]' | gh secret set DATAFORSEO_PASSWORD --repo NeoZi12/clockedcode
   ```

   For the OAuth token (NOT in .env.local - it is a CI token from `claude setup-token`):
   regenerate with `claude setup-token`, then store stripping whitespace. Because the token
   may have been pasted with an embedded newline, pipe it through `tr`:
   ```bash
   # paste the token in place of PASTE, quotes matter:
   printf %s 'PASTE' | tr -d '[:space:]' | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo NeoZi12/clockedcode
   ```

3. **Re-run the diagnostic step** to confirm every `last_byte_hex` is a normal char
   (not 0a/0d/20). Then **remove the diagnostic step** and re-run the builder for real.

4. **Also remove the temporary "Dump Claude execution output" step** already in
   `seo-daily.yml` (added this session for debugging) once the build works.

## How to test / watch a run

```bash
gh workflow run seo-daily.yml --repo NeoZi12/clockedcode
# get run id:
RID=$(gh run list --workflow=seo-daily.yml --repo NeoZi12/clockedcode --limit 1 --json databaseId -q '.[0].databaseId')
# poll (macOS has no `timeout`; use a sleep loop):
gh run view $RID --repo NeoZi12/clockedcode --json status,conclusion
# the REAL error lives in the execution-output dump step:
gh run view $RID --repo NeoZi12/clockedcode --log | grep "Dump Claude execution" | sed 's/^[^Z]*Z //'
# success = num_turns > 1 and a PR appears:
gh pr list --repo NeoZi12/clockedcode --label seo --state open
```

There is 1 approved suggestion in the queue for the builder to pick up:
"Claude Code settings.json Generator" (a TOOL build - widget + registry, the harder path).

## What Phase 4 built (all committed to `NeoZi12/clockedcode` main)

- `.github/workflows/seo-daily.yml` - daily 05:00 UTC + workflow_dispatch. Guards against
  open-`seo`-PR pileup, `pnpm install`, then `anthropics/claude-code-action@v1` runs the
  self-contained `/seo-build` prompt. `permissions: contents/pull-requests/id-token: write`.
  Passes `CLAUDE_CODE_OAUTH_TOKEN` (env), `github_token` (input, to skip the Claude GitHub
  App requirement), MCP secrets, placeholder `NEXT_PUBLIC_*` so `next build` does not trip.
  STILL HAS the temp "Dump Claude execution output" step - remove when fixed.
- `.github/workflows/seo-weekly-research.yml` - Mondays 06:00 UTC. Same auth pattern,
  runs `/seo-research`, no PR (writes queue via MCP). `permissions: contents: read, id-token: write`.
- `.github/mcp-ci.json` - seo-manager (HTTP + `Bearer ${SEO_MCP_API_KEY}`) + dataforseo
  (stdio, `${DATAFORSEO_LOGIN}`/`${DATAFORSEO_PASSWORD}`). NOTE: the repo's root `.mcp.json`
  also loads (adds a `supabase` server that fails harmlessly in CI - ignore it, or later
  pass only what is needed).
- Skill `/seo-build` step hardened: only WebFetch first-party docs (code.claude.com,
  docs.anthropic.com, anthropic.com, raw.githubusercontent.com/anthropics) - closes the
  prompt-injection surface flagged by the commit security review re: `bypassPermissions`.
- Backend `vercel.json`: REST weekly-opportunities cron REMOVED (replaced by the weekly
  research workflow). Daily-ranks cron stays. Route file kept as manual fallback.

## Config decisions made this session (do not relitigate)

- `--bare` is NOT used (it would skip the project `.claude/skills`, where `/seo-build` lives).
- `bypassPermissions` is kept (the pipeline needs broad Bash to test commands; an allowlist
  with unrestricted Bash gives no security gain). Injection surface mitigated by the
  first-party-docs-only fetch rule. Residual risk accepted: ephemeral runner, repo-scoped
  ephemeral GITHUB_TOKEN, PR-review gate before anything goes live.
- Prompts are self-contained (they say "Read .claude/skills/seo-manager/SKILL.md and follow
  its seo-build/seo-research workflow") rather than relying on `/slash` command expansion.

## After the build works - remaining Phase 4 close-out

1. Verify checkpoint 7: the daily builder opens a conventions-compliant PR unattended.
2. Test the weekly researcher (`gh workflow run seo-weekly-research.yml`) = checkpoint 8:
   it should fill the queue with new suggestions from product knowledge.
3. Update the dashboard Automations tab (`seo-manager-backend/src/lib/automations.ts` +
   `/automations` page): flip "Daily guide builder" and (new) "Weekly research" to LIVE,
   and the Home "Connect the scheduled builder" setup card can then be removed.
4. Remove both temp workflow steps (execution-output dump + the secrets diagnostic).

## Failed run IDs this session (for reference, all the same secret-corruption story)
29257475732 (missing id-token), 29257618559 (Claude App / github_token), 29257789622,
29258153624, 29258448546 (401 auth), 29259050633/29259244042/29259747435 (401),
29259985874 (401 fixed -> Header 14), 29260172773 (Header 14 persists).

## Key facts
- ClockedCode repo: `NeoZi12/clockedcode` (PRIVATE - matters for the merge token + PR reads).
- Backend: `seo-manager-backend.vercel.app`; dashboard password is `DASHBOARD_PASSWORD` in `.env.local`.
- Supabase project "Neo-Seo" (ref is the host part of `SUPABASE_URL` in `.env.local`).
- All secret VALUES are in `seo-manager-backend/.env.local` (SUPABASE_SERVICE_ROLE_KEY,
  MCP_API_KEY, CRON_SECRET, DATAFORSEO_*, GSC_SERVICE_ACCOUNT_JSON, GH_MERGE_TOKEN, etc.).
- `gh` CLI is authed as NeoZi12 with `workflow` scope (can push workflow files + set secrets).
- The classifier blocks the ASSISTANT from running `gh secret set` in auto mode - the USER
  must run secret commands, or the assistant runs outside auto mode.

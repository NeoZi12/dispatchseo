#!/bin/bash
# DispatchSEO one-command setup.
# Run from INSIDE your website's repo, with the line your dashboard gives you:
#   curl -fsSL https://dispatchseo.com/setup.sh | bash -s -- <project-key> <slug> [backend-url]
#
# What it does, in order: checks your folder + tools, connects Claude Code in
# this folder to your DispatchSEO project, saves the GitHub Actions secrets
# (each value VERIFIED before it is stored), enables PR permissions, then
# hands off to your own Claude Code to install the pipeline.
#
# Every value is verified before it is saved - this script prefers stopping
# loudly over storing something broken. Reads answers from /dev/tty so it
# works when piped from curl.

set -o pipefail

TOKEN="${1:-}"
SLUG="${2:-project}"
BASE="${3:-https://dispatchseo.com}"

say() { printf '%s\n' "$*"; }
hr()  { say "-----------------------------------------------"; }
die() { printf '\n!! %s\n\n' "$*"; exit 1; }
ask() { REPLY=""; read -r REPLY < /dev/tty; }

say ""
say "==============================================="
say "  DispatchSEO setup - about 3 minutes"
say "==============================================="
say ""

[ -n "$TOKEN" ] || die "No project key given. Copy the FULL command from your DispatchSEO dashboard - it includes your key."

# ---- 1. Right folder? ------------------------------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
  die "This folder is not a git repository. Open a terminal INSIDE your website's repo (the one DispatchSEO publishes to) and run the command again."
ORIGIN_URL=$(git remote get-url origin 2>/dev/null) || \
  die "This repo has no 'origin' remote. cd into your website's GitHub repo and run the command again."
REPO=$(printf '%s' "$ORIGIN_URL" | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')

say "Step 1 of 5 - checking this folder."
say "  Detected repo: $REPO"
say "  Is that your WEBSITE's repo - the one your site deploys from? [y/n]"
ask
[ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ] || \
  die "No problem - cd into the right folder and run the same command again."

# ---- 2. Tools --------------------------------------------------------------
say ""
say "Step 2 of 5 - checking your tools."
command -v claude >/dev/null 2>&1 || \
  die "Claude Code isn't installed. Install it first (https://claude.com/claude-code), then rerun."
command -v gh >/dev/null 2>&1 || \
  die "The GitHub CLI (gh) isn't installed. Install it (macOS: brew install gh), run 'gh auth login', then rerun."
gh auth status >/dev/null 2>&1 || \
  die "The GitHub CLI isn't logged in. Run 'gh auth login', then rerun."
say "  All tools present."

# ---- 3. Connect Claude Code to your project --------------------------------
say ""
say "Step 3 of 5 - connecting Claude Code in this folder to your project."
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":0,"method":"tools/list"}')
[ "$code" = "200" ] || \
  die "Your project key was rejected (HTTP $code). Keys change when a project is recreated - copy the CURRENT command from the dashboard and run it instead."
NAME="dispatchseo-$SLUG"
claude mcp remove "$NAME" >/dev/null 2>&1
claude mcp add --transport http "$NAME" "$BASE/api/mcp" \
  --header "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || \
  die "Could not add the connection to Claude Code (claude mcp add failed)."
say "  Connected (key verified against the server)."

# ---- 4. GitHub secrets - every value verified before it is stored ----------
say ""
say "Step 4 of 5 - the GitHub secrets your automations run on."

printf '%s' "$TOKEN" | gh secret set SEO_MCP_API_KEY --repo "$REPO" || \
  die "Could not save a secret to $REPO - does your GitHub login have admin access to it?"
say "  Project key saved."

# New repos block workflows from opening PRs ("Allow GitHub Actions to create
# and approve pull requests" is off by default). Without it the daily builder
# writes the whole guide, then gh pr create is refused and the branch strands
# (2026-07-20 dogfood bug). The owner running this script has admin, so flip
# it here once. Non-fatal: if the API call fails (org policy), tell them the
# exact toggle instead of dying mid-setup.
if gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
    -f default_workflow_permissions=read \
    -F can_approve_pull_request_reviews=true >/dev/null 2>&1; then
  say "  GitHub Actions may now open PRs on $REPO (required by the builders)."
else
  say "  WARNING: could not enable 'Allow GitHub Actions to create and approve"
  say "  pull requests' (an org policy may control it). Turn it on by hand:"
  say "  repo Settings -> Actions -> General -> check that box -> Save."
  say "  Until then, builder runs can write content but not open the PR."
fi

# Claude Code token - minted fresh, verified with NO login fallback (a fake
# HOME), because a keychain login otherwise masks a bad token.
CLIP="pbpaste"
if ! command -v pbpaste >/dev/null 2>&1; then
  CLIP="xclip -o -selection clipboard"
  command -v xclip >/dev/null 2>&1 || \
    die "No clipboard tool found. Install xclip (e.g. sudo apt install xclip), then run this script again."
fi
if gh secret list --repo "$REPO" 2>/dev/null | grep -q "^CLAUDE_CODE_OAUTH_TOKEN"; then
  say ""
  say "  A Claude Code token is already saved for this repo."
  say "  Keep it? [y = keep / n = replace with a fresh one]"
  ask
else
  REPLY="n"
fi
if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
  say ""
  say "  Creating your Claude Code token (the builders run on YOUR Claude"
  say "  subscription - nothing is billed by DispatchSEO)."
  say "  Press Enter; a browser opens - click Approve with your normal"
  say "  Claude account."
  ask
  claude setup-token < /dev/tty
  say ""
  hr
  say "  See the long token above (starts with sk-ant-oat)? Select it and"
  say "  copy it (Cmd+C - two lines is fine), then press Enter here."
  while true; do
    ask
    CTOKEN=$($CLIP 2>/dev/null | tr -d '[:space:]')
    case "$CTOKEN" in
      sk-ant-oat*)
        if [ "${#CTOKEN}" -gt 60 ]; then break; fi
        say "  That looks too short - copy the WHOLE token, then press Enter." ;;
      *)
        say "  Your clipboard holds something else. Copy JUST the token, then press Enter." ;;
    esac
  done
  say "  Verifying the token for real (no login fallback)..."
  mkdir -p /tmp/claude-fakehome
  if HOME=/tmp/claude-fakehome CLAUDE_CODE_OAUTH_TOKEN="$CTOKEN" claude -p "reply with just: ok" </dev/null >/dev/null 2>&1; then
    printf '%s' "$CTOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo "$REPO"
    say "  Claude token verified and saved."
  else
    die "The token doesn't work - usually the browser approved the WRONG account. Log into your subscription account on claude.ai and run this script again."
  fi
fi

# DataForSEO - only if this project uses it.
say ""
say "  Does this project use DataForSEO for keyword data? [y/n]"
say "  (If you picked the free mode in onboarding, answer n.)"
ask
if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
  say ""
  say "  Your DataForSEO LOGIN is your account email. Type it and press Enter:"
  read -r DFS_LOGIN < /dev/tty
  say ""
  say "  Your DataForSEO PASSWORD is the API password from"
  say "  app.dataforseo.com/api-access - NOT your dashboard login password."
  say "  Paste it and press Enter (it won't be shown):"
  read -r -s DFS_PASS < /dev/tty
  say ""
  say "  Verifying against DataForSEO..."
  dfs=$(curl -s --max-time 30 -u "$DFS_LOGIN:$DFS_PASS" https://api.dataforseo.com/v3/appendix/user_data | grep -o '"status_code":20000' | head -1)
  if [ -n "$dfs" ]; then
    printf '%s' "$DFS_LOGIN" | gh secret set DATAFORSEO_LOGIN --repo "$REPO"
    printf '%s' "$DFS_PASS"  | gh secret set DATAFORSEO_PASSWORD --repo "$REPO"
    say "  DataForSEO verified and saved."
  else
    die "DataForSEO rejected those credentials. Double-check: LOGIN = account email, PASSWORD = the API password from app.dataforseo.com/api-access. Then rerun this script."
  fi
else
  say "  Skipping DataForSEO - the workflows handle its absence cleanly."
fi

# Allow Actions to open PRs (the builders publish via PRs).
if gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
     -f default_workflow_permissions=write \
     -F can_approve_pull_request_reviews=true >/dev/null 2>&1; then
  say "  GitHub Actions allowed to open pull requests."
else
  say "  ! Couldn't change Actions permissions automatically. In the repo's"
  say "    Settings > Actions > General, enable 'Allow GitHub Actions to"
  say "    create and approve pull requests'."
fi

# ---- 5. Hand off to the agent ----------------------------------------------
say ""
say "Step 5 of 5 - your agent installs the pipeline (a few minutes; it"
say "opens a pull request and may ask you questions along the way)."
say ""
say "Launch Claude Code now to finish? [y/n]"
ask
INSTALL_PROMPT="Call the seo-manager MCP tool get_instructions with workflow install and follow it exactly."
if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
  exec claude "$INSTALL_PROMPT" < /dev/tty
else
  say ""
  say "==============================================="
  say "  Setup saved. Whenever you're ready, open Claude Code in this"
  say "  folder and paste:"
  say ""
  say "  $INSTALL_PROMPT"
  say "==============================================="
fi

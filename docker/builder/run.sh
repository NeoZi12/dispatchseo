#!/bin/sh
# DispatchSEO in-stack builder loop. Polls /api/builder/jobs on the app
# container, executes each returned job with headless Claude Code inside a
# clone of the site's repo, sweeps green guide PRs for auto-merge projects,
# and reports every outcome to the same cron_runs rails the dashboard
# banner and alert emails read. POSIX sh - keep it boring.
#
# Env (set via docker-compose from .env):
#   CRON_SECRET              required - authenticates against the backend
#   CLAUDE_CODE_OAUTH_TOKEN  required for builds - from `claude setup-token`
#   BUILDER_GH_TOKEN         optional - overrides the wizard's merge token
#   APP_INTERNAL_URL         default http://app:3000
#   BUILDER_POLL_SECONDS     default 600 (the backend can lower/raise it)

APP="${APP_INTERNAL_URL:-http://app:3000}"
POLL="${BUILDER_POLL_SECONDS:-600}"
mkdir -p /data/repos /data/mcp /data/logs

log() { echo "[builder] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

report() { # report <job-key> <ok|fail> [message]
  if [ "$2" = "ok" ]; then
    curl -sG --max-time 30 -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "ok=1" \
      "${APP}/api/cron/deploy-check" >/dev/null || true
  else
    curl -sG --max-time 30 -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "fail=$3" \
      "${APP}/api/cron/deploy-check" >/dev/null || true
  fi
}

# Clone the repo, or hard-reset an existing clone to the remote's default
# branch. Every job starts from clean origin state; the agent creates its
# own working branch from there.
sync_repo() { # sync_repo <owner/repo> <dir> -> 0/1
  url="https://x-access-token:${GH_TOKEN}@github.com/$1.git"
  if [ ! -d "$2/.git" ]; then
    git clone --quiet "$url" "$2" || return 1
  fi
  git -C "$2" remote set-url origin "$url"
  git -C "$2" fetch --quiet --prune origin || return 1
  git -C "$2" remote set-head origin -a >/dev/null 2>&1
  branch=$(git -C "$2" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  [ -n "$branch" ] || branch=main
  git -C "$2" checkout --quiet -B "$branch" "origin/$branch" || return 1
  git -C "$2" reset --quiet --hard "origin/$branch"
  git -C "$2" clean -qfd
}

# Changed-file deny-list for the auto-merge sweep: a guide PR must never
# touch workflows, dependency manifests, or config. Mirrors the allowlist
# idea in seo-auto-merge.yml, made portable across site stacks.
DENY='^\.github/|^\.dispatchseo/|(^|/)package\.json$|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|(^|/)\.env|next\.config|vercel\.json|(^|/)tsconfig'

merge_sweep() { # merge_sweep <slug> <owner/repo>
  gh pr list --repo "$2" --label seo --state open \
    --json number,labels \
    --jq '.[] | select([.labels[].name] | index("seo-tool") | not) | .number' \
  | while read -r n; do
      [ -n "$n" ] || continue
      # Every check green (gh exits 0 only then; pending=8, failing/none=1).
      if ! gh pr checks "$n" --repo "$2" >/dev/null 2>&1; then continue; fi
      if gh pr diff "$n" --repo "$2" --name-only | grep -qE "$DENY"; then
        log "PR #$n in $2 touches protected files - leaving it for the owner"
        continue
      fi
      if gh pr merge "$n" --repo "$2" --squash --delete-branch >/dev/null 2>&1; then
        log "auto-merged green guide PR #$n in $2"
        report "builder-merge--$1" ok
      else
        report "builder-merge--$1" fail "could not merge green PR #$n - merge it on GitHub and check branch protection"
      fi
    done
}

run_job() { # run_job <base64 job json>
  j=$(echo "$1" | base64 -d)
  key=$(echo "$j" | jq -r .key)
  wf=$(echo "$j" | jq -r .workflow)
  slug=$(echo "$j" | jq -r .slug)
  repo=$(echo "$j" | jq -r .repo)
  prompt=$(echo "$j" | jq -r .prompt)
  SEO_MCP_API_KEY=$(echo "$j" | jq -r .mcp_token)
  DATAFORSEO_LOGIN=$(echo "$j" | jq -r '.dataforseo.login // empty')
  DATAFORSEO_PASSWORD=$(echo "$j" | jq -r '.dataforseo.password // empty')
  export SEO_MCP_API_KEY DATAFORSEO_LOGIN DATAFORSEO_PASSWORD

  log "job $key starting (repo $repo)"
  dir="/data/repos/$slug"
  if ! sync_repo "$repo" "$dir"; then
    report "$key" fail "could not clone/sync $repo - check the GitHub token's access to it"
    return
  fi

  # MCP config: seo-manager over the internal docker network; the token
  # rides an env expansion so it never lands on disk. dataforseo joins
  # only when the project has credentials.
  cfg="/data/mcp/$slug.json"
  if [ -n "$DATAFORSEO_LOGIN" ]; then
    jq -n --arg url "$APP/api/mcp" '{mcpServers:{
      "seo-manager":{type:"http",url:$url,headers:{Authorization:"Bearer ${SEO_MCP_API_KEY}"}},
      "dataforseo":{type:"stdio",command:"npx",args:["-y","dataforseo-mcp-server@latest"],
        env:{DATAFORSEO_USERNAME:"${DATAFORSEO_LOGIN}",DATAFORSEO_PASSWORD:"${DATAFORSEO_PASSWORD}",ENABLED_MODULES:"SERP,DATAFORSEO_LABS,BACKLINKS"}}}}' > "$cfg"
  else
    jq -n --arg url "$APP/api/mcp" '{mcpServers:{
      "seo-manager":{type:"http",url:$url,headers:{Authorization:"Bearer ${SEO_MCP_API_KEY}"}}}}' > "$cfg"
  fi

  # Preflight: a dead MCP makes Claude see an empty toolset and "succeed"
  # at nothing (the 2026-07-14 domain-move bug) - refuse to start instead.
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$APP/api/mcp" \
    -H "Authorization: Bearer $SEO_MCP_API_KEY" -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":0,"method":"tools/list"}')
  if [ "$code" != "200" ]; then
    report "$key" fail "seo-manager MCP returned HTTP $code from inside the stack"
    return
  fi

  out="/data/logs/$key.$(date -u +%Y%m%d%H%M%S).json"
  ( cd "$dir" && MCP_TIMEOUT=120000 timeout 5400 \
      claude -p "$prompt" \
        --mcp-config "$cfg" \
        --permission-mode bypassPermissions \
        --max-turns 150 \
        --output-format json > "$out" 2>"$out.err" )
  rc=$?
  msg=$(jq -r 'if type=="array" then .[] else . end | select(.type?=="result") | (.result // .error // empty)' "$out" 2>/dev/null | tail -c 400)
  [ -n "$msg" ] || msg=$(tail -c 400 "$out.err" 2>/dev/null)

  if [ "$rc" = "0" ]; then
    log "job $key done"
    report "$key" ok
  elif echo "$msg" | grep -qiE 'usage limit|limit reached|rate.?limit'; then
    # A usage-limit hit is a deferral, not a failure - the next due window
    # retries, exactly like the cloud workflow's 12:00/19:00 reruns.
    log "job $key deferred - Claude usage limit"
    report "$key" ok
  else
    [ -n "$msg" ] || msg="claude exited $rc (see $out in the dispatch-builder volume)"
    log "job $key FAILED: $msg"
    report "$key" fail "$msg"
  fi
}

log "starting - backend $APP"
# Fallback identity only - overwritten per loop once a GitHub token is known.
# Vercel refuses to deploy commits whose author email maps to no GitHub
# account, so real jobs must commit as the token's user (see set_git_identity).
git config --global user.name "dispatchseo-builder" 2>/dev/null
git config --global user.email "builder@dispatchseo.local" 2>/dev/null
git config --global init.defaultBranch main 2>/dev/null

GIT_ID_TOKEN=""
set_git_identity() { # commit as the GH_TOKEN's real user, cached per token
  [ -n "$GH_TOKEN" ] || return 0
  [ "$GH_TOKEN" = "$GIT_ID_TOKEN" ] && return 0
  me=$(curl -s --max-time 30 -H "Authorization: Bearer ${GH_TOKEN}" https://api.github.com/user)
  login=$(echo "$me" | jq -r '.login // empty')
  uid=$(echo "$me" | jq -r '.id // empty')
  if [ -n "$login" ] && [ -n "$uid" ]; then
    git config --global user.name "$login" 2>/dev/null
    git config --global user.email "${uid}+${login}@users.noreply.github.com" 2>/dev/null
    GIT_ID_TOKEN="$GH_TOKEN"
    log "committing as $login <${uid}+${login}@users.noreply.github.com>"
  else
    log "could not resolve the GitHub user behind the token - commits keep the fallback identity, which Vercel may refuse to deploy"
  fi
}

while :; do
  if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    log "idle - set CLAUDE_CODE_OAUTH_TOKEN in .env (run 'claude setup-token' on your machine, paste the sk-ant-oat... token), then: docker compose up -d builder"
    sleep 1800; continue
  fi
  case "$CLAUDE_CODE_OAUTH_TOKEN" in
    *PASTE-YOUR-TOKEN*) log "idle - CLAUDE_CODE_OAUTH_TOKEN is still the wizard's placeholder; edit .env and swap in the real token from 'claude setup-token', then: docker compose up -d builder"
       sleep 1800; continue ;;
    sk-ant-oat*) : ;;
    *) log "idle - CLAUDE_CODE_OAUTH_TOKEN does not look like a Claude Code OAuth token (expected sk-ant-oat...); re-run 'claude setup-token' and paste it without line breaks"
       sleep 1800; continue ;;
  esac

  feed=$(curl -s --max-time 60 -H "Authorization: Bearer ${CRON_SECRET}" "$APP/api/builder/jobs?claim=1")
  if [ -z "$feed" ] || ! echo "$feed" | jq -e . >/dev/null 2>&1; then
    log "backend not reachable yet - retrying in 60s"
    sleep 60; continue
  fi

  # GitHub identity: the wizard's one-tap-merge token, unless overridden.
  GH_TOKEN="${BUILDER_GH_TOKEN:-$(echo "$feed" | jq -r '.gh_token // empty')}"
  export GH_TOKEN
  set_git_identity

  njobs=$(echo "$feed" | jq '.jobs | length')
  nsweeps=$(echo "$feed" | jq '.merge_sweeps | length')
  if [ -z "$GH_TOKEN" ]; then
    if [ "$njobs" != "0" ]; then
      log "jobs are due but no GitHub token is available - connect one in the wizard's One-tap merge step (or set BUILDER_GH_TOKEN in .env)"
    fi
  else
    for row in $(echo "$feed" | jq -r '.jobs[] | @base64'); do
      run_job "$row"
    done
    if [ "$nsweeps" != "0" ]; then
      echo "$feed" | jq -r '.merge_sweeps[] | "\(.slug) \(.repo)"' \
      | while read -r slug repo; do merge_sweep "$slug" "$repo"; done
    fi
  fi

  POLL=$(echo "$feed" | jq -r '.poll_seconds // 600')
  sleep "$POLL"
done

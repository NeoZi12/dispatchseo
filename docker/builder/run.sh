#!/bin/sh
# DispatchSEO in-stack builder loop. Polls /api/builder/jobs on the app
# container, executes each returned job with a headless coding agent inside a
# clone of the site's repo, sweeps green guide PRs for auto-merge projects,
# and reports every outcome to the same cron_runs rails the dashboard
# banner and alert emails read. POSIX sh - keep it boring.
#
# WHICH AGENT is decided per JOB, by the backend, and arrives in the feed
# alongside the credential for it. The container never chooses - that is the
# same split the /api/builder/jobs header insists on, and it is what lets one
# stack host a Claude project and a Codex project at the same time.
#
# Env (set via docker-compose from .env):
#   CRON_SECRET              required - authenticates against the backend
#   CLAUDE_CODE_OAUTH_TOKEN  optional - from `claude setup-token`
#   OPENAI_API_KEY           optional - from platform.openai.com/api-keys
#                            (at least one agent credential is needed to build;
#                             either can come from the dashboard instead)
#   BUILDER_GH_TOKEN         optional - overrides the wizard's merge token
#   APP_INTERNAL_URL         default http://app:3000
#   BUILDER_POLL_SECONDS     default 600 (the backend can lower/raise it)

APP="${APP_INTERNAL_URL:-http://app:3000}"
POLL="${BUILDER_POLL_SECONDS:-600}"
mkdir -p /data/repos /data/mcp /data/logs

log() { echo "[builder] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

# A dropped report is not cosmetic: the backend hands jobs out by logging a
# CLAIM row, and only a real outcome supersedes it. If reporting fails, the run
# that actually happened never registers - the dashboard banner and
# get_cron_health stay blind, and the job looks in-flight until the claim grace
# window expires. This used to fail completely silently: the body went to
# /dev/null and `|| true` ate the exit code, so a rejected report (e.g. the
# 40-char job-name cap that every long slug tripped) looked identical to a
# successful one. Still non-fatal by design - a logging failure must never kill
# the builder - but now it SAYS so in the container logs.
report() { # report <job-key> <ok|fail|deferred> [message]
  if [ "$2" = "ok" ]; then
    resp=$(curl -sG --max-time 30 -w '\n%{http_code}' -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "ok=1" \
      "${APP}/api/cron/deploy-check" 2>&1) || resp="${resp}
000"
  elif [ "$2" = "deferred" ]; then
    # Ran, hit a usage limit, built nothing. NOT ok: the backend works out what
    # is due by reading these rows (build-schedule.ts), and an ok row is a
    # completed run - it would restart the full cadence window and hold the job
    # back for up to 20h, so an evening deferral silently costs a day while the
    # dashboard shows green. `deferred` lands as a claim instead, which the
    # short grace window re-offers on the next poll, and which goes stale and
    # alarms if the deferrals never stop.
    resp=$(curl -sG --max-time 30 -w '\n%{http_code}' -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "deferred=$3" \
      "${APP}/api/cron/deploy-check" 2>&1) || resp="${resp}
000"
  else
    resp=$(curl -sG --max-time 30 -w '\n%{http_code}' -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "fail=$3" \
      "${APP}/api/cron/deploy-check" 2>&1) || resp="${resp}
000"
  fi
  code=$(printf '%s' "$resp" | tail -n 1)
  case "$code" in
    2*) ;;
    *)
      log "WARN: the dashboard did not accept the outcome report for '$1' (HTTP ${code:-?})."
      log "      This run will not appear on the dashboard or in failure alerts."
      log "      Response: $(printf '%s' "$resp" | head -n 1)"
      ;;
  esac
}

# Clone the repo, or hard-reset an existing clone to the remote's default
# branch. Every job starts from clean origin state; the agent creates its
# own working branch from there.
sync_repo() { # sync_repo <owner/repo> <dir> -> 0/1
  url="https://x-access-token:${GH_TOKEN}@github.com/$1.git"
  # timeout on every network call: a hung clone/fetch would wedge the whole
  # sequential loop for every project (the agent itself already runs under
  # timeout 5400 below).
  if [ ! -d "$2/.git" ]; then
    timeout 300 git clone --quiet "$url" "$2" || return 1
  fi
  git -C "$2" remote set-url origin "$url"
  timeout 300 git -C "$2" fetch --quiet --prune origin || return 1
  git -C "$2" remote set-head origin -a >/dev/null 2>&1
  branch=$(git -C "$2" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  [ -n "$branch" ] || branch=main
  git -C "$2" checkout --quiet -B "$branch" "origin/$branch" || return 1
  git -C "$2" reset --quiet --hard "origin/$branch"
  git -C "$2" clean -qfd
}

# Last-resort deny-list, kept as a second gate behind the allowlist below.
# The allowlist is what actually decides; this only catches a repo whose
# publish-paths were edited to include something they should not.
DENY='^\.github/|^\.dispatchseo/|(^|/)package\.json$|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|(^|/)\.env|next\.config|vercel\.json|(^|/)tsconfig'

# Path prefixes a guide PR may touch, read from the repo's OWN
# .dispatchseo/publish-paths on the default branch - the same file
# seo-auto-merge.yml reads, so self-host and hosted installs apply the
# identical gate. On a self-hosted backend GitHub cannot reach, that workflow
# never runs (it curls the backend for project mode), which makes this sweep
# the only gate there is - a deny-list would auto-merge anything nobody
# thought to ban. Reference-stack layout is the fallback when the file is
# absent. Fetched per sweep so an owner's edit takes effect without a restart.
publish_prefixes() { # publish_prefixes <owner/repo>
  prefixes=$(timeout 120 gh api "repos/$1/contents/.dispatchseo/publish-paths" \
    -H "Accept: application/vnd.github.raw" 2>/dev/null \
    | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$')
  if [ -z "$prefixes" ]; then
    printf 'src/content/blog/\nsrc/components/blog/\npublic/blog/covers/\n'
  else
    printf '%s\n' "$prefixes"
  fi
}

# 0 when every changed file sits under one of the allowed prefixes. Word
# splitting is fine here: a path containing whitespace simply fails to match
# and the PR goes to the owner, which is the safe direction.
within_publish_paths() { # within_publish_paths <files> <prefixes>
  for f in $1; do
    ok=0
    for p in $2; do
      case "$f" in "$p"*) ok=1; break ;; esac
    done
    [ "$ok" = 1 ] || return 1
  done
  return 0
}

merge_sweep() { # merge_sweep <slug> <owner/repo>
  allowed=$(publish_prefixes "$2")
  timeout 120 gh pr list --repo "$2" --label seo --state open \
    --json number,labels \
    --jq '.[] | select([.labels[].name] | index("seo-tool") | not) | .number' \
  | while read -r n; do
      [ -n "$n" ] || continue
      # Every check green (gh exits 0 only then; pending=8, failing/none=1).
      if ! timeout 120 gh pr checks "$n" --repo "$2" >/dev/null 2>&1; then continue; fi
      changed=$(timeout 120 gh pr diff "$n" --repo "$2" --name-only)
      if ! within_publish_paths "$changed" "$allowed"; then
        log "PR #$n in $2 touches files outside the publish dirs (structural change) - leaving it for the owner"
        continue
      fi
      if echo "$changed" | grep -qE "$DENY"; then
        log "PR #$n in $2 touches protected files - leaving it for the owner"
        continue
      fi
      # Keep the failure text: "could not merge" has several causes and they
      # send the owner to completely different places. A merge CONFLICT is by
      # far the most common (two guide PRs open at once both append to the
      # content registry, or main moved on under an older branch) and has
      # nothing to do with branch protection - telling someone to go check
      # repo settings for it wastes the one message we get.
      if merge_err=$(timeout 120 gh pr merge "$n" --repo "$2" --squash --delete-branch 2>&1); then
        log "auto-merged green guide PR #$n in $2"
        report "builder-merge--$1" ok
      else
        # Self-heal first, same as the GitHub rail: every guide PR appends to
        # the same shared registry files, so one left open while anything else
        # merges comes back CONFLICTING and nothing ever rebased it. Asking
        # GitHub to merge the base branch in fixes it whenever the two sides
        # touched different lines, which is the usual case.
        case "$merge_err" in
          *"merge conflicts"*|*"not mergeable"*|*"Base branch was modified"*|*"not up to date"*)
            if timeout 120 gh api -X PUT "repos/$2/pulls/$n/update-branch" >/dev/null 2>&1; then
              log "PR #$n in $2 was out of date - updated it from the default branch; it merges on the next sweep"
              continue
            fi ;;
        esac
        case "$merge_err" in
          *"merge conflicts"*|*"not mergeable"*)
            reason="PR #$n has conflicts with the default branch that need a human or an agent to resolve - the automatic branch update could not fix them" ;;
          *"Base branch was modified"*|*"not up to date"*)
            reason="PR #$n is behind the default branch and could not be updated automatically - update the branch on GitHub and it merges on the next sweep" ;;
          *"Required status check"*|*"protected branch"*|*"branch protection"*|*"review"*)
            reason="PR #$n is blocked by a branch protection rule (a required review or status check) - merge it on GitHub, or relax the rule for this repo" ;;
          *)
            reason="could not merge green PR #$n: $(echo "$merge_err" | tr '\n' ' ' | cut -c1-200)" ;;
        esac
        report "builder-merge--$1" fail "$reason"
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

  # Per JOB, not per container: one stack can host projects on different
  # agents. Older backends send neither field, and for them every job is a
  # Claude job - which is true, because that is all those backends could
  # describe.
  agent=$(echo "$j" | jq -r '.agent // "claude"')
  agent_token=$(echo "$j" | jq -r '.agent_token // empty')
  # Claude-only fallback, agent-gated on purpose: the feed never emits a
  # tokenless job today (jobs/route.ts returns early), so this is defence in
  # depth for older backends - which are all-Claude by definition. Without the
  # gate, a future tokenless codex job would silently POST a Claude OAuth
  # token to api.openai.com.
  if [ -z "$agent_token" ] && [ "$agent" = "claude" ]; then
    agent_token="$RESOLVED_CLAUDE_TOKEN"
  fi
  if [ -z "$agent_token" ]; then
    report "$key" fail "the feed handed out a $agent job with no credential - paste the $agent key on the dashboard's Settings page"
    return
  fi

  log "job $key starting (repo $repo, agent $agent)"
  dir="/data/repos/$slug"
  if ! sync_repo "$repo" "$dir"; then
    report "$key" fail "could not clone/sync $repo - check the GitHub token's access to it"
    return
  fi

  # MCP config, in whichever format this job's agent reads: Claude takes JSON,
  # Codex takes TOML. Either way the token rides an env expansion so it never
  # lands on disk, and dataforseo joins only when the project has credentials -
  # a stdio server wired to blank creds is a maybe-crash in every run.
  cfg="/data/mcp/$slug.json"
  codex_home="/data/mcp/codex-$slug"
  if [ "$agent" = "codex" ]; then
    mkdir -p "$codex_home"
    cfg="$codex_home/config.toml"
    {
      echo '[mcp_servers.seo-manager]'
      echo "url = \"$APP/api/mcp\""
      echo 'bearer_token_env_var = "SEO_MCP_API_KEY"'
      # Without this every tool call comes back "user cancelled MCP tool call".
      # There is nobody in a container to approve one, and it is an approval
      # rather than a permission, so no sandbox setting substitutes for it.
      echo 'default_tools_approval_mode = "approve"'
      # Codex ships with web search off; the playbooks assume it exists
      # (geo-scan REQUIRES real searches and forbids answering from memory).
      # Claude has WebSearch built in - this line is the parity.
      echo ''
      echo '[tools]'
      echo 'web_search = true'
      if [ -n "$DATAFORSEO_LOGIN" ]; then
        # LITERAL values, expanded and TOML-escaped at write time: Codex's
        # TOML `env` map does no ${VAR} expansion (unlike Claude's JSON
        # config, which is where this pattern was copied from), so the old
        # '${DATAFORSEO_LOGIN}' string authenticated as itself and every
        # keyword call 401'd. The file now holds real creds, so it is
        # deleted right after the run alongside auth.json.
        dfl=$(printf '%s' "$DATAFORSEO_LOGIN" | sed 's/\\/\\\\/g; s/"/\\"/g')
        dfp=$(printf '%s' "$DATAFORSEO_PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g')
        echo ''
        echo '[mcp_servers.dataforseo]'
        echo 'command = "npx"'
        echo 'args = ["-y", "dataforseo-mcp-server@3.1.3"]'
        echo "env = { DATAFORSEO_USERNAME = \"$dfl\", DATAFORSEO_PASSWORD = \"$dfp\", ENABLED_MODULES = \"SERP,DATAFORSEO_LABS,BACKLINKS\" }"
        echo 'default_tools_approval_mode = "approve"'
      fi
    } > "$cfg"
  elif [ "$agent" = "cursor" ]; then
    # Cursor reads .cursor/mcp.json relative to the directory it runs in -
    # there is no --mcp-config flag to point elsewhere - so this lands inside
    # the clone rather than in /data/mcp like the other two.
    #
    # LITERAL credentials, same policy as Codex's TOML. A CI run on 2026-08-06
    # showed cursor-agent CAN resolve ${VAR} in an http server's headers from
    # its own environment, revising the 2026-08-05 no-expansion reading - but
    # that behaviour is undocumented and unproven for stdio env values, so the
    # credentials are rendered in rather than left to depend on it. The file
    # is deleted right after the run, alongside the other agents' secrets.
    mkdir -p "$dir/.cursor"
    cfg="$dir/.cursor/mcp.json"
    if [ -n "$DATAFORSEO_LOGIN" ]; then
      jq -n --arg url "$APP/api/mcp" --arg tok "$SEO_MCP_API_KEY" \
        --arg dfl "$DATAFORSEO_LOGIN" --arg dfp "$DATAFORSEO_PASSWORD" '{mcpServers:{
        "seo-manager":{type:"http",url:$url,headers:{Authorization:("Bearer " + $tok)}},
        "dataforseo":{type:"stdio",command:"npx",args:["-y","dataforseo-mcp-server@3.1.3"],
          env:{DATAFORSEO_USERNAME:$dfl,DATAFORSEO_PASSWORD:$dfp,ENABLED_MODULES:"SERP,DATAFORSEO_LABS,BACKLINKS"}}}}' > "$cfg"
    else
      jq -n --arg url "$APP/api/mcp" --arg tok "$SEO_MCP_API_KEY" '{mcpServers:{
        "seo-manager":{type:"http",url:$url,headers:{Authorization:("Bearer " + $tok)}}}}' > "$cfg"
    fi
    # An unapproved server is not merely unreachable, it is ABSENT: the agent
    # runs happily with zero tools. Approval is per project directory, so this
    # runs every job rather than once.
    for s in $(jq -r '.mcpServers | keys[]' "$cfg" 2>/dev/null); do
      ( cd "$dir" && cursor-agent mcp enable "$s" >/dev/null 2>&1 ) || true
    done
  elif [ -n "$DATAFORSEO_LOGIN" ]; then
    jq -n --arg url "$APP/api/mcp" '{mcpServers:{
      "seo-manager":{type:"http",url:$url,headers:{Authorization:"Bearer ${SEO_MCP_API_KEY}"}},
      "dataforseo":{type:"stdio",command:"npx",args:["-y","dataforseo-mcp-server@3.1.3"],
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

  # Snapshot the repo BEFORE the agent touches it, so "did this run actually
  # build anything" is answerable afterwards rather than assumed from an exit
  # code. See the rc=0 branch below for why that question has to be asked.
  head_before=$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo "?")
  prs_before=$(timeout 60 gh pr list --repo "$repo" --label seo --state open --json number --jq 'length' 2>/dev/null || echo "?")

  out="/data/logs/$key.$(date -u +%Y%m%d%H%M%S).json"
  # How Codex must write files here, prepended to every Codex prompt.
  #
  # Claude Code has built-in file tools. Codex, in `codex exec`, has the shell
  # and nothing else - `codex features list` reports apply_patch_freeform as
  # REMOVED, so there is no file-write tool to turn on. Left to itself the
  # model reaches for an UNQUOTED heredoc, and the content this pipeline writes
  # is MDX: backticks everywhere, which bash expands as command substitution
  # inside one. On 2026-07-31 that failed every write for a whole run - it tried
  # heredocs, printf, base64 and reformatting the code fences, then gave up and
  # exited 0 with nothing built.
  #
  # The first fix for that banned heredocs outright, and that over-corrected:
  # a SINGLE-QUOTED delimiter (<<'DSEOF') makes bash expand nothing at all, so
  # it is the one quoting-proof method available everywhere. Banning it left
  # only awkward python -c invocations, and later the same day Codex hit the
  # escaping wall on a .tsx file, stopped mid-run to ask permission to use a
  # quoted heredoc, and exited 0 having built nothing. It was right; the rule
  # was wrong. Hence the explicit allow, and the explicit "never ask" - an
  # unattended run has nobody to answer, so a question is just a dead run.
  #
  # Kept here rather than in the shared playbook because it is not a content
  # rule - it is a fact about this container, and Claude must never be handed
  # it.
  CODEX_FILE_RULE=$(cat <<'RULEEOF'
ENVIRONMENT RULE (read first, it overrides habit): you have no apply_patch tool registered here - only the shell, and you are running UNATTENDED, so there is nobody to answer a question. Write every file exactly one of three ways: (1) a SINGLE-QUOTED heredoc, `cat > path <<'DSEOF'` ... `DSEOF` - the quoted delimiter is the whole point, bash expands NOTHING inside it so the backticks and $ in MDX and TSX survive verbatim; (2) pipe an OpenAI-format patch envelope into the `apply_patch` command on PATH; (3) python3 with the content read from stdin, never interpolated into the command string. NEVER use an unquoted heredoc, printf or echo to write file content - an unquoted heredoc is what expands backticks and corrupts the file. Pick a delimiter that cannot appear in the content. Verify every write with `ls -l` and `head` before moving on, and never let a filename come from an unset shell variable. If you ever find yourself about to ask for approval or a go/no-go, do not: pick the safest option that still completes the task, do it, and say what you chose in the final report. A run that stops to ask a question builds nothing and is a failed run.
RULEEOF
)
  CODEX_FILE_RULE="$CODEX_FILE_RULE "

  if [ "$agent" = "codex" ]; then
    # `codex exec` needs an explicit login: OPENAI_API_KEY in the environment
    # alone is NOT enough - it 401s against /v1/responses until auth.json
    # exists inside CODEX_HOME. Written per job because CODEX_HOME is per
    # project here, and it is the only scoping Codex offers.
    #
    # This puts the key on disk in PLAINTEXT, which the Claude branch below
    # never does - it passes its token through the environment and nothing
    # persists. /data is a docker volume that outlives the container, so the
    # file is deleted as soon as the run finishes (below), including when
    # `timeout` kills it. A hard container kill would still leave it, so this
    # narrows the window rather than closing it - the key is held encrypted in
    # instance_settings either way, and the point is not to leave a second
    # readable copy sitting in a volume backup.
    ( printf '%s' "$agent_token" | CODEX_HOME="$codex_home" codex login --with-api-key >/dev/null 2>&1 )
    # No --max-turns equivalent exists (OpenAI closed the request for one as
    # not-planned), so the timeout below is the only ceiling - same 90 minutes
    # the Claude branch gets.
    # `env -u CRON_SECRET` on all three agent runs: the agent executes
    # repo-controlled instructions, and the claim secret is the owner's master
    # key to every cron and report endpoint. The report() curls keep it.
    ( cd "$dir" && env -u CRON_SECRET OPENAI_API_KEY="$agent_token" CODEX_HOME="$codex_home" timeout 5400 \
        codex exec "$CODEX_FILE_RULE$prompt" \
          --sandbox danger-full-access \
          --skip-git-repo-check \
          --model "${CODEX_MODEL:-gpt-5}" \
          -o "$out.msg" > "$out" 2>"$out.err" )
    rc=$?
    # Before any classification branch, all of which can `return`. The config
    # goes with the key: since the DataForSEO fix it holds real credentials
    # (Codex's TOML env is literal, so they cannot ride in as env-var names),
    # and it is regenerated from the feed on every job anyway.
    rm -f "$codex_home/auth.json" "$cfg"
    msg=$(tail -c 400 "$out.msg" 2>/dev/null)
    [ -n "$msg" ] || msg=$(tail -c 400 "$out.err" 2>/dev/null)
  elif [ "$agent" = "cursor" ]; then
    # The key passes through the environment and nothing persists - no on-disk
    # login step like Codex's auth.json.
    #
    # Three flags, each separately required for an unattended run and each
    # measured: --trust (a clone is an untrusted workspace and the run refuses
    # outright), --force (command approval), --approve-mcps (server approval).
    #
    # No --max-turns equivalent exists, so the timeout is the only ceiling -
    # the same 90 minutes the other two branches get.
    ( cd "$dir" && env -u CRON_SECRET CURSOR_API_KEY="$agent_token" timeout 5400 \
        cursor-agent -p "$prompt" \
          --output-format json \
          --trust --force --approve-mcps \
          --model "${CURSOR_MODEL:-auto}" > "$out" 2>"$out.err" )
    rc=$?
    # The config holds real, rendered credentials, so it goes as soon as the
    # run does - same contract as Codex's auth.json above.
    rm -f "$cfg"
    msg=$(jq -r '.result // empty' "$out" 2>/dev/null | tail -c 400)
    [ -n "$msg" ] || msg=$(tail -c 400 "$out.err" 2>/dev/null)
  else
    ( cd "$dir" && env -u CRON_SECRET MCP_TIMEOUT=120000 CLAUDE_CODE_OAUTH_TOKEN="$agent_token" timeout 5400 \
        claude -p "$prompt" \
          --mcp-config "$cfg" \
          --permission-mode bypassPermissions \
          --max-turns 150 \
          --output-format json > "$out" 2>"$out.err" )
    rc=$?
    msg=$(jq -r 'if type=="array" then .[] else . end | select(.type?=="result") | (.result // .error // empty)' "$out" 2>/dev/null | tail -c 400)
    [ -n "$msg" ] || msg=$(tail -c 400 "$out.err" 2>/dev/null)
  fi

  if [ "$rc" = "0" ]; then
    # Exit 0 is not the same as "it built something". An agent that cannot
    # write a file, hits a tool it does not have, or talks itself out of the
    # task will finish tidily, explain itself, and exit 0 - and this branch
    # used to call that a success. It is the worst outcome the builder has:
    # green every night, nothing published, nobody told. It happened for real
    # on 2026-07-31, when Codex could not write MDX and reported done.
    #
    # Only build-* jobs are checked, and only because the backend now hands
    # them out ONLY when an approved suggestion exists (jobs/route.ts). So for
    # these two, "the repo is exactly as we found it" has one meaning: the
    # build did not happen. research and geo-scan legitimately touch no files.
    case "$wf" in
      build-guide|build-tool)
        head_now=$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo "?")
        prs_now=$(timeout 60 gh pr list --repo "$repo" --label seo --state open --json number --jq 'length' 2>/dev/null || echo "?")
        # HEAD is the definitive half - the agent commits on a branch in this
        # same clone, so an unmoved HEAD means it never committed. The PR count
        # is the secondary guard, and deliberately cannot rescue a run on its
        # own: "?" means gh could not answer, not that a PR appeared.
        if [ "$head_now" = "$head_before" ] && [ "$prs_now" = "$prs_before" ]; then
          # DEFERRED, not failed - aligned with the GitHub runner's identical
          # check on 2026-07-31, and for its reason: a clean no-PR exit is
          # also what the thin-content and sameness gates produce when they
          # correctly reject an idea, and emailing the owner a red alert for
          # correct behaviour teaches them to ignore the alerts. Deferred
          # keeps the job due (3h claim grace, not the 20h cadence), the
          # stuck-build sweep reverts the in_progress row, and chronic
          # nothing-runs go stale and alarm through the deferral rails.
          log "job $key produced nothing - deferring"
          report "$key" deferred "the $agent run finished without building anything: no commit, no new PR, and a suggestion was waiting. The job stays due and is retried. Its own last words: $(echo "$msg" | tr '\n' ' ' | tail -c 220)"
          return
        fi
        ;;
    esac
    log "job $key done"
    report "$key" ok
  elif [ "$agent" = "codex" ]; then
    # Codex collapses every 429 into one message, so its text cannot tell a
    # transient rate limit from an account with no credit left. Guessing wrong
    # in the generous direction would report green forever while building
    # nothing, so ask OpenAI and branch on error.code, which is authoritative.
    if echo "$msg" | grep -qiE '429|too many requests|exceeded retry limit|usage limit|rate.?limit'; then
      pcode=$(curl -s --max-time 30 -o /tmp/probe.json -w "%{http_code}" https://api.openai.com/v1/responses \
        -H "Authorization: Bearer $agent_token" -H "Content-Type: application/json" \
        -d '{"model":"gpt-5-mini","input":"ok","max_output_tokens":16}') || pcode=000
      perr=$(jq -r '.error.code // empty' /tmp/probe.json 2>/dev/null)
      case "$pcode:$perr" in
        2*:*|429:rate_limit_exceeded)
          log "job $key deferred - Codex rate limit (clears by itself)"
          report "$key" deferred "Codex was rate-limited this run - retried automatically."
          return ;;
        429:*|402:*)
          log "job $key FAILED - OpenAI account out of credit ($perr)"
          report "$key" fail "your OpenAI account cannot run builds (OpenAI said: ${perr:-quota exceeded}). This does not fix itself by retrying - add credit at platform.openai.com/settings/organization/billing."
          return ;;
        401:*|403:*)
          log "job $key FAILED - OpenAI rejected the key"
          report "$key" fail "OpenAI rejected the API key (HTTP $pcode). Paste a fresh one on the dashboard's automatic-builds card, or set OPENAI_API_KEY in .env."
          return ;;
      esac
    fi
    [ -n "$msg" ] || msg="codex exited $rc (see $out in the dispatch-builder volume)"
    log "job $key FAILED: $msg"
    report "$key" fail "$msg"
  elif [ "$agent" = "cursor" ]; then
    # No API probe needed here, unlike Codex: --output-format json states the
    # verdict outright in `subtype`, so this branches on a field rather than
    # guessing from prose. What it must never do is treat an UNRECOGNISED
    # subtype as transient - a deferral is silent, and a silent deferral on a
    # real failure is the exact mistake the Codex branch above exists to avoid.
    #
    # Two limit shapes WERE measured (2026-08-06, an exhausted free plan): the
    # CLI exits 1 with an ActionRequiredError on STDERR and no JSON at all, so
    # subtype matching never sees them. Match stderr first; JSON-subtype limit
    # spellings remain unobserved, matched loosely below, and everything
    # unmatched falls through to a loud failure.
    cerr=$(tail -c 400 "$out.err" 2>/dev/null)
    case "$cerr" in
      *"hit your usage limit"*)
        log "job $key deferred - Cursor plan out of Agent usage"
        report "$key" deferred "Cursor's plan is out of Agent usage for now - retried automatically. It clears when the plan's usage resets; a paid Cursor plan carries a bigger pool."
        return ;;
      *"Free plans can only use Auto"*|*"Named models unavailable"*)
        log "job $key FAILED - Cursor plan cannot run the pinned model"
        report "$key" fail "CURSOR_MODEL names a specific model, but this Cursor plan only allows Auto - unset CURSOR_MODEL in .env or upgrade the Cursor plan."
        return ;;
    esac
    sub=$(jq -r '.subtype // empty' "$out" 2>/dev/null)
    case "$sub" in
      *rate*limit*|*quota*|*usage*limit*|*too*many*)
        log "job $key deferred - Cursor usage/rate limit ($sub)"
        report "$key" deferred "Cursor hit a usage or rate limit this run - retried automatically."
        return ;;
      *auth*|*unauthor*|*invalid*key*|*forbidden*)
        log "job $key FAILED - Cursor rejected the key ($sub)"
        report "$key" fail "Cursor rejected the API key. Mint a fresh one at cursor.com/dashboard/api and paste it on the dashboard's automatic-builds card, or set CURSOR_API_KEY in .env."
        return ;;
    esac
    [ -n "$msg" ] || msg="cursor-agent exited $rc (see $out in the dispatch-builder volume)"
    log "job $key FAILED: $msg"
    report "$key" fail "$msg"
  elif echo "$msg" | grep -qiE 'usage limit|limit reached|rate.?limit'; then
    # A usage-limit hit is a deferral, not a failure - the job stays due and
    # the next poll picks it back up, the same contract the GitHub Actions
    # builder gets from its own defer path.
    log "job $key deferred - Claude usage limit"
    report "$key" deferred "Claude hit a usage limit this run - retried automatically."
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

# Remember which token sources we booted with. The loop exports the resolved
# token per job, and without these sentinels that export would make every later
# iteration take the env branch - so a token rotated on the dashboard would
# never be picked up until a container restart.
ENV_CLAUDE_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN:-}"
ENV_OPENAI_KEY="${OPENAI_API_KEY:-}"
ENV_CURSOR_KEY="${CURSOR_API_KEY:-}"

while :; do
  # A non-claiming poll FIRST: it carries the tokens (gh + claude) and never
  # costs a cadence window, so resolving/validating the Claude token here can
  # never silently claim jobs we then skip for a bad token.
  probe=$(curl -s --max-time 60 -H "Authorization: Bearer ${CRON_SECRET}" "$APP/api/builder/jobs")
  if [ -z "$probe" ] || ! echo "$probe" | jq -e . >/dev/null 2>&1; then
    log "backend not reachable yet - retrying in 60s"
    sleep 60; continue
  fi

  # Agent credentials. The container's own env wins (classic installs that set
  # them in .env); otherwise whatever the backend just handed us - so owners who
  # paste a key on the dashboard's automatic-builds step never touch .env or
  # hunt for the install folder.
  #
  # Per agent, not one gate for the whole loop. A stack holding only an OpenAI
  # key used to sit idle forever waiting for a Claude token it was never going
  # to get, and the log line told it to go paste the wrong one.
  CLAUDE_TOK="${ENV_CLAUDE_TOKEN:-$(echo "$probe" | jq -r '.claude_token // .agent_tokens.claude // empty')}"
  OPENAI_TOK="${ENV_OPENAI_KEY:-$(echo "$probe" | jq -r '.agent_tokens.codex // empty')}"
  CURSOR_TOK="${ENV_CURSOR_KEY:-$(echo "$probe" | jq -r '.agent_tokens.cursor // empty')}"
  RESOLVED_CLAUDE_TOKEN="$CLAUDE_TOK"

  # A placeholder or a wrong-shaped paste is the common failure, and it must be
  # named rather than silently treated as absent - "idle, no token" when a
  # token IS pasted sends people hunting in the wrong place.
  AGENTS=""
  case "$CLAUDE_TOK" in
    "") : ;;
    *PASTE-YOUR-TOKEN*) log "the Claude token is still the placeholder; paste the real sk-ant-oat... token on the dashboard's automatic-builds step." ;;
    sk-ant-oat*) AGENTS="claude" ;;
    *) log "that doesn't look like a Claude Code OAuth token (expected sk-ant-oat...); re-run 'claude setup-token' and paste it again." ;;
  esac
  case "$OPENAI_TOK" in
    "") : ;;
    sk-*) AGENTS="${AGENTS:+$AGENTS,}codex" ;;
    *) log "that doesn't look like an OpenAI API key (expected sk-...); create one at platform.openai.com/api-keys and paste it again." ;;
  esac
  # Cursor has no published key prefix to assert, so the check is what is
  # safely knowable: not empty, no whitespace (the line-wrapped paste), and not
  # one of the OTHER agents' credentials pasted into the wrong slot.
  case "$CURSOR_TOK" in
    "") : ;;
    sk-ant-*) log "that is a Claude token, not a Cursor API key - it belongs in the Claude slot." ;;
    sk-*) log "that is an OpenAI key, not a Cursor API key - it belongs in the Codex slot." ;;
    *[[:space:]]*) log "the Cursor API key contains whitespace, so it was probably line-wrapped when copied; paste it again." ;;
    *) AGENTS="${AGENTS:+$AGENTS,}cursor" ;;
  esac

  if [ -z "$AGENTS" ]; then
    # Poll every 5 min while unconfigured so a freshly pasted key goes live
    # quickly, instead of the long idle a settled builder uses.
    log "idle - no coding-agent credential yet. Paste one on the dashboard's 'Turn on automatic builds' step (or set CLAUDE_CODE_OAUTH_TOKEN, OPENAI_API_KEY, or CURSOR_API_KEY in .env)."
    sleep 300; continue
  fi

  # Credential good - now claim real work, declaring which agents this container
  # can actually execute. The backend hands out nothing outside that set, so a
  # job is never claimed (burning its cadence window) for an agent we could not
  # have run.
  # &gh=1 declares a container-side BUILDER_GH_TOKEN, the one GitHub identity
  # the backend cannot see - without it the backend (correctly) hands out no
  # jobs when its own stored merge token is missing.
  GH_FLAG=""
  [ -n "$BUILDER_GH_TOKEN" ] && GH_FLAG="&gh=1"
  feed=$(curl -s --max-time 60 -H "Authorization: Bearer ${CRON_SECRET}" "$APP/api/builder/jobs?claim=1&agents=$AGENTS$GH_FLAG")
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
      log "jobs are due but no GitHub token is available - connect one in the wizard's Connect GitHub step, or on Home's 'Connect GitHub' card (or set BUILDER_GH_TOKEN in .env)"
    fi
    # This used to be silent whenever njobs was 0 (the common steady state) -
    # auto-merge being on with no token to actually merge with just sat there
    # invisibly, no docker log line and no cron_runs row, while Home's "Ready
    # to ship" card still claimed "merges on its own, no action needed"
    # unconditionally. Report it as a real failed run so it shows up on the
    # dashboard/get_cron_health like any other broken automation.
    if [ "$nsweeps" != "0" ]; then
      log "auto-merge is on but no GitHub token is available - PRs will not be merged until one is connected"
      echo "$feed" | jq -r '.merge_sweeps[].slug' | while read -r slug; do
        [ -n "$slug" ] || continue
        report "builder-merge--$slug" fail "no GitHub token connected - connect one in the wizard's Connect GitHub step, or on Home's 'Connect GitHub' card (or set BUILDER_GH_TOKEN in .env)"
      done
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

  # BUILDER_POLL_SECONDS (documented in the header) wins over the backend's
  # suggested cadence - it was documented but dead before this line read it.
  POLL="${BUILDER_POLL_SECONDS:-$(echo "$feed" | jq -r '.poll_seconds // 600')}"
  sleep "$POLL"
done

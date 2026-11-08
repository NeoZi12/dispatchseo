#!/bin/sh
# One-command boot for the self-hosted docker stack. Safe to re-run any
# time - every step checks before it writes. Quickstart:
#
#   git clone https://github.com/NeoZi12/dispatchseo && cd dispatchseo && sh start.sh
#
# What it does: creates .env from the example on first run, generates the
# one required secret, picks a free host port (4005, or the next port up
# if something like a dev server already holds it), then docker compose
# up. Full guide: docs/SELF_HOSTING.md
set -e

# start.sh is also the upgrade command, and the stack is not only images:
# docker-compose.yml, setup.sql (the migrate container mounts it from this
# folder), and this script itself all live in the repo. Refresh the repo
# first, then hand off to the fresh copy of this script (exec, so a changed
# start.sh never runs half-old half-new). Forks with local commits, tarball
# installs, and offline machines fail the ff-only pull quietly and boot
# what they have; GIT_TERMINAL_PROMPT=0 keeps a credential prompt from
# hanging an unattended run.
if [ -z "$DISPATCHSEO_PULLED" ] && [ -d .git ] && command -v git >/dev/null 2>&1; then
  GIT_TERMINAL_PROMPT=0 git pull --ff-only --quiet 2>/dev/null || true
  DISPATCHSEO_PULLED=1
  export DISPATCHSEO_PULLED
  exec sh "$0"
fi

# No git clone here (the tarball path install.sh takes when git is absent).
# Say so LOUDLY, because the image pull further down is NOT gated on this:
# without it, an upgrade quietly lands the newest app + builder images on
# whatever setup.sql and docker-compose.yml this folder was created with -
# so new migrations never apply and new compose env never reaches the
# containers. Nothing errors; features just silently don't exist, while
# docs/upgrading.mdx promises "sh start.sh is the whole upgrade". A warning
# that names the real command is the least this can do.
if [ ! -d .git ]; then
  echo ""
  echo "  Note: this folder is not a git clone, so start.sh cannot refresh"
  echo "  DispatchSEO's own files (database migrations, docker-compose.yml)."
  echo "  Your containers may update while the schema they expect does not."
  echo ""
  echo "  To upgrade properly, re-run the installer in this folder:"
  echo "    curl -fsSL https://dispatchseo.com/install.sh | sh"
  echo ""
fi

# Fail early with the real fix when docker or the compose v2 plugin is
# missing - the raw CLI errors ("docker: 'compose' is not a docker command")
# send people down the wrong rabbit hole. docker-compose v1 (the hyphen
# binary) is not enough: this script uses the v2 plugin syntax throughout.
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker isn't installed (or isn't on PATH)."
  echo "Install it first: https://docs.docker.com/engine/install/  then re-run  sh start.sh"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker is here, but the Compose v2 plugin isn't ('docker compose version' failed)."
  echo "Install it: https://docs.docker.com/compose/install/linux/"
  echo "(the legacy docker-compose v1 binary is not enough)"
  exit 1
fi

[ -f .env ] || cp .env.docker.example .env

# Notepad (and friends) save CRLF, and docker compose reads .env raw - a \r
# inside any value poisons whatever consumes it (a domain with \r breaks
# caddy, a port with \r breaks the probe). Normalize the whole file once
# per boot so hand-edits on Windows can never wedge the stack.
if grep -q "$(printf '\r')" .env 2>/dev/null; then
  tr -d '\r' < .env > .env.crlf-fix && mv .env.crlf-fix .env
fi

# The one required secret. Generated once; re-runs keep the existing value.
# /dev/urandom fallback: a box without openssl must not write an empty
# secret (set -e does not catch a failed $(...) inside echo).
if ! grep -q '^CRON_SECRET=..*' .env; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -hex 24)
  else
    SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  [ -n "$SECRET" ] || { echo "Could not generate CRON_SECRET (no openssl, no /dev/urandom)"; exit 1; }
  echo "CRON_SECRET=$SECRET" >> .env
fi

# The database password. Postgres bakes it into the data volume the first time
# that volume is created, so it can only be generated on a FRESH install: an
# existing volume keeps whatever password it was created with, and writing a
# new one here would lock the app out of its own database. "Fresh" = the
# compose project's postgres volume does not exist yet. `docker volume ls`
# first, so a stopped Docker daemon (inspect fails for that reason too) is
# never mistaken for a fresh install.
if ! grep -q '^POSTGRES_PASSWORD=..*' .env && docker volume ls -q >/dev/null 2>&1; then
  if ! docker volume inspect dispatchseo_dispatch-pgdata >/dev/null 2>&1; then
    if command -v openssl >/dev/null 2>&1; then
      PGPASS=$(openssl rand -hex 24)
    else
      PGPASS=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
    fi
    [ -n "$PGPASS" ] || { echo "Could not generate POSTGRES_PASSWORD (no openssl, no /dev/urandom)"; exit 1; }
    echo "POSTGRES_PASSWORD=$PGPASS" >> .env
  else
    echo "  Note: the database still uses the default password. To rotate it: dump it (docker compose exec postgres pg_dump -U dispatch dispatchseo > backup.sql), set POSTGRES_PASSWORD in .env, recreate the volume (docker compose down -v), start again and restore the dump."
  fi
fi

# One-time token for the first-run /setup page, so whoever reaches the
# dashboard before its owner cannot claim the instance. Generated once on any
# install; re-runs keep the existing value and print it at the end.
if ! grep -q '^SETUP_TOKEN=..*' .env; then
  if command -v openssl >/dev/null 2>&1; then
    STOKEN=$(openssl rand -hex 16)
  else
    STOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  [ -n "$STOKEN" ] || { echo "Could not generate SETUP_TOKEN (no openssl, no /dev/urandom)"; exit 1; }
  echo "SETUP_TOKEN=$STOKEN" >> .env
fi

# A random id for the once-a-day "this install is alive" ping (see
# docker/cron/crontab and src/lib/heartbeat.ts). It identifies this INSTALL and
# nothing else - it is not derived from your domain, your email or your data,
# and the ping carries only this id plus the version. Delete the line or set
# DISPATCHSEO_TELEMETRY=off in .env to stop it.
#
# Written here rather than only in the database because a stack whose owner
# never ran the setup wizard has no instance_settings row to store one in, and
# an install that cannot produce a STABLE id has to send nothing at all - a
# fresh random id each day would report one machine as hundreds of installs.
# Unlike CRON_SECRET this must never abort the boot: an unusable ping is not a
# reason to refuse to start.
if ! grep -q '^DISPATCH_INSTALL_ID=..*' .env; then
  if command -v openssl >/dev/null 2>&1; then
    HEX=$(openssl rand -hex 16)
  else
    HEX=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  # 32 hex chars sliced into UUID v4 shape (literal "4" for the version nibble,
  # "a" for the variant) - the exact shape INSTALL_ID_RE validates on both ends.
  if [ -n "$HEX" ] && [ "${#HEX}" -ge 30 ]; then
    echo "DISPATCH_INSTALL_ID=$(echo "$HEX" | cut -c1-8)-$(echo "$HEX" | cut -c9-12)-4$(echo "$HEX" | cut -c13-15)-a$(echo "$HEX" | cut -c16-18)-$(echo "$HEX" | cut -c19-30)" >> .env
  fi
fi

# The telemetry opt-out is only real if the app container actually SEES the
# setting. DISPATCHSEO_TELEMETRY reaches it through exactly one line in
# docker-compose.yml (the app service enumerates its env explicitly, so an
# unlisted variable simply never arrives), and the compose file in this folder
# is whatever the git pull at the top of this script last managed to fetch -
# which forks with local commits, tarball installs and offline machines all
# skip quietly. So an owner can put DISPATCHSEO_TELEMETRY=off in .env, re-run
# this script, watch it succeed, and keep sending the daily ping.
#
# Of the two ways an opt-out can fail, "still sending" is the one that breaks a
# promise /privacy and the docs make in writing. Never let that be silent.
if [ -f docker-compose.yml ] \
  && grep -q '^DISPATCHSEO_TELEMETRY=..*' .env 2>/dev/null \
  && ! grep -q '^[[:space:]]*DISPATCHSEO_TELEMETRY:' docker-compose.yml 2>/dev/null; then
  echo ""
  echo "  Warning: your .env sets DISPATCHSEO_TELEMETRY, but the docker-compose.yml"
  echo "  in this folder is an older copy that never passes it to the app"
  echo "  container - so the setting is ignored and the anonymous once-a-day"
  echo "  install ping keeps sending until you fix one of these:"
  echo ""
  echo "    - Update this folder's files, then start again:"
  echo "        git pull && sh start.sh"
  echo "    - No git here? Re-run the installer in this folder instead:"
  echo "        curl -fsSL https://dispatchseo.com/install.sh | sh"
  echo "    - Or edit docker-compose.yml by hand: under the app service's"
  echo "      'environment:' block, add this line (2 spaces deeper than 'app:'"
  echo "      plus 4 more, matching the lines already there):"
  echo '        DISPATCHSEO_TELEMETRY: ${DISPATCHSEO_TELEMETRY:-}'
  echo ""
  echo "  What the ping contains, and nothing else: a random install id and the"
  echo "  version. Details: https://dispatchseo.com/docs/security#telemetry-on-a-self-hosted-install"
  echo ""
fi

# Host port for the dashboard. An explicit DISPATCH_PORT in .env always
# wins; otherwise probe from 4005 upward and take the first free port.
# "Connection refused" (curl exit 7) is the free signal - anything that
# answers or hangs means the port is taken. Without curl, stay on 4005.
# tr -d '\r': a Windows owner hand-editing .env in Notepad saves CRLF, and
# a carried \r poisons the value ("4005\r" breaks the probe URL, a domain
# with \r breaks caddy). Same guard on DOMAIN below.
PORT=$(grep '^DISPATCH_PORT=..*' .env | tail -1 | cut -d= -f2 | tr -d '\r')
if [ -z "$PORT" ]; then
  PORT=4005
  if command -v curl >/dev/null 2>&1; then
    while [ "$PORT" -lt 4100 ]; do
      rc=0
      curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT" || rc=$?
      if [ "$rc" -eq 7 ]; then break; fi
      PORT=$((PORT + 1))
    done
  fi
  echo "DISPATCH_PORT=$PORT" >> .env
fi

# APP_URL follows the chosen port. Written outside the port block above:
# a hand-pinned DISPATCH_PORT used to skip it, leaving the compose default
# pointing at 4005 while the dashboard actually served on the pinned port.
if ! grep -q '^APP_URL=..*' .env; then
  echo "APP_URL=http://localhost:$PORT" >> .env
fi

# A DOMAIN in .env turns on the bundled HTTPS proxy (the caddy service):
# certificates fetch and renew themselves, APP_URL follows the domain, and
# nothing needs installing on the host. Needs the domain's DNS A record
# pointing at this machine, with ports 80/443 reachable.
DOMAIN=$(grep '^DOMAIN=..*' .env | tail -1 | cut -d= -f2 | tr -d '\r')
PROFILE=""
if [ -n "$DOMAIN" ]; then
  PROFILE="--profile domain"
  # (|| true: grep -v exits 1 when nothing survives the filter, and set -e
  # would abort the whole boot over an .env that only held APP_URL.)
  # DISPATCHSEO_LAST_DOMAIN records that WE wrote this APP_URL, so the
  # else-branch below can tell "owner deleted DOMAIN, heal APP_URL" apart
  # from "owner runs their own reverse proxy and hand-set APP_URL" - the
  # one case that must never be overwritten (docs/vps.mdx documents it).
  { grep -v -e '^APP_URL=' -e '^DISPATCHSEO_LAST_DOMAIN=' .env || true; } > .env.new && mv .env.new .env
  echo "APP_URL=https://$DOMAIN" >> .env
  echo "DISPATCHSEO_LAST_DOMAIN=$DOMAIN" >> .env
else
  # DOMAIN was removed (firewalled 80/443 is the usual reason to back out):
  # if APP_URL is still exactly the address the old DOMAIN run wrote, point
  # it back at localhost - otherwise the app keeps building links to an
  # https address caddy no longer serves. A hand-set APP_URL never matches
  # the recorded last domain, so it is left alone.
  LAST_DOMAIN=$(grep '^DISPATCHSEO_LAST_DOMAIN=..*' .env | tail -1 | cut -d= -f2 | tr -d '\r')
  CUR_APP_URL=$(grep '^APP_URL=..*' .env | tail -1 | cut -d= -f2- | tr -d '\r')
  if [ -n "$LAST_DOMAIN" ] && [ "$CUR_APP_URL" = "https://$LAST_DOMAIN" ]; then
    { grep -v -e '^APP_URL=' -e '^DISPATCHSEO_LAST_DOMAIN=' .env || true; } > .env.new && mv .env.new .env
    echo "APP_URL=http://localhost:$PORT" >> .env
  fi
fi

# Prefer the prebuilt images (published to GHCR by CI) - first boot becomes
# a download instead of a Next.js compile, which matters on small VPSes.
# Anything that can't pull lands on the local build automatically: modified
# forks (set BUILD_FROM_SOURCE=1 in .env to force it), offline machines, or
# a private repo phase. --build on the fallback keeps upgrades honest:
# "git pull && sh start.sh" always runs the code you just pulled.
if ! grep -q '^BUILD_FROM_SOURCE=1' .env 2>/dev/null \
  && docker compose $PROFILE pull --quiet app builder >/dev/null; then
  docker compose $PROFILE up -d --no-build
else
  # Say WHY we're compiling: the silent fallback looked like a hang, and a
  # from-source Next.js build needs far more memory than the pulled images
  # (the documented 1 GB VPS minimum is for pulling, not compiling).
  if ! grep -q '^BUILD_FROM_SOURCE=1' .env 2>/dev/null; then
    echo ""
    echo "  Couldn't download the prebuilt images (see any error above) - building"
    echo "  from source instead. First build takes a while and needs ~4 GB of"
    echo "  memory; on a small VPS, add swap or just re-run  sh start.sh  later"
    echo "  to retry the download."
    echo ""
  fi
  docker compose $PROFILE up -d --build
fi

echo '
  DispatchSEO is running.
'
if [ -n "$DOMAIN" ]; then
  echo "  Next step -> open  https://$DOMAIN  in your browser."
  echo '  (a fresh certificate can take a minute after DNS lands - just refresh)'
else
  # Two different next steps depending on where this box lives. An SSH
  # login usually means a remote server, so lead with the VPS branch then
  # - but always print both: sudo strips SSH_* so detection can miss.
  LOCAL_MSG="  Installing on your own computer?
   -> open  http://localhost:$PORT  in your browser."
  VPS_MSG="  Installing on a VPS / cloud server?
   -> localhost is this server, not your computer - it won't open from
      your browser. Give the dashboard a real address instead: add
      DOMAIN=dispatch.your-domain.com to .env, then re-run  sh start.sh
      (HTTPS is automatic). Needs the domain's DNS A record pointing at
      this server. Guide + a no-domain option: https://dispatchseo.com/docs/vps"
  if [ -n "$SSH_CONNECTION" ] || [ -n "$SSH_TTY" ]; then
    echo "$VPS_MSG"; echo; echo "$LOCAL_MSG"
  else
    echo "$LOCAL_MSG"; echo; echo "$VPS_MSG"
  fi
fi
echo '  The setup wizard takes it from there.

  (first boot can take ~20 seconds before the page answers - just refresh)
'
SETUP_TOKEN_VALUE=$(grep '^SETUP_TOKEN=' .env | tail -n 1 | cut -d= -f2-)
echo "  Setup token (enter it on the /setup page): $SETUP_TOKEN_VALUE"
echo ''

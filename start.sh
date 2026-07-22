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

[ -f .env ] || cp .env.docker.example .env

# The one required secret. Generated once; re-runs keep the existing value.
if ! grep -q '^CRON_SECRET=..*' .env; then
  echo "CRON_SECRET=$(openssl rand -hex 24)" >> .env
fi

# Host port for the dashboard. An explicit DISPATCH_PORT in .env always
# wins; otherwise probe from 4005 upward and take the first free port.
# "Connection refused" (curl exit 7) is the free signal - anything that
# answers or hangs means the port is taken. Without curl, stay on 4005.
PORT=$(grep '^DISPATCH_PORT=..*' .env | tail -1 | cut -d= -f2)
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
  echo "APP_URL=http://localhost:$PORT" >> .env
fi

# A DOMAIN in .env turns on the bundled HTTPS proxy (the caddy service):
# certificates fetch and renew themselves, APP_URL follows the domain, and
# nothing needs installing on the host. Needs the domain's DNS A record
# pointing at this machine, with ports 80/443 reachable.
DOMAIN=$(grep '^DOMAIN=..*' .env | tail -1 | cut -d= -f2)
PROFILE=""
if [ -n "$DOMAIN" ]; then
  PROFILE="--profile domain"
  # (|| true: grep -v exits 1 when nothing survives the filter, and set -e
  # would abort the whole boot over an .env that only held APP_URL.)
  { grep -v '^APP_URL=' .env || true; } > .env.new && mv .env.new .env
  echo "APP_URL=https://$DOMAIN" >> .env
fi

# Prefer the prebuilt images (published to GHCR by CI) - first boot becomes
# a download instead of a Next.js compile, which matters on small VPSes.
# Anything that can't pull lands on the local build automatically: modified
# forks (set BUILD_FROM_SOURCE=1 in .env to force it), offline machines, or
# a private repo phase. --build on the fallback keeps upgrades honest:
# "git pull && sh start.sh" always runs the code you just pulled.
if ! grep -q '^BUILD_FROM_SOURCE=1' .env 2>/dev/null \
  && docker compose $PROFILE pull --quiet app builder >/dev/null 2>&1; then
  docker compose $PROFILE up -d --no-build
else
  docker compose $PROFILE up -d --build
fi

echo '
  DispatchSEO is running.
'
if [ -n "$DOMAIN" ]; then
  echo "  Next step -> open  https://$DOMAIN  in your browser."
  echo '  (a fresh certificate can take a minute after DNS lands - just refresh)'
else
  echo "  Next step -> open  http://localhost:$PORT  in your browser."
  echo "
  (on a VPS? localhost means the server itself - give the dashboard a real
   address instead: add DOMAIN=dispatch.your-domain.com to .env and re-run
   sh start.sh. Guide: https://dispatchseo.com/docs/vps)"
fi
echo '  The setup wizard takes it from there.

  (first boot can take ~20 seconds before the page answers - just refresh)
'

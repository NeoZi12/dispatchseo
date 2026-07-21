#!/bin/sh
# One-command boot for the self-hosted docker stack. Safe to re-run any
# time - every step checks before it writes. Quickstart:
#
#   git clone https://github.com/NeoZi12/dispatchseo && cd dispatchseo && sh start.sh
#
# What it does: creates .env from the example on first run, generates the
# one required secret, picks a free host port (3000, or the next port up
# if something like a dev server already holds it), then docker compose
# up. Full guide: docs/SELF_HOSTING.md
set -e

[ -f .env ] || cp .env.docker.example .env

# The one required secret. Generated once; re-runs keep the existing value.
if ! grep -q '^CRON_SECRET=..*' .env; then
  echo "CRON_SECRET=$(openssl rand -hex 24)" >> .env
fi

# Host port for the dashboard. An explicit DISPATCH_PORT in .env always
# wins; otherwise probe from 3000 upward and take the first free port.
# "Connection refused" (curl exit 7) is the free signal - anything that
# answers or hangs means the port is taken. Without curl, stay on 3000.
PORT=$(grep '^DISPATCH_PORT=..*' .env | tail -1 | cut -d= -f2)
if [ -z "$PORT" ]; then
  PORT=3000
  if command -v curl >/dev/null 2>&1; then
    while [ "$PORT" -lt 3100 ]; do
      rc=0
      curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT" || rc=$?
      if [ "$rc" -eq 7 ]; then break; fi
      PORT=$((PORT + 1))
    done
  fi
  echo "DISPATCH_PORT=$PORT" >> .env
  echo "APP_URL=http://localhost:$PORT" >> .env
fi

docker compose up -d

echo '
  DispatchSEO is running.
'
echo "  Next step -> open  http://localhost:$PORT  in your browser."
echo '  The setup wizard takes it from there.

  (first boot can take ~20 seconds before the page answers - just refresh)
'

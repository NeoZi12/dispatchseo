#!/bin/sh
# Curl one backend cron endpoint with the shared secret. BusyBox crond strips
# most environment, so the entrypoint snapshots it to /etc/cron-env for us.
. /etc/cron-env
job="$1"
echo "[cron] $(date -u '+%Y-%m-%dT%H:%M:%SZ') hitting $job"
wget -q -O- -T 300 \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_INTERNAL_URL}/api/cron/${job}" \
  || echo "[cron] $job FAILED (see the app container's logs / dashboard banner)"
echo ""

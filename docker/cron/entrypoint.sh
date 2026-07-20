#!/bin/sh
# Snapshot the env vars the cron jobs need (crond runs jobs with a stripped
# environment), then run BusyBox crond in the foreground so container logs
# show every hit.
{
  echo "CRON_SECRET='${CRON_SECRET}'"
  echo "APP_INTERNAL_URL='${APP_INTERNAL_URL:-http://app:3000}'"
} > /etc/cron-env
chmod 600 /etc/cron-env
echo "[cron] schedule loaded:"
cat /etc/crontabs/root
exec crond -f -l 8 -L /dev/stdout

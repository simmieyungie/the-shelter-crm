#!/bin/sh
# Nightly pg_dump at 02:00 Lagos (01:00 UTC); keeps 14 daily and 8 weekly (Sunday) backups.
set -eu
while true; do
  now=$(date -u +%H%M)
  if [ "$now" = "0100" ]; then
    stamp=$(date -u +%Y-%m-%d)
    pg_dump -h postgres -U crm -d crm -Fc -f "/backups/crm-$stamp.dump"
    if [ "$(date -u +%u)" = "7" ]; then cp "/backups/crm-$stamp.dump" "/backups/weekly-crm-$stamp.dump"; fi
    ls -1t /backups/crm-*.dump | tail -n +15 | xargs -r rm -f
    ls -1t /backups/weekly-crm-*.dump 2>/dev/null | tail -n +9 | xargs -r rm -f
    echo "backup written: crm-$stamp.dump"
    sleep 61
  fi
  sleep 30
done

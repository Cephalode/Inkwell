#!/bin/bash
# Inkwell pi-observer — continuous agent watch loop.
# Every 30 min: build digest from the events table, ask pi to analyze,
# write brief to briefs/ (latest.md = current), deliver via Discord webhook
# if DISCORD_WEBHOOK_URL is set. State file makes pi treat findings as
# NEW vs RECURRING across runs.
set -u
cd "$(dirname "$0")/.."   # repo root (pi-observer/)

# Pull DISCORD_WEBHOOK_URL etc. from the app's .env when present.
[ -f .env ] && set -a && . ./.env && set +a

INTERVAL="${INTERVAL:-1800}"
mkdir -p briefs

while true; do
  # 1. Digest — last 30 min of events, so each brief covers its own window.
  if node server/scripts/events_digest.mjs 1 > briefs/digest.json 2>briefs/digest.err; then
    TOTAL=$(jq -r '.total_events // 0' briefs/digest.json)

    if [ "$TOTAL" -eq 0 ]; then
      echo "$(date '+%H:%M') no activity" >> briefs/observer.log
    else
      # 2. pi analyzes. Fresh context each cycle; state file carries memory.
      cp briefs/state.json briefs/state.prev.json 2>/dev/null || true
      timeout 240 pi -p "You are the Inkwell UX observer. Analyze briefs/digest.json (usage digest for the last 30 minutes) and write a concise brief to briefs/state.md using the write tool. Read briefs/state.json first (your previous findings, may not exist) and mark each finding NEW or RECURRING. Never repeat an identical finding more than twice; after that write exactly: still ongoing: <finding>. Structure: ⚠️ crash/broken-flow flag first if errors+rage_clicks co-occur, then **Doing** / **Friction** / **Habits** / **Actions** (1-3 evidence-tied suggestions). Facts from the digest only. state.json IS your output format: after writing state.md, also overwrite briefs/state.json with a compact JSON memory of the findings you just reported (array of {finding, count}, incrementing count for repeats). Keep the whole brief under 200 words." \
        --tools read,write \
        --no-session --thinking off --mode text > briefs/last_run.log 2>&1
      PI_RC=$?

      if [ $PI_RC -eq 0 ] && [ -f briefs/state.md ]; then
        cp briefs/state.md briefs/latest.md
        echo "$(date '+%H:%M') brief written ($(wc -c < briefs/state.md) bytes)" >> briefs/observer.log
        # 3. Deliver: Discord webhook if configured.
        if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
          jq -n --rawfile c briefs/state.md '{content: $c}' | curl -sf -X POST \
            -H 'Content-Type: application/json' \
            -d @- "$DISCORD_WEBHOOK_URL" >> briefs/observer.log 2>&1 \
            && echo "$(date '+%H:%M') delivered to discord" >> briefs/observer.log
        fi
      else
        echo "$(date '+%H:%M') pi failed rc=$PI_RC" >> briefs/observer.log
        mv briefs/state.prev.json briefs/state.json 2>/dev/null || true
      fi
    fi
  else
    echo "$(date '+%H:%M') digest failed" >> briefs/observer.log
  fi
  sleep "$INTERVAL"
done

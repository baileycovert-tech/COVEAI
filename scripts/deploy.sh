#!/usr/bin/env bash
# Safe, near-zero-downtime deploy. The Cloudflare tunnel proxies localhost:4317; if the app is down
# during a full rebuild (~40s) the public site 502s. So we build into a TEMP dir while the current
# build keeps serving, then swap + restart (only a ~3s blip). A failed build leaves the live app
# untouched — no broken state, no KeepAlive crash-loop.
set -euo pipefail
cd "$(dirname "$0")/.."
LABEL="com.covert.crm"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TMP=".next.new"

echo "▸ Building into $TMP (live site stays up on the current build)…"
rm -rf "$TMP"
COVE_DIST_DIR="$TMP" npm run build

echo "▸ Build OK — swapping in and restarting (brief blip)…"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -rf .next && mv "$TMP" .next
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "▸ Health check…"
for i in $(seq 1 8); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 4 http://localhost:4317/login 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then echo "✅ Live and healthy (HTTP 200). Cloudflare tunnel target restored."; exit 0; fi
  sleep 2
done
echo "⚠️  App not returning 200 after restart — check ~/Library/Logs/covert-crm.log"; exit 1

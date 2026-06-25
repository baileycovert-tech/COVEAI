#!/usr/bin/env bash
# Install the autonomous live-refresh service (path B).
# Runs scripts/dms-refresh.mjs every 5 min via launchd — talks straight to the GMReview
# DMS MCP, rebuilds leads → customers → pipeline + inventory. No Claude / API key / app needed.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
NODE="$(command -v node)"
LABEL="com.covert.crm-refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/covert-crm-refresh.log"
INTERVAL="${1:-300}"   # seconds; default 5 min. Pass e.g. 180 for 3 min.

[ -n "$NODE" ] || { echo "!! node not found on PATH"; exit 1; }

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/dms-refresh.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict><key>DMS_MCP_URL</key><string>${DMS_MCP_URL:-https://gmmcp.slaxer07.com/sse}</string></dict>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PL

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart "gui/$(id -u)/$LABEL"
echo "OK — $LABEL installed (every ${INTERVAL}s). Log: $LOG"
echo "Check it ran:  tail -f $LOG    |    Status in app: /health → Live refresh engine"

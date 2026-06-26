#!/usr/bin/env bash
# Install the autonomous iMessage capture service.
# Runs scripts/imessage-tail.mjs every 2 min via launchd — reads NEW inbound texts straight
# from ~/Library/Messages/chat.db, turns them into leads, runs the AI context pass, rebuilds
# the board. No Claude session needed.
#
# ONE-TIME PERMISSION: a launchd-spawned `node` is NOT the Claude app, so macOS must be told
# this node may read Messages. After install, grant Full Disk Access to the node binary printed
# below (System Settings → Privacy & Security → Full Disk Access → + → the node path), then:
#   launchctl kickstart -k gui/$(id -u)/com.covert.crm-imessage
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
NODE="$(command -v node)"
LABEL="com.covert.crm-imessage"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/covert-crm-imessage.log"
INTERVAL="${1:-120}"   # seconds; default 2 min.

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
    <string>$ROOT/scripts/imessage-tail.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
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
echo
echo "IMPORTANT one-time step — grant Full Disk Access to THIS node so it can read Messages:"
echo "  $NODE"
echo "System Settings → Privacy & Security → Full Disk Access → + → (Cmd+Shift+G) paste that path."
echo "Then: launchctl kickstart -k gui/$(id -u)/$LABEL   and check: tail -f $LOG"

#!/usr/bin/env bash
# Keep the COVE contact index synced from the Mac's Contacts every 12h. Runs under
# /usr/local/bin/node (which has Full Disk Access — required to read the AddressBook stores).
# Writes only data/contacts.db, which the live app reads on the fly, so this never needs a restart.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"; LABEL="com.covert.crm-contacts"; PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/covert-crm-contacts.log"; INTERVAL="${1:-43200}"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/local/bin/node</string><string>$ROOT/scripts/sync-contacts.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "OK — $LABEL installed (every ${INTERVAL}s). Log: $LOG"

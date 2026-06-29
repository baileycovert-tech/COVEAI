#!/usr/bin/env bash
# Autonomous Gmail ingestion (leads + motosnap CSVs + StoneEagle PDF) over IMAP, every 15 min.
# Needs a valid Gmail App Password in data/.gmail-app-password (or deal-mailer/config.json).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"; LABEL="com.covert.crm-gmail"; PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/covert-crm-gmail.log"; INTERVAL="${1:-900}"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$ROOT/scripts/gmail-pull.py</string></array>
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

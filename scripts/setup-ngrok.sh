#!/usr/bin/env bash
# Finish the permanent "Covert AI" URL via an ngrok reserved (static) domain.
#
# ONE-TIME steps YOU do first (they involve your own ngrok account — I don't touch them):
#   1. Make a free account at https://ngrok.com  (Google sign-in is fine)
#   2. Dashboard → "Your Authtoken" → copy it, then run:
#         ~/.local/bin/ngrok config add-authtoken <YOUR_AUTHTOKEN>
#   3. Dashboard → Universal Gateway → Domains → "+ Create Domain"
#         (free tier gives one static domain, e.g. covert-ai.ngrok-free.app)
#
# Then run THIS once with that domain:
#         ./scripts/setup-ngrok.sh covert-ai.ngrok-free.app
#
# It installs an always-on launchd service so the URL survives reboots and never rotates.
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "usage: ./scripts/setup-ngrok.sh <your-reserved-ngrok-domain>"
  echo "example: ./scripts/setup-ngrok.sh covert-ai.ngrok-free.app"
  exit 1
fi
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%/}"   # tolerate a pasted URL

NGROK="$HOME/.local/bin/ngrok"
LABEL="com.covert.crm-ngrok"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/covert-crm-ngrok.log"

[ -x "$NGROK" ] || { echo "!! ngrok not found at $NGROK"; exit 1; }

echo "-> Checking your ngrok authtoken is configured..."
if ! "$NGROK" config check >/dev/null 2>&1; then
  echo "!! ngrok has no authtoken yet. Run step 2 first:"
  echo "     $NGROK config add-authtoken <YOUR_AUTHTOKEN>"
  exit 1
fi

echo "-> Writing launchd service ($LABEL) for https://$DOMAIN ..."
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NGROK</string>
    <string>http</string>
    <string>--domain=$DOMAIN</string>
    <string>4317</string>
    <string>--log=stdout</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

echo "-> (Re)loading the service..."
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "-> Waiting for the tunnel to come up..."
ok=""
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "https://$DOMAIN/login" 2>/dev/null || true)
  if [ "$code" = "200" ] || [ "$code" = "307" ]; then ok=1; break; fi
  sleep 2
done

if [ -n "$ok" ]; then
  echo
  echo "DONE ✅  Permanent link:  https://$DOMAIN"
  echo "  On your iPhone: open it in Safari → Share → Add to Home Screen → 'Covert AI'."
  echo "  This URL is now stable across tunnel restarts and reboots."
  echo
  echo "  (Optional) turn off the old random Cloudflare tunnel so only ngrok runs:"
  echo "     launchctl bootout gui/$(id -u)/com.covert.crm-tunnel"
else
  echo "!! Tunnel didn't answer yet. Check the log: $LOG"
  echo "   Common causes: domain typo, authtoken not added, or the CRM not running on :4317."
  exit 1
fi

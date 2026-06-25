#!/usr/bin/env bash
# Covert CRM launcher — `./run.sh` opens the app for clicking through.
#
#   ./run.sh            start (or tell you it's already running) and print the URLs
#   ./run.sh --restart  rebuild + restart the always-on launchd service
#   ./run.sh --build    force a fresh build before starting
#
# The CRM normally runs 24/7 as the launchd service `com.covert.crm`, so most of
# the time this script just confirms it's up and shows you where to click.
set -euo pipefail
cd "$(dirname "$0")"

PORT=4317
URL="http://localhost:$PORT"
MODE="${1:-}"

# LAN IP so the phone (same Wi-Fi) can reach it too.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

print_urls() {
  echo "    Mac:    $URL"
  [ -n "$LAN_IP" ] && echo "    Phone:  http://$LAN_IP:$PORT   (same Wi-Fi, add to Home Screen for the app)"
  echo "    Health: $URL/health   (admin — confirms data freshness)"
}

echo "Covert CRM"
echo "=========="

# 1. Dependencies (first run only).
if [ ! -d node_modules ]; then
  echo "-> Installing dependencies (first run, one time)..."
  npm install
fi

# 2. Is it already serving? (curl in an if-condition does not trip set -e)
RUNNING=0
if curl -s -o /dev/null --max-time 3 "$URL/"; then RUNNING=1; fi

if [ "$RUNNING" = "1" ] && [ "$MODE" != "--restart" ]; then
  echo "OK  Already running on port $PORT (launchd service com.covert.crm)."
  print_urls
  echo
  echo "    Already up — nothing to start. Use './run.sh --restart' to rebuild + restart."
  exit 0
fi

if [ "$MODE" = "--restart" ]; then
  echo "-> Rebuilding..."
  npm run build
  echo "-> Restarting the launchd service..."
  if launchctl kickstart -k "gui/$(id -u)/com.covert.crm" 2>/dev/null; then
    for i in $(seq 1 20); do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$URL/" 2>/dev/null || true)"
      [ "$code" = "307" ] || [ "$code" = "200" ] && { echo "OK  Back up (HTTP $code)."; print_urls; exit 0; }
      sleep 1
    done
    echo "!!  Service restarted but did not answer on $PORT within 20s — check ~/Library/Logs/covert-crm.log"
    exit 1
  else
    echo "!!  Could not kickstart com.covert.crm (is it loaded? 'launchctl list | grep covert'). Falling through to a foreground start."
  fi
fi

# 3. Build if there's no build yet, or --build was asked for.
if [ ! -d .next ] || [ "$MODE" = "--build" ]; then
  echo "-> Building..."
  npm run build
fi

# 4. Foreground start (Ctrl-C to stop). Only reached when nothing is on the port.
echo "-> Starting Covert CRM on port $PORT..."
print_urls
echo "    (Ctrl-C to stop)"
exec npm run start

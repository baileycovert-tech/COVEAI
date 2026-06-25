#!/usr/bin/env bash
# Permanent "Covert AI" URL on YOUR Cloudflare domain (named tunnel).
# Result: a fixed https://<hostname> that never rotates and survives reboots.
#
# Run it with the hostname you want (a subdomain of a domain that's on your Cloudflare):
#     ./scripts/setup-cloudflare.sh crm.covertai.com
#     ./scripts/setup-cloudflare.sh covertai.yourdomain.com
#
# What happens:
#   1. Opens your browser ONCE to log into Cloudflare and authorize your domain
#      (you click "Authorize" — no token or password is typed here or seen by anyone else).
#   2. Creates a tunnel, points the hostname's DNS at it, and installs an always-on service.
# Nothing secret is printed or stored anywhere but your own ~/.cloudflared.
set -euo pipefail

HOST="${1:-}"
if [ -z "$HOST" ]; then
  echo "usage: ./scripts/setup-cloudflare.sh <hostname>   e.g. crm.covertai.com"
  exit 1
fi
HOST="${HOST#https://}"; HOST="${HOST%/}"

CF="$HOME/.local/bin/cloudflared"
CFDIR="$HOME/.cloudflared"
NAME="covert-ai"
LABEL="com.covert.crm-cf"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/covert-crm-cf.log"
mkdir -p "$CFDIR"

[ -x "$CF" ] || { echo "!! cloudflared not found at $CF"; exit 1; }

# 1. Authorize (browser) — only if not already done.
if [ ! -f "$CFDIR/cert.pem" ]; then
  echo "-> A browser window will open. Log in and pick the domain for '$HOST', then click Authorize."
  "$CF" tunnel login
fi
[ -f "$CFDIR/cert.pem" ] || { echo "!! Login didn't complete (no cert.pem). Re-run after authorizing."; exit 1; }

# 2. Create the tunnel if it doesn't exist; get its UUID.
if ! "$CF" tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$NAME"; then
  echo "-> Creating tunnel '$NAME'..."
  "$CF" tunnel create "$NAME"
fi
UUID="$("$CF" tunnel list 2>/dev/null | awk -v n="$NAME" '$2==n{print $1}' | head -1)"
[ -n "$UUID" ] || { echo "!! Could not determine tunnel UUID"; exit 1; }
echo "-> Tunnel UUID: $UUID"

# 3. Route the hostname's DNS to this tunnel (creates/updates a CNAME in your Cloudflare DNS).
echo "-> Routing DNS $HOST -> tunnel..."
"$CF" tunnel route dns "$NAME" "$HOST" || echo "   (DNS route may already exist — continuing)"

# 4. Config: map the hostname to the local CRM on :4317.
cat > "$CFDIR/config.yml" <<YML
tunnel: $UUID
credentials-file: $CFDIR/$UUID.json
ingress:
  - hostname: $HOST
    service: http://localhost:4317
  - service: http_status:404
YML

# 5. Always-on launchd service.
echo "-> Installing always-on service ($LABEL)..."
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$CF</string>
    <string>tunnel</string>
    <string>--config</string>
    <string>$CFDIR/config.yml</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

# 6. Verify + retire the old random tunnel.
echo "-> Waiting for https://$HOST to come up (DNS can take ~30-60s the first time)..."
ok=""
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "https://$HOST/login" 2>/dev/null || true)
  [ "$code" = "200" ] || [ "$code" = "307" ] && { ok=1; break; }
  sleep 3
done
if [ -n "$ok" ]; then
  launchctl bootout "gui/$(id -u)/com.covert.crm-tunnel" 2>/dev/null || true   # retire the random quick tunnel
  echo
  echo "DONE ✅  Permanent link:  https://$HOST"
  echo "  iPhone: open it in Safari → Share → Add to Home Screen → 'Covert AI'."
  echo "  This URL is fixed now — it won't change on restart or reboot."
else
  echo "!! Not answering yet. DNS may still be propagating — try the URL in a minute,"
  echo "   or check the log: $LOG"
fi

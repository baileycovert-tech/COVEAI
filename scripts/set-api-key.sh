#!/usr/bin/env bash
# Turn on the AI assistant + AI outreach by adding your Anthropic API key — securely.
# Get a key at https://console.anthropic.com  → API Keys → Create Key (starts with sk-ant-).
# Then run THIS in your terminal (paste the key here, NOT into any chat):
#     ./scripts/set-api-key.sh sk-ant-xxxxxxxx
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${1:-}"
[ -n "$KEY" ] || { echo "usage: ./scripts/set-api-key.sh sk-ant-..."; exit 1; }
[[ "$KEY" == sk-ant-* ]] || { echo "!! that doesn't look like an Anthropic key (should start with sk-ant-)"; exit 1; }
# remove any existing line, then append
grep -v '^ANTHROPIC_API_KEY=' .env.local > .env.local.tmp 2>/dev/null || true
mv .env.local.tmp .env.local 2>/dev/null || true
echo "ANTHROPIC_API_KEY=$KEY" >> .env.local
echo "Key saved to .env.local (gitignored — never committed)."
echo "Rebuilding + restarting…"
npm run build >/dev/null 2>&1 && launchctl kickstart -k "gui/$(id -u)/com.covert.crm" >/dev/null 2>&1
echo "✅ Done. Your Ask assistant + AI Outreach drafting are now live."

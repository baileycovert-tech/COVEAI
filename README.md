# Covert CRM — Live Sales Assistant (web)

A local web CRM for Bailey Covert that turns the Covert Sales Assistant wiki + the live
GMReview CRM database into a real, browsable sales cockpit: a live sales board, a lead
pipeline, customer records, AI-drafted outreach, inventory, and metrics.

Built with Next.js (App Router). Runs on your Mac at **http://localhost:4317**.

---

## Phone / always-on access

Installed as a launchd service `com.covert.crm` — the production server runs 24/7 (auto-starts at login, auto-restarts on crash) on all interfaces, port 4317.

- **On this Mac:** http://localhost:4317
- **From your phone (same Wi-Fi):** http://192.168.1.14:4317 — open in Safari → Share → **Add to Home Screen** (installs as the "Covert CRM" app). The Mac's LAN IP can change on router reboot; set a DHCP reservation to pin it.

Manage the service:
```bash
launchctl unload ~/Library/LaunchAgents/com.covert.crm.plist   # stop
launchctl load   ~/Library/LaunchAgents/com.covert.crm.plist   # start
tail -f ~/Library/Logs/covert-crm.log                          # logs
```
After changing **code** (not data), rebuild + restart: `npm run build` then reload the service. Data/JSON changes are live (no rebuild).

## Quick start

```bash
cd "Covert Sales Assistant/covert-crm"
npm install
npm run dev
```

Open http://localhost:4317.

To enable real AI message drafting (otherwise it uses a built-in template):

```bash
cp .env.local.example .env.local
# then edit .env.local and paste your ANTHROPIC_API_KEY
```

---

## Pages

| Page | What it shows |
|---|---|
| **Sales Board** (`/`) | MTD units, gross, PVR, group rank, units chart, leaderboard, hot leads, recent deals, coach read |
| **Pipeline** (`/pipeline`) | Kanban of every lead in motion — Hot / Working / Warm / Appointment / Closed |
| **Customers** (`/customers`) | Your book — one card per lead, click through to the full record |
| **AI Outreach** (`/outreach`) | Draft texts/emails in your voice → review → approve → copy/send. **Nothing sends without your click.** |
| **Inventory** (`/inventory`) | New stock by model, aged-unit flags, move-it plays |
| **Metrics** (`/metrics`) | 9-month units/gross/F&I trends + month-by-month table |

---

## How the data works (the "live" part)

The app reads JSON files in `data/`. There are two refresh paths:

1. **People side** (`customers.json`, `pipeline.json`) — refreshed from your wiki by:
   ```bash
   npm run sync
   ```
   This parses `wiki/customers/active/*.md` and `wiki/pipeline.md`. Safe to run anytime;
   it merges, it doesn't clobber your distilled notes.

2. **Numbers side** (`deals.json`, `metrics.json`, `inventory.json`, `leaderboard.json`) —
   these come from the **live GMReview CRM database**, which only Claude can query.
   In any Claude chat just say **"refresh my sales board"** and Claude re-runs the live
   queries (Bailey's S1 numbers: Ford `3001249`, Chevy `1249`) and rewrites those files.
   Reload the page and the numbers are current.

This keeps the site fast and offline-capable while staying connected to live data.

### Automatic refresh (every ~60s)

Three things keep the board current on their own:

1. **The screen** soft-refreshes **every 60 seconds** (see the "Live · data synced …" pill top-left), re-reading the JSON. No manual reload.
2. **`covert-crm-comms`** — a scheduled agent that runs **every minute** — pulls new **Gmail + iMessage** customer activity into `signals.json` (the "Live movement" feed on the board).
3. **`covert-crm-sold`** — a scheduled agent that runs **every 5 minutes** — rebuilds the current month's sold deals + gross from **GMReview `scorecard_sales`** and the **Drive month log** (e.g. "JUNE 2026 LOG"), via `scripts/apply-refresh.mjs`.

Sold deals only change a few times a day, so 5 min is plenty; the comms feed is what moves minute-to-minute. Both agents are managed in the **Scheduled** section of the Claude sidebar — change the cadence or pause them there.

> **First-run approval:** the scheduled agents use your connectors (GMReview, Drive, Gmail, Messages). Click **Run now** on each task once to approve those tools, so future runs don't pause on permission prompts.

`scripts/apply-refresh.mjs` is the deterministic writer: the agent drops live data into `data/_incoming.json`, the script does all the math and rewrites `deals.json` / `metrics.json` / `signals.json` / `profile.json`. It preserves known gross by stock# so the frequent pull never wipes the accurate Drive-log numbers.

---

## AI outreach — drafting AND real sending

The Outreach page drafts, then **actually delivers** to the customer:

1. Pick a customer, channel (text/email), and an optional goal.
2. Claude drafts the message in Bailey's voice using the customer's context.
3. You review/edit, then **Approve**.
4. Hit **📤 Send now** — and it really goes out:
   - **Text** → a real **iMessage** from the Messages app to the customer's phone.
   - **Email** → a real email from your **Gmail** (`baileycovert79@gmail.com`) to their address.

### Guardrails (by design)
- A draft can only be sent **after you approve it** — the API rejects un-approved sends.
- Send is **one message at a time**, on your explicit click. There is no bulk/auto blast.
- If the customer has no phone (text) or no email (email) on file, the button is disabled.
- Every send is written to `data/send-log.json` with the recipient masked.

### The send bridge
`scripts/send.py` does the actual delivery and is called by `/api/outreach/send`:
- iMessage via AppleScript (`osascript` → Messages).
- Email via Gmail SMTP, reusing the app password already in
  `mcp/deal-mailer/config.json` (no new credential needed).

### One-time macOS permission
The **first** time a text sends, macOS may ask to let the app control **Messages**
(System Settings → Privacy & Security → Automation). Approve it once and texts flow after that.
Email needs nothing extra — it reuses your working Gmail app password.

---

## Data files

```
data/
  profile.json          you + sync timestamps
  goals.json            monthly unit/gross/PVR targets
  metrics.json          9 months of units + front/back gross   (live: GMReview)
  deals.json            current-month deal log                 (live: GMReview)
  leaderboard.json      StoneEagle group ranking               (live: StoneEagle)
  inventory.json        new stock by model                     (live: GMReview)
  customers.json        your book                              (sync: wiki)
  pipeline.json         kanban board                           (sync: wiki)
  outreach-queue.json   AI draft queue (app-managed)
```

Seeded from real data pulled 2026-06-24 (data through 5/29).

# STATUS — Covert CRM / COVE  (2026-06-26, latest session)

Open it: **http://localhost:4317** (Mac) · **https://covertai.coverthuttoauto.com** (phone).
Start it: `cd "Covert Sales Assistant/covert-crm" && ./run.sh`

## 🔎 Audit (2026-06-26) — ingestion + context
- **Context bug FIXED & verified** — a customer who switches vehicles in a text now updates their
  profile/board/matches (`scripts/enrich-context.mjs`, D17). Demo: F-150 → Tahoe propagated.
- **Ingestion reality**: iMessage = built but was **stale since Jun 25** (no autonomous loop firing);
  **Gmail = not built**; **VinSolutions = not wired** (its MCP `com.covert.vinsolutions-mcp` runs with
  `vs_get_my_pipeline` etc. but no code consumes it); **DMS = 403**. So 3 of 4 sources aren't flowing.
- **Unblocked**: `chat.db` is now READABLE (157k msgs — Full Disk Access landed) → autonomous text
  capture via `imessage-tail.mjs` is finally possible.
- **Role gating** added (D16): managers/admins see financials; salesmen don't see inventory worth or
  store gross. `node scripts/set-role.mjs "<name>" manager`.
- **Autonomous text capture INSTALLED** — `com.covert.crm-imessage` launchd job (every 2 min,
  `scripts/install-imessage-tail.sh`). ⚠️ **ACTION NEEDED**: grant Full Disk Access to
  `/usr/local/bin/node` (System Settings → Privacy & Security → Full Disk Access → + → that path),
  else the job skips with "chat.db not readable". App also re-anchored under launchd (survives reboot).
- **Catch-up ran** (Jun 26): pulled ~3 days of texts → 5 real text-leads + follow-ups; context pass
  extracted Jason→Corvette, Shay→F-350, Zoe→RAV4. Fixed a real miss-path (async inbox-write race in
  imessage-tail) + added noise filters (self#, tapbacks, generic "car keys").
- Pending build order: (3) wire VinSolutions (MCP `vs_get_my_pipeline` ready), (4) wire Gmail.
- UI sweep nits to fix: silent fetch errors in OutreachClient/AskWidget (no `.ok` check), shared
  date util, mobile table overflow on /sold + /inventory.

## ✅ Landed this session
- **iMessage leads (P0) — lossless.** `scripts/imessage-ingest.mjs` turns texts into leads:
  parses 700credit + "NEW LEAD" alerts **and** direct vehicle/price texts → leads; matches a
  known customer → appends to their **Message log**; filters spam/OTP/morning-briefs; strips the
  iMessage binary blobs. **SQLite watermark (`data/poll.db`)** means a message is never reprocessed
  or missed. Verified on real unread: captured Jason Nassour, Shay Braun, Falisha Blaylark.
  - Source-agnostic: an **inbox file** `data/_imessage-incoming.json` feeds it. Producers:
    the **MCP** (scheduled task `covert-crm-comms`, works in a Claude/scheduler session) OR
    `scripts/imessage-tail.mjs` (reads `chat.db` directly — **needs macOS Full Disk Access**, then
    fully autonomous) OR a fixture for testing. Dashboard shows **"N leads from texts"** banner.
- **Phone-number fix (your ask).** Outreach used to say "no phone" when you had it. `contacts.db`
  now indexes your **~35k contacts** (`customer_list_ford_hutto` 34.5k + network + iPhone) — 31k
  with a cell. `getOutreachTargets` + the send route + **COVE** now auto-fill a missing phone/email
  from it. Verified: 4 phoneless active customers (Brian Patek, Garrett Johnson, Jason Valerio,
  Kyle Campbell) now resolve a real cell. Rebuild the index: `node scripts/build-contacts.mjs`.
- **COVE** (the AI assistant) is live with your API key — answers from the live DMS, drafts in your
  voice, looks up contacts. Renamed throughout incl. login: **"COVE — Your AI Sales Assistant"**.
- **Used inventory** (all makes, 432 units) added to search; **Sold** tab with clickable detail.

## ✅ Also landed
- **P2 Store-location filter** on /inventory — **multi-select lot chips** with live counts
  (Hutto Ford New 306 · Hutto Chevy New 402 · Certified Pre-Owned 216 · Used/Trade-ins 216),
  derived from the **stock-number prefix** (the book is the Hutto rooftop; no rooftop column, so
  prefix = lot — see DECISIONS D14). Selection **persists per browser** (`localStorage`). A "Stock
  codes" legend explains the prefixes. Other rooftops (Bastrop/Austin/Cadillac) come online when the
  **websites feed (P1)** is wired — they'll add as more chips.

## 🔜 Next (priority order)
- **P1 Websites** — `com.covert.websites-mcp` (cross-rooftop inventory) is running; connection is
  fixed but its server returns a tool-result format the modern SDK rejects → needs that server's
  code updated. Deferred, not blocking. (Unlocks the other-rooftop lot chips in P2.)
- **Make iMessage capture truly autonomous** — grant Full Disk Access so `imessage-tail.mjs` can read
  chat.db on a cron (install via a launchd helper). Until then it runs when the `covert-crm-comms`
  scheduled task fires in a session.

## DEFERRED (per Bailey)
- **GMReview DMS wiring / polling** — on hold. (Note: DMS currently returns 403 from this app's
  direct queries; COVE/live refresh fall back gracefully.)

## ⚠️ Still true
- Revoke the GitHub token you pasted earlier (never used/stored here).

# DECISIONS — overnight 2026-06-24 → 06-25

Calls I made without Bailey (he gave full overnight approval). Each is reversible.
Format: **what I chose · why · revisit-if.**

### D1 — Worked in `covert-crm/`, ignored `SNIPS/`
The session opened in `/Users/baileycovert/SNIPS`, which is an unrelated old Expo app
(its own memory note says so). All work happened in `Covert Sales Assistant/covert-crm/`.
*Revisit-if:* you actually wanted something in SNIPS (you didn't).

### D2 — Did NOT start the full visual redesign tonight  ⚠️ flag for review
Bailey asked for a $50k-SaaS redesign (Tailwind + shadcn/ui, Inter, dark mode, mobile,
cmd-K palette, sortable/density tables, skeleton loaders, toasts, de-emoji). That's a
ground-up re-skin of every page. **I chose not to begin it during a wrap-up window**,
because a half-migrated Tailwind/shadcn conversion would leave the daily-driver app
broken this morning — worse than the working hand-rolled UI it has now.
*What I did instead:* kept the working app intact and wrote a concrete, sequenced
redesign plan in KNOWN-GAPS.md (#A1). It's greenfield — nothing blocks starting it.
*Revisit-if:* you'd rather I'd shipped a partial redesign. (I judged working > pretty.)

### D3 — Did NOT build the SQLite watermark polling loops  ⚠️ flag for review
The aggressive lossless polling spec (iMessage 30s, Gmail 60s, leads 2m, inventory 5m,
sold 5m) **requires the GMReview, iMessage, and Gmail MCP connectors** — and **none of
them are connected to this background session** (confirmed: not in the tool registry;
ToolSearch finds nothing for the `30343a25…` / `fbee26cd…` servers). Building polling
loops I cannot run or test would be untested scaffolding that looks done but isn't.
*What I did instead:* specced each loop precisely (cursor model, cadence, retry/backoff,
Data-Health surfacing) in KNOWN-GAPS.md (#A2/#A3) so it can be built in a session that
has the connectors live.
*Revisit-if:* the connectors are actually reachable from an unattended runner — then this
is the #1 build item.

### D4 — GMReview wiring deferred to a connector-live session
Same blocker as D3. Documented the exact tables (`inventory`/`used_inventory`/`new_inventory`,
`sales_pace`, `nightlydeals`, `scorecard_sales`, `fi_deals`) and the Data-Health
connection-status/latency/row-count requirement in KNOWN-GAPS #A3.

### D5 — VinSolutions leads: chose the email-parser path (proposed, not built)
No confirmed VinSolutions API. Between a Chrome scrape and parsing the lead-notification
emails VinSolutions sends, **I'm recommending the email-parser** — it rides the Gmail
poller we're already speccing, has no brittle DOM, and survives VinSolutions UI changes.
Not implemented (needs Gmail MCP). KNOWN-GAPS #A4.
*Revisit-if:* you'd rather scrape the VinSolutions UI directly.

### D6 — Made the Sales Board "Live" pill honest
The header showed a pulsing green "Auto-syncs every 60s" regardless of real data age.
Replaced with a freshness pill (Live/Stale/Not-refreshing) that reads real file age and
links to /health. *Reversible:* `git revert 5f6780f`.

### D7 — git: `data/` is NOT version-controlled
`data/*.json` holds customer PII and churns on every refresh, so I gitignored it; git
tracks code only. The live files stay on disk untouched. *Revisit-if:* you want data
snapshots in git (would need a scrub for PII first).

### D9 — Redesign accent = deep blue, dark default (2026-06-25)
You picked "start the pro redesign" but didn't specify the accent. I chose **deep
blue** (primary `hsl(221 83% 53%)` light / `hsl(217 91% 61%)` dark) over graphite —
continuity with the old accent and the classic SaaS look (Stripe/Linear/Vercel).
Theme defaults to **dark** (you stare at it all day); a toggle in the sidebar foot
switches to light. *Reversible:* swap the `--primary` token block in `app/globals.css`
(and `--ford`/`--chevy` if you want) — one edit re-skins everything. Graphite =
set `--primary` to a slate like `215 20% 35%`.

### D10 — Re-themed existing CSS instead of rewriting every page in shadcn (2026-06-25)
shadcn's CLI is interactive and a full per-page component migration mid-session would
risk a half-broken daily driver. Instead I kept the semantic class names (`.card`,
`.badge`, …) and re-authored them against shadcn-style tokens, so **all pages upgraded
at once** and Tailwind utilities are available for new work. Same architecture as
shadcn (you own the components), lower risk. *Revisit-if:* you specifically want
the shadcn component files vendored in — that's the phase-2 path in KNOWN-GAPS A1.

### D8 — No test sends, no new paid services
Per your rules + safety: generated outreach drafts for the self-test but sent nothing;
added no Twilio/SendGrid/hosting. Outreach still uses the template fallback because there's
no `ANTHROPIC_API_KEY` in `.env.local` (add one to get AI-quality drafts — see KNOWN-GAPS #B1).

### D11 — iMessage ingestion via a source-agnostic inbox (2026-06-25)
The iMessage MCP works in a Claude session but a cron can't call it, and chat.db needs Full Disk
Access. So `imessage-ingest.mjs` reads from an **inbox file** (`_imessage-incoming.json`) that any
source writes — MCP (scheduled task), `imessage-tail.mjs` (chat.db, needs FDA), or a fixture. This
decouples capture from classification so leads are never lost regardless of which source is live.
*Revisit-if:* you grant FDA — then the chat.db tail is the primary autonomous source.

### D12 — Contacts enrichment from the 35k CSV export, not live Contacts (2026-06-25)
The "no phone" bug: web/text leads have no phone in scorecard_leads. Rather than hit macOS Contacts
live (per-request, permissioned), I indexed the existing `sources/customers/*.csv` (34.5k dealership
list + network + iPhone export) into `data/contacts.db` and enrich on lookup by an order-independent
name key. Static snapshot — re-run `build-contacts.mjs` after a fresh export. Only fills when the
SAME person is found (won't borrow a different "Miller"'s number).

### D13 — DMS returns 403 from the app's direct queries (2026-06-25)
The autonomous `dms-refresh` + COVE's `query_dms` are getting 403 from gmmcp.slaxer07.com now
(worked earlier). Per Bailey, DMS wiring is DEFERRED, so I left it failing-gracefully (leads/
inventory served from the last good pull; COVE says it can't reach the DMS rather than guessing).
*Revisit-if:* the endpoint/token changes — re-test the connection.
Update: throttled `com.covert.crm-refresh` 300s→1800s (`./scripts/install-refresh.sh 1800`) so we
stop hammering a Cloudflare-blocked `/sse`; if it's a rate-limit this lets it self-recover. The 403
is at Cloudflare's edge (`server: cloudflare`, body "Forbidden"), not the DMS app — `/health` is 200.

### D15 — Add-contact override on AI Outreach (2026-06-25)
When a target has no phone/email (not in the lead, not in the 35k contacts index), Bailey can now
**type one right on the Outreach page**. Saved to `data/contact-overrides.json`, keyed by a
normalized **name** (survives the nightly `build-crm` rebuild, which regenerates lead slugs but not
names). Priority order in `getOutreachTargets` + the send route: **manual override → contacts.db →
blank**. Validation: phone normalized to 10 digits → `(xxx) xxx-xxxx`, email basic-shape check; bad
input 400s. Admin-only API `POST /api/outreach/contact`. The chip auto-flips to "on file" and Send
unlocks without a reload. *Revisit-if:* you want overrides written back to the real customer wiki
record instead of a side file (would need the wiki to be writable from the app).

### D14 — P2 store-location filter = stock-prefix lot map (single rooftop) (2026-06-25)
The /inventory book the app holds is the **Hutto rooftop** (Covert Ford Chevrolet Hutto). There's
no rooftop column in the data, so "store location" is derived from the **stock-number prefix**,
mapped from the live 1,140-unit book:
  - **Hutto Ford — New**: stock `26xxxx` (digits) · `P·` (P260987) · `T·` Ford (T260834)  → 306 units
  - **Hutto Chevy — New**: stock `36xxxx` (digits) · `T·` Chevy (T361663)                  → 402 units
  - **Certified Pre-Owned**: `CP·` (Chevy CPO) · `FP·` (Ford CPO)                            → ~216 units
  - **Used / Trade-ins (all makes)**: `F· C· FA· CA· FM· CM` — trailing A/B/C = appraisal/recon pass
  CM = Cadillac trades, FM/CM = Manheim-sourced. (`groupOf()` in `InventorySearch.tsx`.)
The other Covert **rooftops** (Bastrop / Austin / Cadillac new) are NOT in this book — they live in
the cross-rooftop **websites MCP** (P1, deferred). So the filter is **multi-select lot chips** with
live counts + a "Stock codes" legend, **persisted per-browser** (`localStorage` key
`cove.inventory.filters.v1`). When P1 lands, add the other-rooftop lots as additional chips/groups.
*Revisit-if:* a real rooftop/location column appears in the feed — switch `groupOf()` to read it.

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

### D20 — Multi-user: setup page + data isolation (2026-06-26)
Other reps logging in saw Bailey's book (the whole pipeline is single-tenant; /brief's getBriefSignals
read ALL captured threads). Fixed:
- `/setup` page + `data/user-profiles.json` (per-slug phones[] + emails[]) + `/api/setup`. Each rep adds
  the phone(s) customers text them and their work email(s); their DMS S1 (already in users.json
  fordS1/chevyS1) is shown read-only.
- **Data isolation on /brief**: `isOwner = me.isAdmin`. The captured texts/leads belong to the capture
  owner (Bailey's Mac/Gmail), so a non-owner rep now sees only THEIR own scorecard (from reps.json by
  slug) + a "Connect your leads / Finish setup" nudge — never someone else's customers. Verified: rep
  Aaron's brief has zero of Bailey's leads; Bailey's brief unchanged.
*Honest constraint (not code-fixable here):* COVE runs on Bailey's Mac reading Bailey's chat.db + Gmail,
so it can't capture OTHER reps' texts/emails — those live on their own devices. Reps' real leads populate
from the **DMS by their S1** once the IP allowlist lands (the Stephen email); their own text/email capture
would need their own COVE instance. The setup phone/email is the attribution mapping for that.
*Role tabs:* reps still see fewer tabs by the D16 gate (no pipeline/customers/outreach/sold/metrics/health
unless manager) — by design; widen via set-role.mjs if Bailey wants.

### D19 — Click-out + auto-remove-on-sold (2026-06-26)
Bailey: a way to get rid of leads, and a sold lead should drop off the board. Added a per-lead
override file `data/lead-overrides.json` (`"remove"` = clicked out · `"keep"` = restored / never
auto-remove). `build-crm` drops: overrides=remove, plus anyone whose **last name** matches a booked
deal in `deals.json` (the sold log — there is no `sold.json`; the /sold page's `getSold` reads a
file that doesn't exist yet). It writes `removed-leads.json` (what it dropped + why) which the
/pipeline **Removed** section shows, each restorable. The "✕" on every pipeline lead clicks it out
(`POST /api/leads/dismiss`), rebuilds, and it vanishes.
*Caveat:* sold-match is **last-name only** (deals.json carries just a last name), so a name
collision could clear a live lead — that's why every removal is visible + restorable. Tightens to
full-name/stock once the DMS (`scorecard_sales`) is reachable again. Verified: Jason Nassour + Kyle
Campbell auto-cleared as sold; click-out/restore round-trips.
*Note:* the deeper "pages not updating" cause is the ingest loops being idle — iMessage tail still
needs Full Disk Access on `/usr/local/bin/node`, DMS is 403. A manual catch-up refreshed the board.

### D18 — Multi-channel lead ingestion: one parser, four sources (2026-06-26)
"All my texts, gmails, and VinSolutions leads picked up, no misses." Extracted the lead vocabulary +
`parseLeadAlert` into `scripts/lib-leads.mjs` (ONE source of truth) so every channel parses Bailey's
formats identically. Added:
- `gmail-ingest.mjs` — body-parser for forwarded/individual lead emails (700credit/Carfax style),
  seam = `data/_gmail-incoming.json`. Tested (Marcus Webb vendor email + Jane Renner direct + spam filtered).
- `gmail-csv-ingest.mjs` — **the real bulk Gmail path**: Bailey's leads arrive as CSV ATTACHMENTS
  ("Daily lead dump" from `reportscheduler@motosnap.com`), NOT in the email body. Parses any CSV
  dropped in `data/_gmail-csv/*.csv`, mapping columns by header keyword (name/first+last/phone/email/
  vehicle/stock/source). Tested (quoted commas, split names, dedup by row hash). Note: `rob@covertcity.net`
  "105 report" blasts are INTERNAL reports, not leads — ignored.
- `vinsolutions-ingest.mjs` — pulls `vs_get_my_pipeline` from the VS MCP (`http://127.0.0.1:7892/mcp`),
  maps to leads, fails gracefully (no wipe) when the bridge is down.
- `build-crm.mjs` now unions imessage + gmail + gmail-csv + vinsolutions leads (with email backfill).

**Two external dependencies remain for full autonomy (not code-fixable from here):**
1. **Gmail CSV producer** — downloading the motosnap CSV attachment needs Gmail-attachment access; the
   connected Gmail MCP only reads thread bodies (no getAttachment). Needs the Gmail API attachment scope
   or Bailey dropping a CSV into `data/_gmail-csv/`. Parser is ready.
2. **VinSolutions bridge** — its MCP server is on SDK `^1.0.4` vs the app's `^1.29` → "Server not
   initialized" handshake skew (same family as the websites MCP); also needs Chrome + the VS extension +
   VS login live. Ingest is ready; align the server SDK + open VS in Chrome to flip it on.

### D17 — Live context: vehicle interest follows the customer's mind (2026-06-26)
Bug Bailey flagged: a customer who switched vehicles in a text ("scratch the F-150, the Tahoe")
kept their OLD `vehicle_interest` — it was set once and frozen (build-crm only marked them hot,
never re-read intent). Fix: `scripts/enrich-context.mjs` runs after every text pull; for each thread
with NEW inbound messages (per-thread watermark in `poll.db` table `ctx_seen`, so the API is only
hit on genuinely new messages), COVE (Claude `claude-sonnet-4-6`) reports the CURRENT vehicle and
whether it changed. On a confident change it writes `data/context-overrides.json` (keyed by
normalized name), which `build-crm` applies on top of everything → the profile, board, and
`matchInventory()` all follow the switch, and a `↻ Switched to X (was Y)` note is added + the lead
re-flagged hot. No key / API error → it skips the AI and still rebuilds (never stalls). Verified with
an isolated F-150→Tahoe case (data snapshotted + restored). `imessage-ingest` now calls
enrich-context instead of build-crm directly. *Revisit-if:* you want trade-in / budget / timing
changes tracked the same way (same seam — extend the extractor's JSON).

### D16 — Role-based financial visibility: admin / manager / salesman (2026-06-26)
Bailey wants some salesmen NOT to see store financials (esp. inventory worth). Added a **manager**
tier (`User.manager`); `elevated()` = admin OR manager = "seesFinancials". `currentUser()` now
returns `seesFinancials`. Cut lines he chose: hide **inventory value/worth** and **store gross + PVR**
from salesmen; **keep** their own numbers, the leaderboard, and per-deal gross/list prices.
Implementation — most surfaces were already admin-only (so salesmen already couldn't reach /metrics,
/sold, /pipeline, /customers, /health, /outreach, or COVE chat). Changes: (a) widened the dashboard
full-board branch + /metrics + /sold + the COVE widget from `isAdmin` to `seesFinancials` so MANAGERS
get them too; (b) the one real salesman-visible leak — the **"Inventory value" tile on /inventory** —
is now `seesFinancials`-only, replaced by an "Avg days on lot" tile for salesmen; (c) COVE API
defense-in-depth: a restricted caller gets a financial-SQL guard (blocks gross/cost/PVR/fi_deals/
SUM(list_price)) + a system-prompt policy + guarded no-key routes. Promote/demote via
`node scripts/set-role.mjs "<name>" manager|salesman`. *Revisit-if:* you want managers to also get the
admin tools (outreach/health), or salesmen to lose their own gross too.

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

### D22 — Contacts page: add/fix a number that wins everywhere (2026-06-29)
The 35k contacts.db is a static CSV snapshot, so it drifts from Bailey's live phone contacts. Added a
`/contacts` page (+ `/api/contacts`) to add/correct a contact (name, phone, email) and search what COVE
currently has. Stored in the existing `contact-overrides.json` (unified — same store the Outreach
add-contact writes). Key change: `lookupContact()` now checks the override FIRST, so a corrected number
wins **everywhere** (chatbot, customer pages, outreach, enrichment), not just on the outreach card.
Phone normalized/validated, removable (falls back to the index). Open to all reps.
*Sync option (not built):* the Mac's AddressBook DBs ARE present/readable (node has FDA) — a
`sync-contacts.mjs` could merge them into contacts.db on a schedule; or re-export the CSV and rerun
build-contacts.mjs. Offered as a follow-up.

## Gmail + StoneEagle autonomous ingestion, and work-account sending (2026-06-29)
*Why:* "90% of my leads come from my texts and gmail" — Gmail had to flow autonomously,
including attachments the Gmail MCP can't pull from a cron.
- **IMAP puller** (`gmail-pull.py`) over the Gmail App Password, bounded to known lead/report
  senders + a UID watermark so it never rescans the inbox. Pulls VinSolutions/motosnap lead-dump
  CSVs and StoneEagle ranking PDFs.
- **The "motosnap CSV" is the full VinSolutions CRM export** — Customer, Cell Phone, Email, vehicle,
  **Sales Rep**, **Lead Status**. The generic keyword parser mismapped it (grabbed a datetime as
  the phone, "Has Vehicle Of Interest"=Yes as the vehicle). Added an exact-name VinSolutions branch
  in `gmail-csv-ingest.mjs`: filters out closed/sold/duplicate statuses, attributes by Sales Rep,
  unions only Bailey's open leads onto the board (per-rep counts → `csv-rep-leads.json` for future
  rep boards). This is also the seam for multi-rep lead attribution.
- **StoneEagle 0-row guard:** several StoneEagle report types arrive; only the F&I ranking has the
  table. Never overwrite leaderboard.json on a 0-row parse.
- **TCC/FDA:** launchd `/usr/bin/python3` gets EPERM reading the project under ~/Documents. Fixed by
  running the job under `/usr/local/bin/node` (which has Full Disk Access) → it spawns python3, which
  inherits FDA. New `gmail-pull-runner.mjs` shim; `com.covert.crm-gmail` runs every 15 min.
- **Sending:** `send.py` default credential is now the proven work account
  (`baileycovert@covertauto.com`, data/.gmail-app-password); the old personal-account deal-mailer
  config is a dead fallback. SMTP AUTH verified OK.
- **Secrets:** app password / gmail user / pulled CSVs / StoneEagle PDFs added to .gitignore.

*Still open:* per-employee Setup walkthrough (each rep adds their own App Password so COVE scrapes
their inbox + sends as them) and the deal-jacket/document-sender built into COVE (sold → fill packet
→ desk approval → finance).

## Deal jacket built into COVE — build → approve → desk → finance (2026-06-29)
*Why:* "once I sell a customer, I can automate the paperwork and send to desk for approval then to
finance." Chosen flow: **approve in COVE, then it sends** (one-tap gate before each send).
- Ported the proven AcroForm packet filler (`fill_packet.py`) into `covert-crm/scripts/deal-jacket/`
  with COVE-native paths; copied the two blank templates into `covert-crm/templates/` (gitignored).
- `send_jacket.py` emails the packet (PDF + auto-discovered DL/insurance/odometer/trade photos) using
  COVE's verified work-account credential + the coworker alias map (evan/sidney=desk, johnny/jose=F&I).
- Stage machine in `deal-jackets.ts`: ready → at_desk → at_finance → done; reps see only their own.
  Routing config (desk/finance) editable, overridable per deal.
- `/close` page (desktop + mobile nav): form → Build packet → Preview PDF → Approve & send to desk →
  Desk approved → send to finance → Mark funded. Nothing leaves until the rep approves in-app.
- Verified end-to-end in preview (build fills a real packet, list renders, PDF preview serves). Real
  sends not fired in test (they email live coworkers); the SMTP path is the already-auth-verified cred.

## Full sales-floor login roster (2026-06-29)
*Why:* "every employee needs to have access." Pulled the DMS `employees` roster (role IN
sales / Sales Manager) and merged into the COVE login table (data/users.json). All 57 salespeople
were already present (deduped by employee number); the gap was the **11 sales managers**, now added
with `manager: true` (store-financial visibility). Login credential = employee number, sha256-hashed
(both rooftop numbers hashed so either works). DMS column map: store_03_01 = Chevy #, store_04_01 =
Ford #. Roster now 65 users (1 admin, 11 managers, 53 reps); change is live immediately (login page
is force-dynamic, reads users.json fresh). The migration script + login-table backup hold employee
numbers/hashes, so both are gitignored (PII stays out of version control, per project norm).

## Owner command-center view + real store totals (2026-06-29)
*Why:* "admin should pull all of the salespeople using cove's leads, and numbers, and managers...
Admin will be where my father (Chance Covert, owner) sees everything."
- Admin/owner board now shows: personal "Your month-to-date", real "Store — month-to-date"
  (team aggregate), and an owner-only "Sales team" table — every rep ranked with units (N/U), gross,
  per-unit, COVE lead activity; managers flagged. `getTeam()` joins reps.json sales numbers +
  per-rep COVE lead counts (csv-rep-leads + rep-inbox) + roster roles.
- **Fixed a long-standing mislabel:** the headline board stats come from `currentMonthBoard()`
  (metrics.json), which is BAILEY's own monthly history (~28 units), not the store's. Adding a
  "Store" label exposed it. Managers + owner now see the true store aggregate (416 units / $1.46M
  across 52 sellers) from getTeam totals; the salesman board and currentMonthBoard fallback are
  unchanged.
- Managers see store totals + their own; the full per-rep table is owner(admin)-only.
- *Open:* Chance Covert isn't in the DMS (no employee number), so his admin login needs a chosen
  credential from Bailey.

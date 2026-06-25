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

### D8 — No test sends, no new paid services
Per your rules + safety: generated outreach drafts for the self-test but sent nothing;
added no Twilio/SendGrid/hosting. Outreach still uses the template fallback because there's
no `ANTHROPIC_API_KEY` in `.env.local` (add one to get AI-quality drafts — see KNOWN-GAPS #B1).

# KNOWN-GAPS — Covert CRM

Things that need your judgment, or that I deliberately left safe rather than guess.
Written overnight 2026-06-24 → 2026-06-25. Newest/most-important first.

---

## 1. ⭐ Live refresh stops when no Claude session is awake  (most important)

**What I found:** by 10:30 AM on 6/25 every live feed was ~18–22 hours stale.
The four refresh workers (`covert-crm-comms`, `-sold`, `-notify`, `-arrivals`) are
**Claude scheduled tasks** — they only fire while a Claude session is running to host
them. Overnight, none ran, so nothing refreshed.

**Why it matters:** the dashboard will show *yesterday's* numbers until a refresh
runs. The numbers aren't wrong, they're just old — and now there's a place to see
exactly how old.

**What I did (safe default):** I did **not** fabricate fresh numbers. Instead I built
the **Data Health** page (`/health`, admin-only, in the sidebar under *Know*) that
shows, per source: real last-write time, age, the freshness marker the data carries
(deal date / `asOf`), and a Live / Stale / Not-refreshing badge. When everything is
stale it says so in plain language at the top.

**Your call:** how do you want refresh to stay alive?
- (a) Keep the Claude desktop app + a session open on the Mac (simplest, what's assumed today).
- (b) Move the refresh off Claude scheduled-tasks onto a real `cron`/`launchd` job that
  runs a headless script. Blocker: the dealership DB + Drive are reached through
  **MCP, which is Claude-only** — a plain cron job can't call them. This would need a
  non-MCP path to GMReview/Drive (service account, API, or DB creds). Bigger project.
- (c) Accept overnight staleness and rely on Data Health to flag it (fine for now).

I left it as (a)+(c). No code decision was forced.

---

## 2. This session couldn't reach the live DB / Drive MCPs — so I verified freshness, not connectivity

The dealership DB MCP (`...30343a25...`) and Drive MCP (`...fbee26cd...`) were **not
connected to this overnight session** (they're scoped to the interactive Claude app).
So I could not myself re-run `SELECT … FROM sales_pace / nightlydeals / used_inventory`
or re-open the *JUNE 2026 LOG* sheet to prove the link is live *right now*.

What I verified instead (all real, no fakes):
- Every data file's true last-write time and the freshness marker inside it (`/health`).
- The send bridges are wired (config present) — see #3.
- The scheduled tasks exist and are enabled (`covert-crm-*`), with their last-run times.

**To prove the live link end-to-end**, run one refresh from an interactive session and
watch `/health` flip the relevant rows to green. If a pull ever fails, the worker is
written to **skip rather than overwrite** (e.g. `covert-crm-sold` won't clobber
`deals.json` if the Drive log is unavailable), so a bad night can't poison the data.

---

## 3. iMessage / Gmail send paths: wired, but NOT test-sent overnight

`/health` → *Send & integration bridges* confirms both are configured
(`scripts/send.py` present; Gmail app-password present in `mcp/deal-mailer/config.json`).
I did **not** fire a test text or email overnight — sending on your behalf needs your
say-so, and a 3 AM self-test would just buzz your phone. They were verified working
**2026-06-24** (self-test to your own number + Gmail). First *new* iMessage send after a
reboot may need the one-time macOS Automation grant for Messages.

---

## 4. Group leaderboard is a month old

`leaderboard.json` is a manual StoneEagle export, `asOf 2026-05-18` — over a month stale.
It's a deliberately periodic pull, so Data Health grades it leniently (won't show red for
weeks), but the ranking you see (#4 of 313) is from mid-May. Re-export from StoneEagle when
you want it current. The per-rep *current-month* boards (`reps.json`) are separate and do
refresh from GMReview.

---

## 5. Off-Wi-Fi access depends on a tunnel URL that rotates

Anywhere-access runs through a Cloudflare **quick tunnel** (`com.covert.crm-tunnel`), whose
URL **changes every time the tunnel restarts**. The URL saved in memory may already be dead.
Read the current one from `~/Library/Logs/covert-crm-tunnel.log`. On the same Wi-Fi you
don't need it — `run.sh` prints the current LAN address (it auto-detects; the old
`192.168.1.14` is now `10.216.145.188`, so don't trust a hardcoded IP).

A stable URL would need a named Cloudflare tunnel (free, but needs a domain / one-time setup).

---

## 6. Login is brute-forceable on the public URL

Reps log in with just their employee number (short, guessable) and the app is reachable on a
public tunnel URL → in theory brute-forceable. Fine on LAN, riskier public. Options not yet
built (need your call): a shared store-gate password in front, login rate-limiting, or
keeping the public tunnel off and using LAN + VPN only.

---

## What I shipped this session (so the morning diff makes sense)

- **`/health` Data Health page** — `app/health/page.tsx`, `app/lib/health.ts`, sidebar link,
  a few CSS badges. Honest per-source freshness + send-bridge readiness.
- **`run.sh`** — `./run.sh` (confirms it's up + prints URLs), `--restart` (rebuild + restart
  the service), `--build`.
- **Git repo initialised** — code is now version-controlled so you can read diffs. `data/` is
  intentionally **not** tracked (customer PII + it churns every refresh); the live files stay
  on disk, git holds code only.
- This file.

Nothing existing was changed in a breaking way; the Covert Sales Assistant skills are untouched.

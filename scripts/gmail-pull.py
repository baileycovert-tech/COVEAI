#!/usr/bin/env python3
"""
gmail-pull.py — autonomous Gmail ingestion over IMAP (reads bodies AND attachments).

This is the producer the Gmail seam was missing. IMAP + an app password can do what the
Gmail MCP can't from a cron: download CSV/PDF attachments. One job covers all of it:

  • Vendor lead emails (700credit / Carfax / AutoTrader / CarGurus / Capital One) → body parsed
    into data/_gmail-incoming.json  → consumed by gmail-ingest.mjs
  • motosnap "Daily lead dump" CSV attachments → saved to data/_gmail-csv/  → gmail-csv-ingest.mjs
  • StoneEagle daily ranking PDF (reports@stoneeagle.com) → saved to sources/stoneeagle/<date>.pdf,
    parsed, and written to data/leaderboard.json (the /health StoneEagle source)

Credential: a Gmail App Password. Looked up from (first found):
  data/.gmail-app-password  (just the 16 chars)  |  ../mcp/deal-mailer/config.json
Watermark: highest IMAP UID seen, in data/poll.db-style file data/_gmail-uid.txt — never reprocesses.
"""
from __future__ import annotations
import imaplib, email, json, re, subprocess, sys
from email.header import decode_header
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DROP = DATA / "_gmail-csv"
SE_DIR = ROOT / "sources" / "stoneeagle"
UID_FILE = DATA / "_gmail-uid.txt"
IMAP_HOST = "imap.gmail.com"
FIRST_RUN_DAYS = 10  # bound the very first catch-up so it doesn't scan the whole inbox

LEAD_SENDERS = re.compile(r"(700credit|carfax|autotrader|cargurus|truecar|capitalone|dealer\.com|vinsolutions|vinmanager)", re.I)
NOISE_SENDERS = re.compile(r"@(stoneeagle|covertcity|barcoment|mx\.forduniversity|dealer\.gmfinancial)\.|^(reportscheduler|marketing\.emails|newsletter)@", re.I)


def log(*a): print(datetime.now().isoformat(), "gmail-pull:", *a)


def app_password() -> tuple[str, str]:
    pwfile = DATA / ".gmail-app-password"
    cfg = ROOT.parent / "mcp" / "deal-mailer" / "config.json"
    if pwfile.exists():
        # optional companion file data/.gmail-user, else default
        user = (DATA / ".gmail-user").read_text().strip() if (DATA / ".gmail-user").exists() else "baileycovert79@gmail.com"
        return user, pwfile.read_text().strip().replace(" ", "")
    if cfg.exists():
        c = json.loads(cfg.read_text())
        return c["gmail_user"], c["app_password"].replace(" ", "")
    raise SystemExit("No Gmail app password (data/.gmail-app-password or deal-mailer/config.json).")


def hdr(msg, name) -> str:
    raw = msg.get(name, "")
    out = []
    for part, enc in decode_header(raw):
        out.append(part.decode(enc or "utf-8", "ignore") if isinstance(part, bytes) else part)
    return "".join(out)


def body_text(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition", "")):
                try: return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore")
                except Exception: pass
        return ""
    try: return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "ignore")
    except Exception: return ""


def parse_stoneeagle(pdf_path: Path):
    """Parse the F&I-manager ranking → data/leaderboard.json (mirrors the manual parser)."""
    try:
        from pypdf import PdfReader
    except ImportError:
        log("pypdf not installed — saved PDF but skipped parse"); return
    t = PdfReader(str(pdf_path)).pages[0].extract_text(extraction_mode="layout") or ""
    money = lambda s: float(s.replace("$", "").replace(",", "")) if re.match(r"^-?\$[\d,.]+$", s.strip()) else None
    skip = re.compile(r"\b(house|tech|unknown|employee|sales|covert|managers)\b", re.I)
    rows = []
    for line in t.split("\n"):
        c = re.split(r"\s{2,}", line.strip())
        if len(c) < 11 or not (c[1].isdigit() and c[2].isdigit() and c[3].isdigit()): continue
        fipvr, tg = money(c[5]), money(c[10])
        if fipvr is None or tg is None or skip.search(c[0]) or len(c[0]) < 4: continue
        nm = " ".join(w.capitalize() if w.isupper() else w for w in c[0].split())
        rows.append({"name": nm, "units": int(c[3]), "fiPvr": round(fipvr, 2), "gross": round(tg, 2)})
    if not rows:
        # Not the F&I ranking layout (StoneEagle sends several report types). Never overwrite a
        # good leaderboard with an empty parse — just skip.
        log(f"StoneEagle PDF {pdf_path.name} parsed 0 ranking rows — skipped (not the ranking report)")
        return
    rows.sort(key=lambda x: -x["gross"])
    asof = re.search(r"(\d{8})", pdf_path.stem)
    asof = f"{asof.group(1)[:4]}-{asof.group(1)[4:6]}-{asof.group(1)[6:8]}" if asof else datetime.now().strftime("%Y-%m-%d")
    out = {"source": "StoneEagle COVERT AutoGroup ranking", "asOf": asof,
           "scope": "COVERT Group · F&I managers by total gross",
           "rows": [{"rank": i + 1, "name": x["name"], "gross": x["gross"], "units": x["units"], "fiPvr": x["fiPvr"], "isMe": False} for i, x in enumerate(rows)]}
    (DATA / "leaderboard.json").write_text(json.dumps(out, indent=2) + "\n")
    log(f"StoneEagle → leaderboard.json ({len(rows)} managers, asOf {asof})")


def accounts():
    """Every inbox COVE should scrape: Bailey (primary — CSV + StoneEagle + body leads) plus each
    rep who linked their Gmail in Setup (data/user-sending.json → body leads attributed to them)."""
    user, pw = app_password()
    accts = [{"slug": "bailey", "user": user, "pw": pw, "primary": True}]
    sj = DATA / "user-sending.json"
    if sj.exists():
        try:
            for slug, c in json.loads(sj.read_text()).items():
                u = (c.get("gmailUser") or "").strip()
                p = (c.get("appPassword") or "").replace(" ", "")
                if u and p and u.lower() != user.lower():
                    accts.append({"slug": slug, "user": u, "pw": p, "primary": False})
        except Exception as e:
            log("user-sending.json unreadable:", e)
    return accts


def scrape_account(acct):
    """Pull new lead/report mail for one account. Returns (inbox_leads, n_csv, n_se). Primary also
    routes CSV attachments + the StoneEagle PDF; reps only contribute body leads (tagged with rep)."""
    from datetime import timedelta
    slug, primary = acct["slug"], acct["primary"]
    uid_file = UID_FILE if primary else (DATA / f"_gmail-uid__{slug}.txt")
    last_uid = int(uid_file.read_text().strip()) if uid_file.exists() else 0
    try:
        M = imaplib.IMAP4_SSL(IMAP_HOST); M.login(acct["user"], acct["pw"])
    except imaplib.IMAP4.error as e:
        log(f"[{slug}] IMAP login failed ({e}) — skipping this inbox"); return [], 0, 0
    M.select("INBOX")

    # Only the senders that carry leads/reports — never scan the whole inbox. First run per account
    # is bounded to recent (SINCE); after that the per-account UID watermark keeps it to new mail.
    SENDERS = ["motosnap", "stoneeagle", "700credit", "vinsolutions", "autotrader", "cargurus", "carfax", "truecar", "capitalone"]
    since = (datetime.now() - timedelta(days=FIRST_RUN_DAYS)).strftime("%d-%b-%Y")
    uidset = set()
    for s in SENDERS:
        crit = ["FROM", s] + ([] if last_uid else ["SINCE", since])
        typ, data = M.uid("search", None, *crit)
        for u in (data[0].split() if data and data[0] else []):
            if int(u) > last_uid: uidset.add(int(u))
    uids = [str(u).encode() for u in sorted(uidset)]
    log(f"[{slug}] {acct['user']} login OK · {len(uids)} messages (since UID {last_uid})")

    inbox_leads, n_csv, n_se, max_uid = [], 0, 0, last_uid
    for uid in uids:
        max_uid = max(max_uid, int(uid))
        typ, md = M.uid("fetch", uid, "(RFC822)")
        if not md or not md[0]: continue
        msg = email.message_from_bytes(md[0][1])
        frm, subj = hdr(msg, "From"), hdr(msg, "Subject")
        date = (msg.get("Date") or "")

        # attachments (primary inbox only): CSV lead dumps + StoneEagle PDF
        if primary:
            for part in (msg.walk() if msg.is_multipart() else []):
                fn = part.get_filename()
                if not fn: continue
                fn = "".join(p.decode(e or "utf-8", "ignore") if isinstance(p, bytes) else p for p, e in decode_header(fn))
                payload = part.get_payload(decode=True)
                if not payload: continue
                if fn.lower().endswith(".csv"):
                    (DROP / fn).write_bytes(payload); n_csv += 1; log(f"  CSV: {fn}")
                elif fn.lower().endswith(".pdf") and re.search(r"stoneeagle|ranking", frm + subj, re.I):
                    out = SE_DIR / (datetime.now().strftime("%Y-%m-%d") + ".pdf")
                    out.write_bytes(payload); n_se += 1; parse_stoneeagle(out)

        # body lead emails (skip noise/internal) — attributed to whichever rep's inbox they came from
        if LEAD_SENDERS.search(frm) and not NOISE_SENDERS.search(frm):
            inbox_leads.append({"message_id": msg.get("Message-ID", uid.decode()), "from": frm,
                                "subject": subj, "body": body_text(msg), "date": date, "rep": slug})

    M.logout()
    uid_file.write_text(str(max_uid))
    return inbox_leads, n_csv, n_se


def main():
    DROP.mkdir(parents=True, exist_ok=True); SE_DIR.mkdir(parents=True, exist_ok=True)
    accts = accounts()
    if len(accts) > 1:
        log(f"scraping {len(accts)} inboxes: " + ", ".join(a["slug"] for a in accts))

    primary_leads, n_csv, n_se = [], 0, 0
    rep_counts = {}
    for acct in accts:
        leads, c, s = scrape_account(acct)
        if acct["primary"]:
            primary_leads, n_csv, n_se = leads, c, s
        elif leads:
            # Keep reps' personal-inbox leads attributed + separate from Bailey's board until
            # per-rep lead pipelines consume them. (Most team lead data already arrives, rep-tagged,
            # via the VinSolutions export in Bailey's inbox.)
            (DATA / "rep-inbox").mkdir(exist_ok=True)
            f = DATA / "rep-inbox" / f"{acct['slug']}.json"
            existing = json.loads(f.read_text()) if f.exists() else []
            seen_ids = {x.get("message_id") for x in existing}
            fresh = [l for l in leads if l["message_id"] not in seen_ids]
            f.write_text(json.dumps(existing + fresh, indent=2) + "\n")
            rep_counts[acct["slug"]] = len(fresh)

    if primary_leads:
        (DATA / "_gmail-incoming.json").write_text(json.dumps(primary_leads, indent=2) + "\n")

    # hand off to the existing node ingests (Bailey's board)
    node = "/usr/local/bin/node"
    if primary_leads:
        subprocess.run([node, str(ROOT / "scripts" / "gmail-ingest.mjs")], check=False)
    if n_csv:
        subprocess.run([node, str(ROOT / "scripts" / "gmail-csv-ingest.mjs")], check=False)
    extra = (" · reps " + ", ".join(f"{k}:{v}" for k, v in rep_counts.items())) if rep_counts else ""
    log(f"done · {len(primary_leads)} body-leads, {n_csv} CSVs, {n_se} StoneEagle{extra}")


if __name__ == "__main__":
    main()

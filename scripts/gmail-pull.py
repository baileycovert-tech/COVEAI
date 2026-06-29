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
    rows.sort(key=lambda x: -x["gross"])
    asof = re.search(r"(\d{8})", pdf_path.stem)
    asof = f"{asof.group(1)[:4]}-{asof.group(1)[4:6]}-{asof.group(1)[6:8]}" if asof else datetime.now().strftime("%Y-%m-%d")
    out = {"source": "StoneEagle COVERT AutoGroup ranking", "asOf": asof,
           "scope": "COVERT Group · F&I managers by total gross",
           "rows": [{"rank": i + 1, "name": x["name"], "gross": x["gross"], "units": x["units"], "fiPvr": x["fiPvr"], "isMe": False} for i, x in enumerate(rows)]}
    (DATA / "leaderboard.json").write_text(json.dumps(out, indent=2) + "\n")
    log(f"StoneEagle → leaderboard.json ({len(rows)} managers, asOf {asof})")


def main():
    user, pw = app_password()
    DROP.mkdir(parents=True, exist_ok=True); SE_DIR.mkdir(parents=True, exist_ok=True)
    last_uid = int(UID_FILE.read_text().strip()) if UID_FILE.exists() else 0

    try:
        M = imaplib.IMAP4_SSL(IMAP_HOST)
        M.login(user, pw)
    except imaplib.IMAP4.error as e:
        raise SystemExit(f"IMAP login failed ({e}). Regenerate the Gmail App Password and update data/.gmail-app-password.")
    M.select("INBOX")

    # everything newer than the watermark UID
    typ, data = M.uid("search", None, f"UID {last_uid + 1}:*")
    uids = [u for u in (data[0].split() if data and data[0] else []) if int(u) > last_uid]
    log(f"login OK · {len(uids)} new messages since UID {last_uid}")

    inbox_leads, n_csv, n_se, max_uid = [], 0, 0, last_uid
    for uid in uids:
        max_uid = max(max_uid, int(uid))
        typ, md = M.uid("fetch", uid, "(RFC822)")
        if not md or not md[0]: continue
        msg = email.message_from_bytes(md[0][1])
        frm, subj = hdr(msg, "From"), hdr(msg, "Subject")
        date = (msg.get("Date") or "")

        # attachments: CSV (leads) + StoneEagle PDF
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

        # body lead emails (skip noise/internal)
        if LEAD_SENDERS.search(frm) and not NOISE_SENDERS.search(frm):
            inbox_leads.append({"message_id": msg.get("Message-ID", uid.decode()), "from": frm, "subject": subj, "body": body_text(msg), "date": date})

    M.logout()
    if inbox_leads:
        (DATA / "_gmail-incoming.json").write_text(json.dumps(inbox_leads, indent=2) + "\n")
    UID_FILE.write_text(str(max_uid))

    # hand off to the existing node ingests
    node = "/usr/local/bin/node"
    if inbox_leads:
        subprocess.run([node, str(ROOT / "scripts" / "gmail-ingest.mjs")], check=False)
    if n_csv:
        subprocess.run([node, str(ROOT / "scripts" / "gmail-csv-ingest.mjs")], check=False)
    log(f"done · {len(inbox_leads)} body-leads, {n_csv} CSVs, {n_se} StoneEagle")


if __name__ == "__main__":
    main()

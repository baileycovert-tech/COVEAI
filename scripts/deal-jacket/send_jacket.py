#!/usr/bin/env python3
"""
send_jacket.py — email a deal packet (PDF + optional photos) to the desk or finance, from COVE.

Self-contained: uses the SAME proven work-account credential the rest of COVE sends with
(data/.gmail-app-password + data/.gmail-user) — not the dead personal-account deal-mailer config.
Resolves coworker aliases (johnny → johnnytownsend@covertauto.com, etc.) so the UI can route by
role. Always SMTP-sends (the rep already approved the send inside COVE).

Input: one JSON object on stdin:
  {
    "to":      ["evan"],                  # desk or finance — aliases or emails
    "cc":      ["bailey"],                # optional
    "subject": "Deal packet — Buyer — FP7681",
    "body":    "…",
    "pdf":     "/abs/path/filled.pdf",    # optional
    "photos":  ["/abs/dl.jpg", …],        # optional explicit photos
    "photos_dir": "/abs/folder"           # optional — auto-discovers DL/INS/ODO/TRADE/VIN images
  }
Output: one JSON line — {"ok": true, "to": ["evan@…"], "attachments": 3} or {"ok": false, "error": "…"}.
"""
from __future__ import annotations
import sys, json, ssl, smtplib, mimetypes
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent          # covert-crm/
DATA = ROOT / "data"
SMTP_HOST, SMTP_PORT = "smtp.gmail.com", 465

# Coworker aliases → real addresses (mirrors the desktop deal-jacket map so routing is consistent).
COWORKER_EMAILS = {
    "johnny":  "johnnytownsend@covertauto.com",   # F&I primary
    "jose":    "josecantoran@covertauto.com",     # F&I
    "evan":    "evanramsey@covertauto.com",       # Sales mgr / desking
    "sidney":  "sidneyclark@covertauto.com",      # Desking
    "mark":    "marcusreiland@covertauto.com",    # Sales mgr
    "ricardo": "ricardocasas@covertauto.com",     # Sales mgr
    "lorenzo": "lorenzobeltran@covertauto.com",   # F&I / used appraisal
    "rob":     "rob@covertcity.net",              # Office mgr
    "stephen": "stephenhamilton@covertauto.com",  # GSM
    "bailey":  "baileycovert@covertauto.com",     # me (for cc)
}

PHOTO_PREFIXES = ("dl", "license", "insurance", "ins", "odometer", "odo", "trade", "vin", "vin_plate")


def out(d): print(json.dumps(d)); sys.exit(0 if d.get("ok") else 1)


def creds() -> tuple[str, str]:
    pw = (DATA / ".gmail-app-password")
    user = (DATA / ".gmail-user")
    if not pw.exists():
        out({"ok": False, "error": "No sending credential on this Mac (data/.gmail-app-password)."})
    return (user.read_text().strip() if user.exists() else "baileycovert@covertauto.com",
            pw.read_text().strip().replace(" ", ""))


def resolve(x: str) -> str:
    k = (x or "").lower().strip()
    return x if "@" in k else COWORKER_EMAILS.get(k, x)


def discover_photos(folder: Path) -> list[Path]:
    if not folder or not folder.exists():
        return []
    return sorted(p for p in folder.iterdir()
                  if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".heic", ".pdf"}
                  and p.name.lower().startswith(PHOTO_PREFIXES))


def attach(msg: EmailMessage, path: Path):
    ctype, _ = mimetypes.guess_type(str(path))
    maintype, subtype = (ctype.split("/", 1) if ctype else ("application", "octet-stream"))
    msg.add_attachment(path.read_bytes(), maintype=maintype, subtype=subtype, filename=path.name)


def main():
    try:
        job = json.loads(sys.stdin.read())
    except Exception as e:
        out({"ok": False, "error": f"Bad input: {e}"})

    to = [resolve(t) for t in (job.get("to") or []) if t]
    cc = [resolve(t) for t in (job.get("cc") or []) if t]
    if not to:
        out({"ok": False, "error": "No recipient — pick a desk/finance contact."})

    user, pw = creds()
    msg = EmailMessage()
    msg["From"] = f"Bailey Covert <{user}>"
    msg["To"] = ", ".join(to)
    if cc: msg["Cc"] = ", ".join(cc)
    msg["Subject"] = job.get("subject") or "Deal packet"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="covertauto.com")
    msg.set_content(job.get("body") or "Deal packet attached.\n\n— Bailey")

    n_att = 0
    pdf = job.get("pdf")
    if pdf and Path(pdf).exists():
        attach(msg, Path(pdf)); n_att += 1
    for p in (job.get("photos") or []):
        if Path(p).exists(): attach(msg, Path(p)); n_att += 1
    if job.get("photos_dir"):
        for p in discover_photos(Path(job["photos_dir"])):
            attach(msg, p); n_att += 1

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=30) as s:
            s.login(user, pw)
            s.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        out({"ok": False, "error": "Gmail rejected the app password. Re-link your email in Setup."})
    except Exception as e:
        out({"ok": False, "error": f"Send failed: {e}"})
    out({"ok": True, "to": to, "cc": cc, "attachments": n_att})


if __name__ == "__main__":
    main()

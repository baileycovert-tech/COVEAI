#!/usr/bin/env python3
"""
Covert CRM send bridge — actually delivers an outreach message to a customer.

Two channels, both reusing infrastructure that already works on this Mac:
  - imessage : sends a real iMessage via the Messages app (AppleScript)
  - email    : sends a real email via Gmail SMTP, reusing the app password
               already stored in mcp/deal-mailer/config.json

Usage (called by the Next.js /api/outreach/send route — not meant to be run by hand):
  python3 send.py imessage "+15125551234" "message body"
  python3 send.py email "person@example.com" "Subject line" "body text"

Always prints a single JSON line to stdout: {"ok": true} or {"ok": false, "error": "..."}.
Exit code 0 on success, 1 on failure.
"""
import json
import re
import smtplib
import ssl
import subprocess
import sys
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

# deal-mailer already proved this credential works for Bailey's Gmail.
CONFIG = Path(__file__).resolve().parent.parent.parent / "mcp" / "deal-mailer" / "config.json"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465


def out(ok, error="", extra=None):
    payload = {"ok": ok}
    if error:
        payload["error"] = error
    if extra:
        payload.update(extra)
    print(json.dumps(payload))
    sys.exit(0 if ok else 1)


def send_imessage(recipient: str, body: str):
    recipient = recipient.strip()
    if not recipient:
        out(False, "No phone number on file for this customer.")
    # Normalize a US number to +1XXXXXXXXXX when it looks like a bare 10-digit.
    digits = re.sub(r"[^0-9+]", "", recipient)
    if re.fullmatch(r"\d{10}", digits):
        digits = "+1" + digits
    elif re.fullmatch(r"1\d{10}", digits):
        digits = "+" + digits
    target = digits if digits.startswith("+") else recipient

    # Escape for AppleScript string literals.
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
    tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "{esc(target)}" of targetService
        send "{esc(body)}" to targetBuddy
    end tell
    '''
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        out(False, "Messages timed out sending.")
    if r.returncode != 0:
        err = (r.stderr or "").strip()
        if "-1743" in err or "Not authorized" in err or "assistive" in err.lower():
            err = ("macOS hasn't granted automation access to Messages yet. Open "
                   "System Settings → Privacy & Security → Automation and allow the app "
                   "running the CRM (Terminal/node) to control Messages, then retry.")
        out(False, err or "osascript failed")
    out(True, extra={"channel": "imessage", "to": target})


def load_app_password():
    try:
        cfg = json.loads(CONFIG.read_text())
        return cfg["gmail_user"], cfg["app_password"]
    except Exception as e:
        out(False, f"Could not read Gmail credential from {CONFIG}: {e}")


def send_email(recipient: str, subject: str, body: str):
    recipient = recipient.strip()
    if not recipient or "@" not in recipient:
        out(False, "No valid email address on file for this customer.")
    user, password = load_app_password()
    msg = EmailMessage()
    msg["From"] = f"Bailey Covert <{user}>"
    msg["To"] = recipient
    msg["Subject"] = subject or "Following up — Covert"
    msg["Reply-To"] = "baileycovert@covertauto.com"
    msg.set_content(body)
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=30) as s:
            s.login(user, password)
            s.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        out(False, "Gmail rejected the app password. Regenerate it at myaccount.google.com/apppasswords.")
    except Exception as e:
        out(False, f"SMTP send failed: {e}")
    out(True, extra={"channel": "email", "to": recipient})


def main():
    if len(sys.argv) < 3:
        out(False, "usage: send.py <imessage|email> <recipient> [subject] <body>")
    channel = sys.argv[1]
    if channel == "imessage":
        send_imessage(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
    elif channel == "email":
        # email <to> <subject> <body>
        recipient = sys.argv[2]
        subject = sys.argv[3] if len(sys.argv) > 4 else ""
        body = sys.argv[4] if len(sys.argv) > 4 else (sys.argv[3] if len(sys.argv) > 3 else "")
        send_email(recipient, subject, body)
    else:
        out(False, f"Unknown channel: {channel}")


if __name__ == "__main__":
    main()

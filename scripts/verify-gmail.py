#!/usr/bin/env python3
"""
verify-gmail.py — confirm a Gmail address + App Password actually authenticate, so the Setup
walkthrough can tell a rep "you're connected" only when it's actually true (not after a silent failure).

Tests BOTH channels COVE uses:
  • IMAP login  → COVE can READ this inbox (scrape leads)
  • SMTP login  → COVE can SEND as this address (blasts)

Usage:  python3 verify-gmail.py <gmail_user>          (password on stdin — never in argv)
Prints one JSON line: {"ok": true, "imap": true, "smtp": true} or {"ok": false, "error": "..."}.
"""
import sys, json, imaplib, smtplib, ssl

def out(d): print(json.dumps(d)); sys.exit(0 if d.get("ok") else 1)

def main():
    if len(sys.argv) < 2:
        out({"ok": False, "error": "usage: verify-gmail.py <user>  (password on stdin)"})
    user = sys.argv[1].strip()
    pw = sys.stdin.read().strip().replace(" ", "")
    if not user or not pw:
        out({"ok": False, "error": "Missing address or App Password."})
    if len(pw) != 16:
        out({"ok": False, "error": f"App Passwords are 16 characters — got {len(pw)}. Copy it without spaces."})
    # IMAP (read)
    try:
        M = imaplib.IMAP4_SSL("imap.gmail.com")
        M.login(user, pw); M.logout()
    except imaplib.IMAP4.error:
        out({"ok": False, "error": "Google rejected the App Password for reading. Make sure 2-Step "
             "Verification is on and you pasted an App Password (not your normal password)."})
    except Exception as e:
        out({"ok": False, "error": f"Couldn't reach Gmail IMAP: {e}"})
    # SMTP (send)
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx, timeout=20) as s:
            s.login(user, pw)
    except smtplib.SMTPAuthenticationError:
        out({"ok": True, "imap": True, "smtp": False,
             "warn": "Reading works, but sending was rejected — blasts may not go out as you."})
    except Exception as e:
        out({"ok": True, "imap": True, "smtp": False, "warn": f"Reading works; sending check failed: {e}"})
    out({"ok": True, "imap": True, "smtp": True})

if __name__ == "__main__":
    main()

"""
Notification delivery for OpsDesk (Phase 1).

Two channels, both optional and safe-by-default:

1. In-app notifications  -> always written to the `notifications` table. The
   SPA polls this and renders a bell + unread count. This is what makes the
   help desk actually tell a requester "your ticket was assigned / resolved".

2. Email (SMTP)          -> ONLY attempted if OPERADESK_SMTP_HOST is set in the
   environment. Uses the standard-library `smtplib` (no extra deps). If SMTP is
   unset or a send fails, we log and continue — the in-app row is the source of
   truth, so email is best-effort, never a hard dependency.

Keep this module small; the *decision* of what to notify lives in routes_tickets.py.
"""

import smtplib
import ssl
from email.message import EmailMessage

from . import db, config


def notify(user_id, ticket_id, kind, message, email_subject=None, email_body=None):
    """Record an in-app notification and (if configured) send an email.

    user_id      : recipient user id (the requester, typically)
    ticket_id    : related ticket (for deep-linking in the UI)
    kind         : short tag, e.g. 'assigned' | 'resolved' | 'internal_note'
    message      : human-readable in-app text
    email_*      : optional override for the SMTP message
    """
    conn = db.get_db()
    conn.execute(
        """INSERT INTO notifications (user_id, ticket_id, kind, message, read, created_at)
           VALUES (?,?,?,?,0,?)""",
        (user_id, ticket_id, kind, message, db.now_iso()),
    )
    conn.commit()

    # Best-effort email: only if SMTP is configured, and never crash the request.
    if config.SMTP_HOST:
        try:
            _send_email(user_id, email_subject or "OpsDesk update",
                        email_body or message)
        except Exception as exc:  # noqa: BLE001 - email is non-critical
            # Surface in server logs only; the in-app row already landed.
            print(f"[notify] email send failed for user {user_id}: {exc}")


def _send_email(user_id, subject, body):
    row = db.get_db().execute(
        "SELECT email, name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not row or not row["email"]:
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = config.SMTP_FROM
    msg["To"] = row["email"]
    msg.set_content(body)

    if config.SMTP_PORT == 465:
        client = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=ssl.create_default_context(), timeout=10)
    else:
        client = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
    with client as s:
        if config.SMTP_PORT != 465:
            s.starttls()
        if config.SMTP_USER:
            s.login(config.SMTP_USER, config.SMTP_PASS)
        s.send_message(msg)

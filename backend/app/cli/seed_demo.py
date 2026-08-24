"""
Demo accounts seeder.

Creates the standard test accounts documented in TEST_ACCOUNTS.md so
reviewers/testers can log in without going through the setup wizard.

Usage:
    python -m app.cli.seed_demo            # from backend/ with venv active

Idempotent: accounts that already exist are skipped, never duplicated.
Passwords are bcrypt-hashed exactly like a normal signup. The flag file
(data/.demo_seeded) records completion; delete it to re-run after wiping the DB.
"""
import uuid
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import select

from app.database import async_session
from app.models import User

# email / password / displayName / role  — mirrors docs/TEST_ACCOUNTS.md
DEMO_USERS = [
    ("admin@mkindayzir.demo",       "Admin@2026!",   "Demo Admin",    "ADMIN"),
    ("manager@mkindayzir.demo",     "Manager@2026!", "Demo Manager",  "MANAGER"),
    ("member@mkindayzir.demo",      "Member@2026!",  "Demo Member",   "MEMBER"),
    ("viewer@mkindayzir.demo",      "Viewer@2026!",  "Demo Viewer",   "VIEWER"),
]


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


async def seed(force: bool = False) -> dict:
    """Create demo users. Returns {"created": [...], "skipped": [...]}."""
    created, skipped = [], []
    async with async_session() as db:
        for email, password, display_name, role in DEMO_USERS:
            existing = await db.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                skipped.append(email)
                continue
            user = User(
                id=uuid.uuid4().hex,
                email=email,
                passwordHash=_hash(password),
                displayName=display_name,
                role=role,
                status="ACTIVE",
            )
            db.add(user)
            created.append(email)
        if created:
            await db.commit()
    return {"created": created, "skipped": skipped}


def main() -> None:
    import asyncio
    result = asyncio.run(seed())
    print("Demo seeding complete.")
    for e in result["created"]:
        print(f"  + created: {e}")
    for e in result["skipped"]:
        print(f"  = already exists: {e}")
    print("Credentials are documented in docs/TEST_ACCOUNTS.md")


if __name__ == "__main__":
    main()

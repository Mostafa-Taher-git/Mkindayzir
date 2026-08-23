import asyncio
import sys
import secrets
import string
from app.config import settings
from app.database import engine, Base, DATABASE_URL
from app.models import User, Team, SystemConfig
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def run_setup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        admin = User(
            id="admin-001",
            email="admin@mkindayzir.local",
            passwordHash=pwd_context.hash("admin123"),
            displayName="Admin",
            role="ADMIN",
            status="ACTIVE",
        )
        session.add(admin)

        team = Team(
            id="team-001",
            name="Default Team",
            description="Default team for personal mode",
        )
        session.add(team)

        session.add(SystemConfig(
            id="config-001",
            key="setup_complete",
            value="true",
        ))

        await session.commit()

    print("Setup completed successfully!")


def main():
    asyncio.run(run_setup())


if __name__ == "__main__":
    main()

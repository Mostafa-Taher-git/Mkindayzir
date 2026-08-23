import click
import asyncio
from app.config import settings
from app.database import engine, Base
from app.models import User, Team, SystemConfig
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@click.group()
def setup_cli():
    """Setup and initialization commands."""
    pass

@setup_cli.command()
@click.option("--email", prompt="Admin email", help="Admin user email")
@click.option("--password", prompt="Admin password", hide_input=True, confirmation_prompt=True, help="Admin password")
@click.option("--name", default="Admin", help="Admin display name")
def admin(email, password, name):
    """Create the admin user."""
    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
        async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with async_session() as session:
            admin = User(
                id="admin-001",
                email=email,
                passwordHash=pwd_context.hash(password),
                displayName=name,
                role="ADMIN",
                status="ACTIVE",
            )
            session.add(admin)
            await session.commit()
            click.echo(f"Admin user created: {email}")

    asyncio.run(_create())

@setup_cli.command()
def wizard():
    """Interactive first-run setup wizard."""
    click.echo("Welcome to Mkindayzir Setup!")
    email = click.prompt("Admin email")
    password = click.prompt("Admin password", hide_input=True, confirmation_prompt=True)
    name = click.prompt("Admin display name", default="Admin")

    from app.cli.setup import admin as admin_cmd
    ctx = click.Context(admin_cmd)
    admin_cmd.invoke(ctx, email=email, password=password, name=name)

    click.echo("\nSetup complete! You can now start the server with: mkindayzir start")

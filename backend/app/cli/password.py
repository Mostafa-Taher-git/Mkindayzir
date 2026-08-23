import click
import asyncio
from passlib.context import CryptContext
from app.database import engine
from app.models import User
from sqlalchemy import select

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@click.group()
def password_cli():
    """Password management commands."""
    pass

@password_cli.command()
@click.argument("email")
@click.option("--password", prompt="New password", hide_input=True, confirmation_prompt=True)
def reset(email, password):
    """Reset a user's password."""
    async def _reset():
        async with engine.connect() as conn:
            result = await conn.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if not user:
                click.echo(f"User not found: {email}", err=True)
                return

            user.passwordHash = pwd_context.hash(password)
            await conn.commit()
            click.echo(f"✓ Password reset for {email}")

    asyncio.run(_reset())

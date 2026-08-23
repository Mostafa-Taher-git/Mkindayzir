import secrets
import uuid


def generate_secure_token(length: int = 64) -> str:
    return secrets.token_hex(length)


def cuid() -> str:
    return str(uuid.uuid4())

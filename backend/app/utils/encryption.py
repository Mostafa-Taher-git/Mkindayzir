from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
import base64
import os
from app.config import settings

ALGORITHM = "aes-256-gcm"
KEY_LENGTH = 32
IV_LENGTH = 12
AUTH_TAG_LENGTH = 16
SALT_LENGTH = 16
PBKDF2_ITERATIONS = 100000
AAD = b"mkindayzir-ai-key"

_cached_key: bytes | None = None


def get_encryption_key() -> bytes:
    global _cached_key
    if _cached_key:
        return _cached_key

    hex_key = settings.ENCRYPTION_KEY
    if not hex_key:
        raise ValueError("ENCRYPTION_KEY environment variable is not set")
    if len(hex_key) != KEY_LENGTH * 2:
        raise ValueError(
            f"ENCRYPTION_KEY must be exactly {KEY_LENGTH * 2} hex characters ({KEY_LENGTH} bytes)"
        )
    _cached_key = bytes.fromhex(hex_key)
    return _cached_key


def encrypt(text: str, key: bytes) -> str:
    iv = os.urandom(IV_LENGTH)
    salt = os.urandom(SALT_LENGTH)
    derived_key = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LENGTH,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    ).derive(key)

    aesgcm = AESGCM(derived_key)
    encrypted = aesgcm.encrypt(iv, text.encode("utf-8"), AAD)
    ciphertext = encrypted[:-AUTH_TAG_LENGTH]
    auth_tag = encrypted[-AUTH_TAG_LENGTH:]

    parts = [
        base64.b64encode(salt).decode("utf-8"),
        base64.b64encode(iv).decode("utf-8"),
        base64.b64encode(ciphertext).decode("utf-8"),
        base64.b64encode(auth_tag).decode("utf-8"),
    ]
    return ".".join(parts)


def decrypt(encrypted: str, key: bytes) -> str:
    parts = encrypted.split(".")
    if len(parts) != 4:
        raise ValueError("Invalid encrypted data format")

    salt = base64.b64decode(parts[0])
    iv = base64.b64decode(parts[1])
    ciphertext = base64.b64decode(parts[2])
    auth_tag = base64.b64decode(parts[3])

    derived_key = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LENGTH,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    ).derive(key)

    aesgcm = AESGCM(derived_key)
    decrypted = aesgcm.decrypt(iv, ciphertext + auth_tag, AAD)
    return decrypted.decode("utf-8")

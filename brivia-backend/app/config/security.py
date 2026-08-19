"""
Password hashing utilities using pwdlib (bcrypt backend).
"""

from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

_password_hash = PasswordHash([BcryptHasher()])


def hash_password(plain: str) -> str:
    """Hash a plaintext password."""
    return _password_hash.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a hash."""
    return _password_hash.verify(plain, hashed)

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from jose import JWTError, jwt
from passlib.hash import pbkdf2_sha256

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pbkdf2_sha256.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pbkdf2_sha256.verify(password, password_hash)
    except Exception:
        return False


def create_access(user_id: str, org_id: str, role: str, minutes: int = 60) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "org_id": str(org_id),
        "role": str(role),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("wrong token type")
        return payload
    except JWTError as e:
        raise ValueError("invalid token") from e
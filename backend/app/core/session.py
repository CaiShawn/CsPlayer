import secrets
import threading
import time
from typing import Any

from .config import settings


class SessionStore:
    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(self, cookie: dict[str, str], user_id: int) -> str:
        sid = secrets.token_urlsafe(24)
        with self._lock:
            self._store[sid] = {
                "cookie": cookie,
                "user_id": user_id,
                "created_at": time.time(),
            }
        return sid

    def get(self, sid: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._store.get(sid)
            if not item:
                return None
            if time.time() - item["created_at"] > settings.session_ttl:
                del self._store[sid]
                return None
            return item

    def delete(self, sid: str) -> None:
        with self._lock:
            self._store.pop(sid, None)


sessions = SessionStore()


def parse_cookie_str(raw: str) -> dict[str, str]:
    result: dict[str, str] = {}
    if not raw:
        return result
    for part in raw.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            result[k.strip()] = v.strip()
    return result


def merge_set_cookie(headers: dict, cookie: dict[str, str]) -> dict[str, str]:
    """Merge Set-Cookie header value(s) into cookie dict."""
    raw = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    if isinstance(raw, list):
        raw = "; ".join(raw)
    # Set-Cookie can be "a=1; Path=/, b=2; Path=/"
    for chunk in raw.split(","):
        first = chunk.split(";")[0].strip()
        if "=" in first:
            k, v = first.split("=", 1)
            cookie[k.strip()] = v.strip()
    cookie.update(parse_cookie_str(raw if ";" in raw and "Path" not in raw else ""))
    return cookie

"""
In-process rate limiting for public endpoints (gap 7).

Deliberately small: a fixed-window counter per (bucket, client key). That is
enough for a single-instance MVP; a multi-instance deployment should move this
to Redis or an edge rule, which the settings leave room for.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

from app.config.settings import get_settings

_windows: dict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))

# Buckets that only read data — the care page polling and the live quote
# preview while someone types. They share the high read ceiling so a demo
# cannot 429 itself; writes keep the tighter PUBLIC_RATE_LIMIT_PER_MINUTE.
_READ_BUCKETS = {"public-read", "v2-read"}


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def public_rate_limit(bucket: str = "public"):
    """
    Dependency factory: ``Depends(public_rate_limit("pay"))``.

    The limit comes from ``PUBLIC_RATE_LIMIT_PER_MINUTE``; set it to 0 to
    disable limiting entirely (useful for local demos).
    """

    async def dependency(request: Request) -> None:
        settings = get_settings()
        limit = (
            settings.PUBLIC_READ_RATE_LIMIT_PER_MINUTE
            if bucket in _READ_BUCKETS
            else settings.PUBLIC_RATE_LIMIT_PER_MINUTE
        )
        if limit <= 0:
            return

        key = f"{bucket}:{_client_key(request)}"
        now = time.monotonic()
        window_start, count = _windows.get(key, (now, 0))

        if now - window_start >= 60:
            window_start, count = now, 0

        count += 1
        _windows[key] = (window_start, count)

        if count > limit:
            retry_after = max(1, int(60 - (now - window_start)))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency

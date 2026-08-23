from fastapi import Request, HTTPException
from collections import defaultdict
import time


class RateLimiter:
    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str, limit: int, window: int = 60) -> bool:
        now = time.time()
        self._requests[key] = [t for t in self._requests[key] if now - t < window]
        if len(self._requests[key]) >= limit:
            return False
        self._requests[key].append(now)
        return True


_rate_limiter = RateLimiter()


def rate_limit(limit: int, window: int = 60):
    async def dependency(request: Request):
        client = request.client.host if request.client else "unknown"
        if not _rate_limiter.is_allowed(client, limit, window):
            raise HTTPException(status_code=429, detail="Too many requests")
    return dependency

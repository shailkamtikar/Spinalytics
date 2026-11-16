"""Pure-ASGI middleware: request-size limit and security headers."""
from __future__ import annotations

import json

from app.config import get_settings


class SecurityHeadersMiddleware:
    HEADERS = [(b"x-content-type-options", b"nosniff"), (b"referrer-policy", b"no-referrer")]

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def wrapped(message):
            if message["type"] == "http.response.start":
                names = {k.lower() for k, _ in message["headers"]}
                message["headers"] = list(message["headers"]) + [h for h in self.HEADERS if h[0] not in names]
            await send(message)

        await self.app(scope, receive, wrapped)


class _TooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Reject bodies over ``max_body_bytes`` with a 413 envelope, whether or not Content-Length is sent."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = get_settings().max_body_bytes
        declared = dict(scope["headers"]).get(b"content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            return await self._reject(send, limit)
        seen = 0
        exceeded = False

        async def counting_receive():
            nonlocal seen, exceeded
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    exceeded = True
                    raise _TooLarge  # the framework may wrap this in its own 400; the flag decides the answer
            return message

        async def guarded_send(message):
            if not exceeded:  # once the limit is hit, whatever the app says is replaced by the 413
                await send(message)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _TooLarge:
            pass
        if exceeded:
            await self._reject(send, limit)

    @staticmethod
    async def _reject(send, limit: int):
        body = json.dumps({"error": {"code": "payload_too_large", "message": f"The request is larger than the {limit // 1024} KB limit.", "fields": []}}).encode()
        await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

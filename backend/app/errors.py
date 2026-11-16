"""One JSON error envelope for every failure: {"error": {"code", "message", "fields"}}."""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.analysis.validation import InputValidationError

log = logging.getLogger("spinalytics.errors")


class ApiException(Exception):
    """A controlled failure with its own status and code, answered with the standard envelope."""

    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


def envelope(status: int, code: str, message: str, fields: list[dict] | None = None, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message, "fields": fields or []}}, status_code=status, headers=headers)


def _field_name(loc: tuple) -> str:
    return ".".join(str(p) for p in loc if p != "body")


def install(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [{"field": _field_name(e["loc"]) or "body", "message": str(e["msg"]).removeprefix("Value error, ")} for e in exc.errors()]
        return envelope(422, "validation_error", "The request could not be accepted. See 'fields' for what to fix.", fields)

    @app.exception_handler(InputValidationError)
    async def _input(_: Request, exc: InputValidationError):
        fields = [{"field": e.field or "body", "message": e.message} for e in exc.errors]
        return envelope(422, "invalid_measurements", "Some values are not valid numbers. See 'fields' for what to fix.", fields)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed", 413: "payload_too_large"}.get(exc.status_code, "http_error")
        return envelope(exc.status_code, code, str(exc.detail), headers=getattr(exc, "headers", None))

    @app.exception_handler(ApiException)
    async def _api(_: Request, exc: ApiException):
        return envelope(exc.status, exc.code, exc.message)

    @app.exception_handler(RateLimitExceeded)
    async def _rate(_: Request, exc: RateLimitExceeded):
        return envelope(429, "rate_limited", "Too many requests. Please wait a moment and try again.", headers={"Retry-After": "60"})

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        # log the type and route only: never the body, which holds measurements
        log.error("unhandled %s on %s %s", type(exc).__name__, request.method, request.url.path, exc_info=True)
        return envelope(500, "internal_error", "Something went wrong on the server. Please try again.")


__all__ = ["envelope", "install", "HTTPException"]

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.api import analyze, health, info, samples
from app.config import APP_VERSION, get_settings
from app.limiter import limiter
from app.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.services import analysis_service

log = logging.getLogger("spinalytics")


@asynccontextmanager
async def lifespan(_: FastAPI):
    loaded = analysis_service.warm_up()  # load artifacts once, not per request
    log.info("artifacts loaded: %s", loaded)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Spinalytics API",
        version=APP_VERSION,
        description="Spinal measurement analysis on synthetic data. Not a medical device.",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    errors.install(app)
    for router in (health.router, analyze.router, samples.router, info.router):
        app.include_router(router)
    # added last = outermost: security headers wrap every response, then the size check, then CORS
    app.add_middleware(CORSMiddleware, allow_origins=get_settings().origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"], max_age=600)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    return app


app = create_app()

from fastapi import FastAPI

from app.api import health
from app.config import APP_VERSION

app = FastAPI(
    title="Spinalytics API",
    version=APP_VERSION,
    description="Spinal measurement analysis on synthetic data. Not a medical device.",
)
app.include_router(health.router)

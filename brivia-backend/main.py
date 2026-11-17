"""
Brivia Backend — FastAPI Entry Point

Run:
  uvicorn main:app --reload --port 8000
"""

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import get_settings
from app.routers import auth, bills, payments, public, v2
from app.services import reconciler
import uvicorn

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run the overdue / stale-payment sweeps in the background."""
    stop_event = asyncio.Event()
    task = reconciler.start(stop_event)
    try:
        yield
    finally:
        stop_event.set()
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Brivia Healthcare Payment Coordination API",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,  # Prevent 307 redirects that strip Authorization headers
    lifespan=lifespan,
)

# --- CORS ---
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth.router)
app.include_router(bills.router)
app.include_router(payments.router)
app.include_router(public.router)
app.include_router(v2.router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}


@app.head("/health", tags=["Health"])
async def health_head():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", port=8000, reload=True)

"""
Brivia Backend — FastAPI Entry Point

Run:
  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import get_settings
from app.routers import auth, bills, payments, public
import uvicorn

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Brivia Healthcare Payment Coordination API",
    docs_url="/docs",
    redoc_url="/redoc",
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
async def health():
    return {"status": "ok"}
if __name__ =="__main__":
    uvicorn.run("main:app", port=8000, reload=True)
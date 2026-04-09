"""
api.py  (project root)
======================
FastAPI application entry point.

Start with:
    uvicorn api:app --reload --host 0.0.0.0 --port 8000
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import API_HOST, API_PORT
from backend.controllers import detect, verify, lulc, fire, snow, landslide, deforestation, building
from backend.utils.db import ensure_verified_table

# ── Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="Earth Watch API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # tighten in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup ───────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    logger.info("Earth Watch API starting up…")
    ensure_verified_table()

# ── Routers ───────────────────────────────────────────────────────
app.include_router(detect.router)
app.include_router(verify.router)
app.include_router(lulc.router)
app.include_router(fire.router)
app.include_router(snow.router)
app.include_router(landslide.router)
app.include_router(deforestation.router)
app.include_router(building.router)

# ── Health ────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Earth Watch API is running!", "version": "2.0.0"}

@app.get("/ping")
def ping():
    return {"status": "ok"}

# ── Dev runner ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host=API_HOST, port=API_PORT, reload=True)

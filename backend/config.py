"""
backend/config.py
=================
Central configuration — reads from .env / environment variables.
All other modules import from here; no hardcoded values elsewhere.
"""

import os
from dotenv import load_dotenv

# Load .env from the project root (one level up from backend/)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_root, ".env"))

# ── PostgreSQL — Pooler (FastAPI / API layer) ─────────────────────
# Use Supabase pooler for everything (no local DB)
DB_DIRECT_CONFIG = {
    "dbname":   os.environ.get("PGDATABASE"),
    "user":     os.environ.get("PGUSER"),
    "password": os.environ.get("PGPASSWORD"),
    "host":     os.environ.get("PGHOST"),
    "port":     int(os.environ.get("PGPORT")),
    "sslmode":  "require",
}
DB_CONFIG=DB_DIRECT_CONFIG

# ── Google Earth Engine ───────────────────────────────────────────
GEE_PROJECT = os.environ.get("GEE_PROJECT", "")

# ── Model ─────────────────────────────────────────────────────────
MODEL_PATH = os.environ.get("MODEL_PATH", "clean_data_model/best_model.pt")

# ── Tile / Inference Settings ─────────────────────────────────────
TILE_KM          = 5.0
OVERLAP_FRAC     = 0.5
TARGET_SIZE      = 512
SCALE            = 10
CLOUD_THRESH     = 20
COMP_MONTHS      = 6
SEG_THRESHOLD    = 0.50
MINE_THRESHOLD   = 0.50
IOU_MERGE_THRESH = 0.15
N_CHANNELS       = 11
S2_BANDS         = ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"]

TILE_CACHE_DIR   = "./tile_cache"
CACHE_VALID_DAYS = 180
OUTPUT_DIR       = "./mine_detection_output"

# ── Classification Thresholds ─────────────────────────────────────
CENTROID_SEARCH_KM = 5.0
BUFFER_M           = 300
IOU_LEGAL_THRESH   = 0.30
IOU_SUSPECT_THRESH = 0.10

# ── FastAPI ────────────────────────────────────────────────────────
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("API_PORT", "8000"))

"""
backend/utils/db.py
===================
Database connection helpers.
"""

import logging
import psycopg2
import psycopg2.extras

from backend.config import DB_CONFIG, DB_DIRECT_CONFIG

logger = logging.getLogger(__name__)


def get_api_db():
    """
    Returns a psycopg2 connection using the pooler config (used by FastAPI routes).
    Returns None on failure so callers can handle gracefully.
    """
    try:
        return psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        logger.error(f"API DB connection failed: {e}")
        return None


def get_direct_db():
    """
    Returns a psycopg2 connection using the direct config (used by mine_detection PostGIS queries).
    Returns None on failure.
    """
    try:
        return psycopg2.connect(**DB_DIRECT_CONFIG)
    except Exception as e:
        logger.error(f"Direct DB connection failed: {e}")
        return None


def ensure_verified_table():
    """Creates the user_verified_mines table if it doesn't exist."""
    conn = get_api_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_verified_mines (
                id              SERIAL PRIMARY KEY,
                mine_id         INTEGER,
                geom            GEOMETRY(Geometry, 4326),
                area_km2        FLOAT,
                reason          TEXT,
                notes           TEXT,
                verified_by     TEXT DEFAULT 'field_officer',
                verified_at     TIMESTAMP DEFAULT NOW(),
                original_verdict TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_uvm_geom
                ON user_verified_mines USING GIST(geom);
        """)
        conn.commit()
        cur.close()
        conn.close()
        logger.info("user_verified_mines table ensured.")
    except Exception as e:
        logger.error(f"ensure_verified_table failed: {e}")

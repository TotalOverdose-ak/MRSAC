"""
backend/routers/verify.py
=========================
GET  /api/verified  — list all officer-verified mines
POST /api/verify    — mark a mine as officer-verified (USER_LEGAL)
"""

import json
import logging
from typing import Optional

import psycopg2.extras
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.utils.db import get_api_db

logger = logging.getLogger(__name__)
router = APIRouter()


class VerifyRequest(BaseModel):
    mine_id:          int
    geom:             dict
    area_km2:         float
    reason:           str
    notes:            Optional[str] = ""
    original_verdict: str


@router.get("/api/verified")
def get_verified_mines():
    conn = get_api_db()
    if not conn:
        return []
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, mine_id, area_km2, reason, notes,
                   original_verdict, verified_at,
                   ST_AsGeoJSON(geom)::json AS geojson
            FROM user_verified_mines
            ORDER BY verified_at DESC
        """)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        logger.error(f"get_verified_mines failed: {e}")
        return []


@router.post("/api/verify")
def verify_mine(req: VerifyRequest):
    conn = get_api_db()
    if not conn:
        raise HTTPException(status_code=500, detail="DB unavailable")
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO user_verified_mines
              (mine_id, geom, area_km2, reason, notes, original_verdict)
            VALUES (
              %s,
              ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
              %s, %s, %s, %s
            )
            RETURNING id
        """, (
            req.mine_id,
            json.dumps(req.geom),
            req.area_km2,
            req.reason,
            req.notes,
            req.original_verdict,
        ))
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "id": new_id}
    except Exception as e:
        logger.error(f"verify_mine failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

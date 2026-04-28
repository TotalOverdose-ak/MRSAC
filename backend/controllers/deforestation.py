"""
backend/routers/deforestation.py
=================================
POST /api/deforestation — Forest loss tracking using Global Forest Watch + Sentinel-2 NDVI via GEE.
POST /api/deforestation/stats — Lightweight stats endpoint for the report panel.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.deforestation import (
    analyze_deforestation, clear_cache, get_cache_info,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class DeforestationRequest(BaseModel):
    geojson: dict
    start_year: Optional[int] = 2001
    end_year: Optional[int] = 2024
    min_canopy: Optional[int] = 20
    # Sentinel-2 NDVI analysis (opt-in)
    include_ndvi: Optional[bool] = False
    ndvi_before_year: Optional[int] = 2018
    ndvi_after_year: Optional[int] = 2023
    ndvi_threshold: Optional[float] = 0.4
    season_start_month: Optional[int] = 1
    season_end_month: Optional[int] = 12


@router.post("/api/deforestation")
async def run_deforestation(req: DeforestationRequest):
    """
    Deforestation analysis for the given AOI polygon.
    Uses Hansen Global Forest Change dataset via GEE.
    Optionally includes Sentinel-2 NDVI temporal analysis.
    """
    try:
        logger.info(
            f"Deforestation analysis requested: {req.start_year}-{req.end_year}, "
            f"min_canopy={req.min_canopy}, include_ndvi={req.include_ndvi}"
        )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: analyze_deforestation(
                req.geojson,
                req.start_year,
                req.end_year,
                req.min_canopy,
                req.include_ndvi,
                req.ndvi_before_year,
                req.ndvi_after_year,
                req.ndvi_threshold,
                req.season_start_month,
                req.season_end_month,
            )
        )

        return {"status": "success", **result}

    except Exception as e:
        logger.error(f"Deforestation analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deforestation/cache")
async def cache_status():
    """Return current cache stats."""
    return get_cache_info()


@router.delete("/api/deforestation/cache")
async def cache_clear():
    """Clear all cached deforestation results."""
    clear_cache()
    return {"status": "cleared", "entries": 0}

"""
backend/routers/deforestation.py
=================================
POST /api/deforestation — Forest loss tracking using Global Forest Watch via GEE.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.deforestation import analyze_deforestation

logger = logging.getLogger(__name__)
router = APIRouter()


class DeforestationRequest(BaseModel):
    geojson: dict
    start_year: Optional[int] = 2001
    end_year: Optional[int] = 2024
    min_canopy: Optional[int] = 20


@router.post("/api/deforestation")
async def run_deforestation(req: DeforestationRequest):
    """
    Deforestation analysis for the given AOI polygon.
    Uses Hansen Global Forest Change dataset via GEE.
    """
    try:
        logger.info(f"Deforestation analysis requested: {req.start_year}-{req.end_year}, min_canopy={req.min_canopy}")

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: analyze_deforestation(
                req.geojson, req.start_year, req.end_year, req.min_canopy
            )
        )

        return {"status": "success", **result}

    except Exception as e:
        logger.error(f"Deforestation analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

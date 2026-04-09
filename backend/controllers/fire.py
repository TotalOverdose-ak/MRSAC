"""
backend/routers/fire.py
========================
POST /api/fire — Forest Fire burn severity analysis using dNBR.
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.forest_fire import analyze_burn_severity

logger = logging.getLogger(__name__)
router = APIRouter()


class FireRequest(BaseModel):
    geojson: dict
    pre_start: str   # 'YYYY-MM-DD'
    pre_end: str
    post_start: str
    post_end: str


@router.post("/api/fire")
async def run_fire(req: FireRequest):
    """
    Burn severity analysis for the given AOI polygon.
    Uses Sentinel-2 dNBR (delta Normalized Burn Ratio) via GEE.
    """
    try:
        logger.info(
            f"Fire analysis requested — pre: {req.pre_start}→{req.pre_end}, "
            f"post: {req.post_start}→{req.post_end}"
        )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: analyze_burn_severity(
                req.geojson, req.pre_start, req.pre_end,
                req.post_start, req.post_end,
            ),
        )

        return {"status": "success", **result}

    except Exception as e:
        logger.error(f"Fire analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

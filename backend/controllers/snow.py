"""
backend/routers/snow.py
========================
POST /api/snow — Snow & Ice cover mapping using Landsat 8/9 NDSI.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.snow_cover import analyze_snow_cover, get_snow_trend

logger = logging.getLogger(__name__)
router = APIRouter()


class SnowRequest(BaseModel):
    geojson: dict
    year: Optional[int] = 2024
    include_trend: Optional[bool] = True
    trend_start_year: Optional[int] = 2014
    trend_end_year: Optional[int] = 2025


@router.post("/api/snow")
async def run_snow(req: SnowRequest):
    """
    Snow cover analysis for the given AOI polygon.
    Uses Landsat 8/9 NDSI thresholding via GEE.
    """
    try:
        logger.info(f"Snow analysis requested — year={req.year}, include_trend={req.include_trend}")

        loop = asyncio.get_event_loop()
        
        # We can run analyze_snow_cover and get_snow_trend concurrently
        tasks = [
            loop.run_in_executor(None, lambda: analyze_snow_cover(req.geojson, req.year))
        ]
        
        if req.include_trend:
            tasks.append(
                loop.run_in_executor(None, lambda: get_snow_trend(
                    req.geojson, req.trend_start_year, req.trend_end_year
                ))
            )
            
        results = await asyncio.gather(*tasks)
        
        response = {"status": "success", **results[0]}
        if req.include_trend and len(results) > 1:
            response["trend"] = results[1]
            
        return response

    except Exception as e:
        logger.error(f"Snow analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

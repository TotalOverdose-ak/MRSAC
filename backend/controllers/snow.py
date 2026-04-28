"""
backend/routers/snow.py
========================
POST /api/snow — Snow & Ice cover mapping using Landsat 8/9 NDSI.
Enhanced: Elevation zones, SLA, FSC, Seasonal, Persistence (CGF), Surface Temperature.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.snow_cover import (
    analyze_snow_cover, get_snow_trend, get_seasonal_snow,
    get_snow_persistence, get_snow_surface_temperature
)

logger = logging.getLogger(__name__)
router = APIRouter()


class SnowRequest(BaseModel):
    geojson: dict
    year: Optional[int] = 2024
    include_trend: Optional[bool] = True
    include_seasonal: Optional[bool] = False
    include_persistence: Optional[bool] = False
    include_lst: Optional[bool] = False
    trend_start_year: Optional[int] = 2014
    trend_end_year: Optional[int] = 2025


@router.post("/api/snow")
async def run_snow(req: SnowRequest):
    """
    Snow cover analysis for the given AOI polygon.
    Enhanced with elevation analysis, seasonal metrics, MODIS persistence, and LST.
    """
    try:
        logger.info(
            f"Snow analysis requested — year={req.year}, "
            f"trend={req.include_trend}, seasonal={req.include_seasonal}, "
            f"persistence={req.include_persistence}, lst={req.include_lst}"
        )

        loop = asyncio.get_event_loop()
        
        # Build concurrent tasks
        task_keys = ['main']
        tasks = [
            loop.run_in_executor(None, lambda: analyze_snow_cover(req.geojson, req.year))
        ]
        
        if req.include_trend:
            task_keys.append('trend')
            tasks.append(
                loop.run_in_executor(None, lambda: get_snow_trend(
                    req.geojson, req.trend_start_year, req.trend_end_year
                ))
            )

        if req.include_seasonal:
            task_keys.append('seasonal')
            tasks.append(
                loop.run_in_executor(None, lambda: get_seasonal_snow(req.geojson, req.year))
            )

        if req.include_persistence:
            task_keys.append('persistence')
            tasks.append(
                loop.run_in_executor(None, lambda: get_snow_persistence(req.geojson, req.year))
            )

        if req.include_lst:
            task_keys.append('lst')
            tasks.append(
                loop.run_in_executor(None, lambda: get_snow_surface_temperature(req.geojson, req.year))
            )
            
        results = await asyncio.gather(*tasks)
        
        response = {"status": "success", **results[0]}
        for i, key in enumerate(task_keys[1:], 1):
            response[key] = results[i]
            
        return response

    except Exception as e:
        logger.error(f"Snow analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

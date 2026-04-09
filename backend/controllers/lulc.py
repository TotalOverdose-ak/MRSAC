"""
backend/routers/lulc.py
========================
POST /api/lulc — Land Use Land Cover classification using Google Dynamic World.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.lulc import analyze_lulc

logger = logging.getLogger(__name__)
router = APIRouter()


class LULCRequest(BaseModel):
    geojson: dict
    year: Optional[int] = None
    season: str = "annual"
    model: str = "dynamic_world"


@router.post("/api/lulc")
async def run_lulc(req: LULCRequest):
    """
    Classify land use / land cover for the given AOI polygon.
    Uses Google Dynamic World (10m resolution) via GEE.
    """
    try:
        logger.info(f"LULC analysis requested — year={req.year}, season={req.season}, model={req.model}")

        # Run blocking GEE call in a thread pool
        loop = asyncio.get_event_loop()
        
        if req.model == "custom_1dcnn":
            from backend.services.analysis.custom_lulc import predict_lulc_custom_b64
            result = await loop.run_in_executor(
                None,
                lambda: predict_lulc_custom_b64(req.geojson),
            )
        else:
            result = await loop.run_in_executor(
                None,
                lambda: analyze_lulc(req.geojson, req.year, req.season),
            )

        return {"status": "success", **result}

    except Exception as e:
        logger.error(f"LULC analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class LULCTrainRequest(BaseModel):
    geojson: dict
    class_label: int

@router.post("/api/lulc/train")
async def run_lulc_train(req: LULCTrainRequest):
    """
    Active Learning: Add a human-verified polygon to the local training dataset 
    and fast-fine-tune the 1D-CNN model.
    """
    try:
        logger.info(f"Active Learning request — class_label={req.class_label}")
        
        loop = asyncio.get_event_loop()
        from backend.services.analysis.custom_lulc import add_active_learning_sample
        
        result = await loop.run_in_executor(
            None,
            lambda: add_active_learning_sample(req.geojson, req.class_label),
        )
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))

        return result
    except Exception as e:
        logger.error(f"Active Learning failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class LULCDistillRequest(BaseModel):
    geojson: dict

@router.post("/api/lulc/distill")
async def run_lulc_distill(req: LULCDistillRequest):
    """
    Auto-Labeling via Knowledge Distillation: 
    Sample points within drawn polygon, fetch Dynamic World labels + S2 features,
    append to database, and fine tune model on-the-fly.
    """
    try:
        logger.info(f"UI Auto-Distill request received")
        
        loop = asyncio.get_event_loop()
        from backend.services.analysis.custom_lulc import add_ui_distill_sample
        
        result = await loop.run_in_executor(
            None,
            lambda: add_ui_distill_sample(req.geojson),
        )
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))

        return result
    except Exception as e:
        logger.error(f"UI Auto-Distill failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

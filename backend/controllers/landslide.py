"""
backend/routers/landslide.py
=============================
POST /api/landslide — Landslide Susceptibility mapping using GE Random Forest.
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.analysis.landslide import analyze_landslide
from backend.services.analysis.dl_landslide import analyze_landslide_dl

logger = logging.getLogger(__name__)
router = APIRouter()


class LandslideRequest(BaseModel):
    geojson: dict
    engine: str = "gee"


@router.post("/api/landslide")
async def run_landslide(req: LandslideRequest):
    """
    Landslide susceptibility analysis for the given AOI polygon.
    Supports both GEE Random Forest and Keras Deep Learning U-Net.
    """
    try:
        logger.info(f"Landslide analysis requested. Engine: {req.engine}")

        loop = asyncio.get_event_loop()
        
        if req.engine == "deep_learning":
            result = await loop.run_in_executor(
                None,
                lambda: analyze_landslide_dl(req.geojson),
            )
        else:
            result = await loop.run_in_executor(
                None,
                lambda: analyze_landslide(req.geojson),
            )

        return {"status": "success", **result}

    except Exception as e:
        logger.error(f"Landslide analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class LandslideTrainRequest(BaseModel):
    geojson: dict
    class_label: int  # 0 for Non-Landslide, 1 for Landslide

@router.post("/api/landslide/train")
async def train_landslide_model(req: LandslideTrainRequest):
    """
    Active Learning: Add a human-verified polygon to the local training dataset 
    and fast-fine-tune the Landslide U-Net model.
    """
    try:
        logger.info(f"Landslide UI Auto-Train request received. Class: {req.class_label}")
        
        loop = asyncio.get_event_loop()
        from backend.services.analysis.dl_landslide import train_landslide_active_learning
        
        result = await loop.run_in_executor(
            None,
            lambda: train_landslide_active_learning(req.geojson, req.class_label),
        )
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))

        return result
    except Exception as e:
        logger.error(f"Landslide UI Auto-Train failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class LandslideDistillRequest(BaseModel):
    geojson: dict

@router.post("/api/landslide/distill")
async def run_landslide_distill(req: LandslideDistillRequest):
    """
    Auto-Labeling via Knowledge Distillation: 
    Run GEE Random Forest to generate a susceptibility ground-truth mask,
    then automatically compile and train the local U-Net on it.
    """
    try:
        logger.info(f"Landslide UI Auto-Distill request received")
        
        loop = asyncio.get_event_loop()
        from backend.services.analysis.dl_landslide import train_landslide_distill
        
        result = await loop.run_in_executor(
            None,
            lambda: train_landslide_distill(req.geojson),
        )
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))

        return result
    except Exception as e:
        logger.error(f"Landslide UI Auto-Distill failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


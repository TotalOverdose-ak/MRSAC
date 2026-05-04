import ee
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter()

class BuildingRequest(BaseModel):
    geojson: Dict[str, Any]
    engine: str = "gee" # Choices: 'gee', 'deep_learning'
    
class TrainRequest(BaseModel):
    geojson: Dict[str, Any]
    class_label: int # 0 or 1

@router.post("/api/building")
async def run_building_analysis(req: BuildingRequest):
    try:
        geom = req.geojson
        loop = asyncio.get_running_loop()
        
        if req.engine == "deep_learning":
            from backend.services.analysis.dl_building import analyze_building_dl  # Lazy: TensorFlow
            result = await loop.run_in_executor(
                None,
                lambda: analyze_building_dl(geom)
            )
        else:
            from backend.services.analysis.gee_utils import init_gee  # Lazy: GEE
            from backend.services.analysis.building import analyze_building
            def _run_gee():
                init_gee()
                ee_object = ee.Geometry(geom)
                return analyze_building(ee_object)
            result = await loop.run_in_executor(None, _run_gee)
            
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Building analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/building/train")
async def run_building_train(req: TrainRequest):
    try:
        from backend.services.analysis.dl_building import train_building_active_learning  # Lazy: TensorFlow
        geom = req.geojson
        label = req.class_label
        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: train_building_active_learning(geom, label)
        )
        return {"status": "success", "message": "Manual Training Completed."}
    except Exception as e:
        logger.error(f"Building custom training failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/building/distill")
async def run_building_distill(req: BuildingRequest):
    try:
        from backend.services.analysis.dl_building import train_building_distill  # Lazy: TensorFlow
        geom = req.geojson
        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: train_building_distill(geom)
        )
        return {"status": "success", "message": "Auto-Distillation Transfer Complete."}
    except Exception as e:
        logger.error(f"Building auto-distillation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/building/autocollect")
async def run_building_autocollect():
    try:
        from backend.services.analysis.dl_building import auto_collect_building  # Lazy: TensorFlow
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: auto_collect_building(num_locations=5)
        )
        return {"status": "success", "message": result["message"]}
    except Exception as e:
        logger.error(f"Building auto-collect failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


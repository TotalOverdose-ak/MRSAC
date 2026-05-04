"""
backend/routers/lulc.py
========================
POST /api/lulc — Land Use Land Cover classification using Google Dynamic World.
GET  /api/bhuvan/wms — CORS proxy for ISRO Bhuvan WMS tiles.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
import httpx

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Bhuvan WMS CORS Proxy ────────────────────────────────────
BHUVAN_WMS_BASE = "https://bhuvan-ras2.nrsc.gov.in/cgi-bin/LULC250K.exe"

@router.get("/api/bhuvan/wms")
async def proxy_bhuvan_wms(
    LAYERS: str = Query(...),
    BBOX: str = Query(...),
    WIDTH: int = Query(256),
    HEIGHT: int = Query(256),
    SRS: str = Query("EPSG:3857"),
    FORMAT: str = Query("image/png"),
):
    """Proxy Bhuvan WMS GetMap requests to avoid browser CORS blocks."""
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": LAYERS,
        "SRS": SRS,
        "BBOX": BBOX,
        "WIDTH": str(WIDTH),
        "HEIGHT": str(HEIGHT),
        "FORMAT": FORMAT,
        "TRANSPARENT": "TRUE",
        "STYLES": "",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
            resp = await client.get(BHUVAN_WMS_BASE, params=params)
            resp.raise_for_status()
            return Response(
                content=resp.content,
                media_type=resp.headers.get("content-type", "image/png"),
                headers={"Cache-Control": "public, max-age=86400"},  # Cache 24h
            )
    except Exception as e:
        logger.error(f"Bhuvan WMS proxy failed: {e}")
        raise HTTPException(status_code=502, detail=f"Bhuvan WMS fetch failed: {e}")


class BhuvanClipRequest(BaseModel):
    geojson: dict
    layer: str

@router.post("/api/bhuvan/clip")
async def bhuvan_clip(req: BhuvanClipRequest):
    """
    Fetch a single high-resolution Bhuvan WMS image clipped to the AOI bounding box.
    Returns base64 PNG + corner coordinates for image overlay rendering.
    """
    import base64

    # Extract bounding box from the GeoJSON geometry
    geom = req.geojson
    if geom.get("type") == "Feature":
        geom = geom["geometry"]
    if geom.get("type") == "FeatureCollection":
        geom = geom["features"][0]["geometry"]
    
    coords = geom.get("coordinates", [[]])
    ring = coords[0] if geom["type"] == "Polygon" else coords[0][0]
    
    lons = [pt[0] for pt in ring]
    lats = [pt[1] for pt in ring]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    # Calculate aspect-ratio-aware dimensions (max 2048px)
    lon_range = max_lon - min_lon
    lat_range = max_lat - min_lat
    aspect = lon_range / max(lat_range, 0.001)
    
    if aspect >= 1:
        width = min(2048, max(512, int(lon_range * 2000)))
        height = int(width / aspect)
    else:
        height = min(2048, max(512, int(lat_range * 2000)))
        width = int(height * aspect)
    
    width = max(256, min(2048, width))
    height = max(256, min(2048, height))

    bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
    
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap",
        "LAYERS": req.layer, "SRS": "EPSG:4326",
        "BBOX": bbox_str,
        "WIDTH": str(width), "HEIGHT": str(height),
        "FORMAT": "image/png", "TRANSPARENT": "TRUE", "STYLES": "",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.get(BHUVAN_WMS_BASE, params=params)
            resp.raise_for_status()
        
        b64 = base64.b64encode(resp.content).decode("utf-8")
        
        # Corner coordinates for MapLibre image overlay [NW, NE, SE, SW]
        coordinates = [
            [min_lon, max_lat],  # NW
            [max_lon, max_lat],  # NE
            [max_lon, min_lat],  # SE
            [min_lon, min_lat],  # SW
        ]
        
        return {
            "status": "success",
            "image_b64": b64,
            "coordinates": coordinates,
            "bbox": {"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat},
            "resolution": f"{width}x{height}px",
        }
    except httpx.TimeoutException:
        logger.error("Bhuvan WMS server timeout")
        raise HTTPException(status_code=504, detail="Bhuvan server is not responding (ISRO server may be down). Try again later.")
    except Exception as e:
        logger.error(f"Bhuvan clip failed: {e}")
        raise HTTPException(status_code=502, detail=f"Bhuvan server unreachable: {type(e).__name__}. ISRO servers may be offline — try again later.")


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
            from backend.services.analysis.lulc import analyze_lulc  # Lazy: GEE
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

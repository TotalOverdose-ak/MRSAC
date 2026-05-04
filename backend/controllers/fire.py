"""
backend/controllers/fire.py
========================
POST /api/fire          — GEE Burn Severity (dNBR)
POST /api/fire/hotspots  — NASA FIRMS fire hotspot query
POST /api/fire/stats     — NASA FIRMS fire statistics for report
POST /api/fire/risk      — ML fire risk prediction (Random Forest)
POST /api/fire/risk/train — Force retrain risk model
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Track whether FIRMS data has been lazy-loaded
_firms_loaded = False

def _ensure_firms_loaded():
    """Lazy-load FIRMS data on first use instead of at startup."""
    global _firms_loaded
    if _firms_loaded:
        return
    try:
        from backend.services.analysis.firms_loader import load_firms_data, _fire_df
        load_firms_data()
        from backend.services.analysis.fire_risk_model import _ensure_trained, train_fire_risk_model
        from backend.services.analysis.firms_loader import _fire_df as _firms_df
        if _firms_df is not None and not _firms_df.empty:
            if not _ensure_trained():
                logger.info("Training fire risk model on first use...")
                train_fire_risk_model(_firms_df, validation_year=2025)
        _firms_loaded = True
    except Exception as e:
        logger.warning(f"FIRMS lazy-load/training skipped: {e}")


# ── Request Models ────────────────────────────────────────────

class FireRequest(BaseModel):
    geojson: dict
    pre_start: str   # 'YYYY-MM-DD'
    pre_end: str
    post_start: str
    post_end: str


class FireHotspotRequest(BaseModel):
    geojson: dict
    start_date: Optional[str] = None      # 'YYYY-MM-DD'
    end_date: Optional[str] = None
    satellite: Optional[str] = 'all'
    confidence_min: Optional[float] = 0
    max_points: Optional[int] = 15000


class FireStatsRequest(BaseModel):
    geojson: dict
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class FireRiskRequest(BaseModel):
    geojson: dict
    cell_size: Optional[float] = 0.01  # degrees, ~1.1km


# ── Helper: extract bounding box from geojson ────────────────
def _geojson_to_bbox(geojson_geom: dict) -> dict:
    """Extract bounding box from a GeoJSON geometry or Feature."""
    geom = geojson_geom
    if geom.get('type') == 'Feature':
        geom = geom['geometry']
    if geom.get('type') == 'FeatureCollection':
        geom = geom['features'][0]['geometry']

    coords = geom.get('coordinates', [])

    # Flatten coordinates
    def flatten(c):
        if isinstance(c[0], (int, float)):
            return [c]
        result = []
        for item in c:
            result.extend(flatten(item))
        return result

    flat = flatten(coords)
    lons = [p[0] for p in flat]
    lats = [p[1] for p in flat]

    return {
        'min_lat': min(lats),
        'max_lat': max(lats),
        'min_lon': min(lons),
        'max_lon': max(lons),
    }


# ── Endpoint 1: GEE Burn Severity (existing) ─────────────────

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

        from backend.services.analysis.forest_fire import analyze_burn_severity  # Lazy: GEE
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


# ── Endpoint 2: NASA FIRMS Hotspots ──────────────────────────

@router.post("/api/fire/hotspots")
async def get_fire_hotspots(req: FireHotspotRequest):
    """
    Query NASA FIRMS fire detections within AOI + date range.
    Returns GeoJSON FeatureCollection of fire points for map rendering.
    Data source: NASA FIRMS (MODIS + VIIRS), locally cached CSV.
    """
    try:
        logger.info(f"FIRMS hotspot query — dates: {req.start_date}→{req.end_date}, "
                     f"confidence≥{req.confidence_min}, max={req.max_points}")

        _ensure_firms_loaded()
        from backend.services.analysis.firms_loader import get_geojson_fires  # Lazy: FIRMS
        bbox = _geojson_to_bbox(req.geojson)

        loop = asyncio.get_event_loop()
        geojson_result = await loop.run_in_executor(
            None,
            lambda: get_geojson_fires(
                bbox, req.start_date, req.end_date,
                confidence_min=req.confidence_min,
                max_points=req.max_points,
            ),
        )

        total = len(geojson_result.get('features', []))
        logger.info(f"FIRMS query returned {total} fire points")

        return {
            "status": "success",
            "total_points": total,
            "geojson": geojson_result,
        }

    except Exception as e:
        logger.error(f"FIRMS hotspot query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Endpoint 3: Fire Stats (for Report) ──────────────────────

@router.post("/api/fire/stats")
async def get_fire_statistics(req: FireStatsRequest):
    """
    Aggregated fire statistics for an AOI + date range.
    Returns monthly breakdown, yearly trend, FRP stats, etc.
    Used by the Fire Report component.
    """
    try:
        logger.info(f"FIRMS stats query — dates: {req.start_date}→{req.end_date}")

        _ensure_firms_loaded()
        from backend.services.analysis.firms_loader import get_fire_stats  # Lazy: FIRMS
        bbox = _geojson_to_bbox(req.geojson)

        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(
            None,
            lambda: get_fire_stats(bbox, req.start_date, req.end_date),
        )

        return {"status": "success", "stats": stats}

    except Exception as e:
        logger.error(f"FIRMS stats query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Endpoint 4: ML Fire Risk Prediction ──────────────────────

@router.post("/api/fire/risk")
async def fire_risk_prediction(req: FireRiskRequest):
    """
    ML-based fire risk prediction for an AOI.
    Uses Random Forest trained on 17M+ NASA FIRMS fire detections.
    Returns GeoJSON grid with risk scores (0-100) per cell.
    """
    try:
        logger.info(f"Fire risk prediction requested — cell_size: {req.cell_size}°")

        _ensure_firms_loaded()
        from backend.services.analysis.firms_loader import _fire_df as firms_data
        from backend.services.analysis.fire_risk_model import predict_fire_risk, _ensure_trained, train_fire_risk_model  # Lazy: sklearn
        if firms_data is None or firms_data.empty:
            raise HTTPException(status_code=503, detail="FIRMS data not loaded. Restart the server.")

        if not _ensure_trained():
            # Train on-the-fly if model not available
            logger.info("Model not trained — training now...")
            train_fire_risk_model(firms_data, validation_year=2025)

        bbox = _geojson_to_bbox(req.geojson)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: predict_fire_risk(bbox, firms_data, cell_size=req.cell_size),
        )

        total_cells = len(result.get('features', []))
        logger.info(f"Fire risk prediction returned {total_cells} grid cells")

        return {"status": "success", **result}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Fire risk prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Endpoint 5: Force Retrain Risk Model ─────────────────────

@router.post("/api/fire/risk/train")
async def retrain_fire_risk_model():
    """Force retrain the fire risk model on current FIRMS data."""
    try:
        _ensure_firms_loaded()
        from backend.services.analysis.firms_loader import _fire_df as firms_data
        from backend.services.analysis.fire_risk_model import train_fire_risk_model  # Lazy: sklearn
        if firms_data is None or firms_data.empty:
            raise HTTPException(status_code=503, detail="FIRMS data not loaded.")

        loop = asyncio.get_event_loop()
        metrics = await loop.run_in_executor(
            None,
            lambda: train_fire_risk_model(firms_data, validation_year=2025),
        )

        return {"status": "success", "metrics": metrics}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model retraining failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

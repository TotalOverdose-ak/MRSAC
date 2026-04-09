"""
backend/routers/detect.py
=========================
POST /api/detect  — runs the full GEE + PyTorch detection pipeline
and returns GeoJSON features with thumbnails.
"""

import glob
import json
import logging
import os

import numpy as np
import psycopg2.extras
import rasterio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shapely.geometry import shape as shp

from backend.services.analysis import mine_detection
from backend.config import OUTPUT_DIR
from backend.utils.db import get_api_db
from backend.utils.thumbnail import make_thumbnail

logger = logging.getLogger(__name__)
router = APIRouter()


class GeoJSONRequest(BaseModel):
    geojson: dict


@router.post("/api/detect")
def analyze_area(req: GeoJSONRequest):
    """
    Receives a GeoJSON polygon, runs the mine-detection pipeline,
    and returns detected mines with thumbnails + stats.
    """
    try:
        logger.info("Running Earth Engine + PyTorch detection pipeline.")
        out_gj = mine_detection.run(json.dumps(req.geojson))

        features    = out_gj.get("features", [])
        overlap_dir = os.path.join(OUTPUT_DIR, "overlapping")
        results_path = os.path.join(OUTPUT_DIR, "all_results.json")

        # ── Load segmentation masks ───────────────────────────────
        seg_masks: dict = {}
        try:
            for mf in glob.glob(os.path.join(OUTPUT_DIR, "_masks", "*.npy")):
                name = os.path.splitext(os.path.basename(mf))[0]
                seg_masks[name] = np.load(mf)
        except Exception as e:
            logger.error(f"Mask loading error: {e}")

        # ── Build thumbnail patches ───────────────────────────────
        patches: dict = {}
        if os.path.exists(results_path):
            with open(results_path) as f:
                all_res = json.load(f)

            for feat in features:
                props   = feat["properties"]
                mine_id = props.get("mine_id")
                verdict = props.get("verdict", "UNVERIFIED")
                geom    = feat["geometry"]
                try:
                    mine_shape = shp(geom)
                    cx, cy     = mine_shape.centroid.x, mine_shape.centroid.y
                    best_tif   = None
                    best_prob  = 0.0
                    best_tile  = None

                    for r in all_res:
                        if not r.get("mine_detected"):
                            continue
                        tif = os.path.join(overlap_dir, f"{r['tile']}.tif")
                        if not os.path.exists(tif):
                            continue
                        with rasterio.open(tif) as s:
                            bnd = s.bounds
                        if (
                            bnd.left <= cx <= bnd.right
                            and bnd.bottom <= cy <= bnd.top
                            and r["mine_prob"] > best_prob
                        ):
                            best_tif  = tif
                            best_prob = r["mine_prob"]
                            best_tile = r["tile"]

                    if best_tif and best_tile:
                        mask_arr = seg_masks.get(best_tile)
                        b64      = make_thumbnail(best_tif, verdict, size=400, mask_arr=mask_arr)
                        patches[mine_id] = {
                            "b64":     b64,
                            "verdict": verdict,
                            "prob":    best_prob,
                        }
                except Exception as e:
                    logger.error(f"Patch build error mine {mine_id}: {e}")

        # ── Cross-reference user_verified_mines ──────────────────
        try:
            conn = get_api_db()
            if conn:
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cur.execute(
                    "SELECT mine_id, ST_AsGeoJSON(geom)::json AS geojson FROM user_verified_mines"
                )
                verified_shapes = []
                for vr in cur.fetchall():
                    try:
                        verified_shapes.append(shp(vr["geojson"]))
                    except Exception:
                        pass
                cur.close()
                conn.close()

                for feat in features:
                    try:
                        det_shape = shp(feat["geometry"])
                        for vs in verified_shapes:
                            if det_shape.intersects(vs):
                                feat["properties"]["verdict"] = "USER_LEGAL"
                                mid = feat["properties"].get("mine_id")
                                if mid in patches:
                                    patches[mid]["verdict"] = "USER_LEGAL"
                                break
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Verified mines cross-ref error: {e}")

        # ── Stats ─────────────────────────────────────────────────
        stats = {"total": len(features), "illegal": 0, "suspect": 0, "legal": 0}
        for f in features:
            v = f.get("properties", {}).get("verdict", "UNVERIFIED")
            if v == "ILLEGAL":
                stats["illegal"] += 1
            elif v == "SUSPECT":
                stats["suspect"] += 1
            elif v in ("LEGAL", "USER_LEGAL"):
                stats["legal"] += 1

        return {
            "status":  "success",
            "stats":   stats,
            "data":    out_gj,
            "patches": patches,
        }

    except Exception as e:
        logger.error(f"Detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

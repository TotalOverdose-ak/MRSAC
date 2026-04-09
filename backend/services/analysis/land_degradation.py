# ================================================================
#  LAND DEGRADATION ANALYSIS — BSI / NDVI Spectral Indices
#  Compares two time periods to detect land degradation
# ================================================================

import ee
import logging
from .gee_utils import (
    init_gee, get_s2_composite,
    safe_get_info, get_map_tiles, calc_area_km2
)

logger = logging.getLogger(__name__)


def compute_indices(composite):
    """
    Compute degradation-related spectral indices.

    BSI  = ((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))
    NDVI = (NIR - RED) / (NIR + RED)
    NDWI = (GREEN - NIR) / (GREEN + NIR)
    SAVI = ((NIR - RED) / (NIR + RED + L)) * (1 + L), L=0.5
    """
    nir = composite.select('B8')
    red = composite.select('B4')
    green = composite.select('B3')
    blue = composite.select('B2')
    swir = composite.select('B11')

    ndvi = nir.subtract(red).divide(nir.add(red).max(0.001)).rename('NDVI')
    bsi = (swir.add(red).subtract(nir.add(blue))).divide(
        swir.add(red).add(nir).add(blue).max(0.001)
    ).rename('BSI')
    ndwi = green.subtract(nir).divide(green.add(nir).max(0.001)).rename('NDWI')

    L = 0.5
    savi = nir.subtract(red).divide(nir.add(red).add(L)).multiply(1 + L).rename('SAVI')

    return ndvi.addBands(bsi).addBands(ndwi).addBands(savi)


def analyze_degradation(geojson_geom, baseline_year, compare_year):
    """
    Analyze land degradation by comparing spectral indices between two years.

    Classification:
        - Severe Degradation:  NDVI dropped > 0.2 AND BSI increased > 0.1
        - Moderate Degradation: NDVI dropped > 0.1
        - Stable:               Minimal change
        - Improved:             NDVI increased > 0.1

    Returns dict with tiles, stats, index values, yearly_trend
    """
    init_gee()

    # Validate years
    if compare_year <= baseline_year:
        raise ValueError(f"Compare year ({compare_year}) must be greater than baseline year ({baseline_year})")

    region = ee.Geometry(geojson_geom)

    # Get composites
    comp_base = get_s2_composite(region, baseline_year)
    comp_now = get_s2_composite(region, compare_year)

    # Compute indices
    idx_base = compute_indices(comp_base)
    idx_now = compute_indices(comp_now)

    # Differences
    ndvi_diff = idx_now.select('NDVI').subtract(idx_base.select('NDVI')).rename('NDVI_diff')
    bsi_diff = idx_now.select('BSI').subtract(idx_base.select('BSI')).rename('BSI_diff')
    savi_diff = idx_now.select('SAVI').subtract(idx_base.select('SAVI')).rename('SAVI_diff')

    # Classification
    # 1 = Severe, 2 = Moderate, 3 = Stable, 4 = Improved
    degradation = ee.Image(3)  # default stable

    severe = ndvi_diff.lt(-0.2).And(bsi_diff.gt(0.1))
    moderate = ndvi_diff.lt(-0.1).And(severe.Not())
    improved = ndvi_diff.gt(0.1)

    degradation = (degradation
                   .where(severe, 1)
                   .where(moderate, 2)
                   .where(improved, 4)
                   .rename('degradation'))

    # Area calculations
    severe_area = calc_area_km2(degradation.eq(1), region)
    moderate_area = calc_area_km2(degradation.eq(2), region)
    stable_area = calc_area_km2(degradation.eq(3), region)
    improved_area = calc_area_km2(degradation.eq(4), region)

    # Mean index values
    mean_indices_base = idx_base.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e10
    )
    mean_indices_now = idx_now.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e10
    )

    mean_base_info = safe_get_info(mean_indices_base, {})
    mean_now_info = safe_get_info(mean_indices_now, {})

    stats = {
        'baseline_year': baseline_year,
        'compare_year': compare_year,
        'severe_km2': round(safe_get_info(severe_area.get('degradation'), 0), 2),
        'moderate_km2': round(safe_get_info(moderate_area.get('degradation'), 0), 2),
        'stable_km2': round(safe_get_info(stable_area.get('degradation'), 0), 2),
        'improved_km2': round(safe_get_info(improved_area.get('degradation'), 0), 2),
        'ndvi_baseline': round((mean_base_info.get('NDVI', 0) or 0), 3),
        'ndvi_current': round((mean_now_info.get('NDVI', 0) or 0), 3),
        'bsi_baseline': round((mean_base_info.get('BSI', 0) or 0), 3),
        'bsi_current': round((mean_now_info.get('BSI', 0) or 0), 3),
        'savi_baseline': round((mean_base_info.get('SAVI', 0) or 0), 3),
        'savi_current': round((mean_now_info.get('SAVI', 0) or 0), 3),
    }

    # ── YEARLY NDVI/BSI TREND ───────────────────────────────────
    yearly_trend = []
    pixel_area = ee.Image.pixelArea().divide(1e6)
    for yr in range(baseline_year, compare_year + 1):
        try:
            comp_yr = get_s2_composite(region, yr)
            idx_yr = compute_indices(comp_yr)
            means = idx_yr.reduceRegion(
                reducer=ee.Reducer.mean(), geometry=region, scale=30, maxPixels=1e10
            )
            means_info = safe_get_info(means, {})
            yearly_trend.append({
                'year': yr,
                'ndvi': round((means_info.get('NDVI', 0) or 0), 3),
                'bsi': round((means_info.get('BSI', 0) or 0), 3),
            })
        except Exception as e:
            logger.warning(f"Failed to compute trend for year {yr}: {e}")
            yearly_trend.append({'year': yr, 'ndvi': 0, 'bsi': 0})

    # ── MAP TILES ───────────────────────────────────────────────
    deg_vis = degradation.visualize(
        min=1, max=4,
        palette=['#ff3d5a', '#f5a623', '#4a5e72', '#00c48c']
    )
    ndvi_diff_vis = ndvi_diff.visualize(
        min=-0.5, max=0.5,
        palette=['#ff3d5a', '#f5a623', '#ffffcc', '#90ee90', '#00c48c']
    )
    bsi_now_vis = idx_now.select('BSI').visualize(
        min=-0.2, max=0.4,
        palette=['#00c48c', '#90ee90', '#ffffcc', '#f5a623', '#ff3d5a']
    )
    savi_diff_vis = savi_diff.visualize(
        min=-0.3, max=0.3,
        palette=['#ff3d5a', '#f5a623', '#ffffcc', '#90ee90', '#00c48c']
    )

    deg_tile_url = get_map_tiles(deg_vis)
    ndvi_diff_tile_url = get_map_tiles(ndvi_diff_vis)
    bsi_tile_url = get_map_tiles(bsi_now_vis)
    savi_diff_tile_url = get_map_tiles(savi_diff_vis)

    if not deg_tile_url:
        raise RuntimeError("Failed to generate degradation map tiles from GEE.")

    return {
        'stats': stats,
        'yearly_trend': yearly_trend,
        'degradation_tiles': deg_tile_url,
        'ndvi_diff_tiles': ndvi_diff_tile_url,
        'bsi_tiles': bsi_tile_url,
        'savi_diff_tiles': savi_diff_tile_url,
    }

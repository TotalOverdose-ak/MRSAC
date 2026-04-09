# ================================================================
#  SNOW & ICE COVER MAPPING
#  Landsat 8/9 NDSI-based snow detection via GEE
#  Reference: tracking-snow-and-ice-in-gee-main
# ================================================================

import ee
import logging
from .gee_utils import init_gee, safe_get_info, get_map_tiles

logger = logging.getLogger(__name__)

# ── CONSTANTS ──────────────────────────────────────────────────
NDSI_THRESHOLD = 0.4   # Standard snow threshold
AREA_SCALE = 200       # Memory-safe area calculation resolution


def _cloud_mask_oli(image):
    """Cloud mask for Landsat 8/9 OLI using QA_PIXEL band."""
    qa = image.select('QA_PIXEL')
    dilated = 1 << 1
    cirrus = 1 << 2
    cloud = 1 << 3
    shadow = 1 << 4
    mask = (qa.bitwiseAnd(dilated).eq(0)
            .And(qa.bitwiseAnd(cirrus).eq(0))
            .And(qa.bitwiseAnd(cloud).eq(0))
            .And(qa.bitwiseAnd(shadow).eq(0)))
    return (image
            .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'],
                    ['B2', 'B3', 'B4', 'B5', 'B6', 'B7'])
            .updateMask(mask))


def _get_landsat89_composite(region, year):
    """Get cloud-free Landsat 8+9 composite for a given year."""
    l8 = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
          .filterBounds(region)
          .filterDate(f'{year}-01-01', f'{year}-12-31'))
    l9 = (ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
          .filterBounds(region)
          .filterDate(f'{year}-01-01', f'{year}-12-31'))
    merged = l8.merge(l9).map(_cloud_mask_oli)
    return merged.median().clip(region)


def analyze_snow_cover(geojson_geom, year=2024):
    """
    Snow & Ice cover mapping using Landsat 8/9 NDSI.

    NDSI = (Green - SWIR1) / (Green + SWIR1)
    Snow threshold: NDSI > 0.4

    Returns dict with stats, map tiles, and optional trend data.
    """
    print("[SNOW] ━━━ Starting Snow & Ice Cover analysis ━━━")
    init_gee()
    print("[SNOW] ✓ GEE initialized")

    region = ee.Geometry(geojson_geom)

    # Get Landsat 8/9 composite
    print(f"[SNOW] → Fetching Landsat 8/9 imagery for {year}...")
    composite = _get_landsat89_composite(region, year)

    # Calculate NDSI = (Green - SWIR1) / (Green + SWIR1)
    # Landsat 8/9: B3 = Green, B6 = SWIR1
    print("[SNOW] → Computing NDSI...")
    ndsi = composite.normalizedDifference(['B3', 'B6']).rename('NDSI')

    # Binary snow mask (NDSI > 0.4)
    snow_mask = ndsi.gt(NDSI_THRESHOLD).rename('snow')

    # ── AREA CALCULATIONS ──────────────────────────────────────
    print("[SNOW] → Calculating snow-covered area...")
    pixel_area = ee.Image.pixelArea().divide(1e6)

    snow_area_img = snow_mask.multiply(pixel_area).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=region,
        scale=AREA_SCALE, maxPixels=1e9
    )
    snow_area = safe_get_info(snow_area_img.get('snow'), 0)

    total_area_img = ee.Image(1).multiply(pixel_area).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=region,
        scale=AREA_SCALE, maxPixels=1e9
    )
    total_area = safe_get_info(total_area_img.get('constant'), 0)
    non_snow_area = total_area - snow_area
    coverage_pct = round((snow_area / max(total_area, 0.001)) * 100, 1)

    # NDSI statistics
    ndsi_stats = ndsi.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True),
        geometry=region, scale=AREA_SCALE, maxPixels=1e9
    )
    ndsi_mean = safe_get_info(ndsi_stats.get('NDSI_mean'), 0)
    ndsi_std = safe_get_info(ndsi_stats.get('NDSI_stdDev'), 0)

    print(f"[SNOW]   Snow Area: {snow_area:.2f} km²")
    print(f"[SNOW]   Non-Snow Area: {non_snow_area:.2f} km²")
    print(f"[SNOW]   Snow Coverage: {coverage_pct}%")
    print(f"[SNOW]   Mean NDSI: {ndsi_mean:.3f} ± {ndsi_std:.3f}")

    stats = {
        'year': year,
        'snow_area_km2': round(snow_area, 2),
        'non_snow_area_km2': round(non_snow_area, 2),
        'total_area_km2': round(total_area, 2),
        'snow_coverage_pct': coverage_pct,
        'ndsi_mean': round(ndsi_mean, 3) if ndsi_mean else 0,
        'ndsi_std': round(ndsi_std, 3) if ndsi_std else 0,
    }

    # ── MAP TILES ──────────────────────────────────────────────
    print("[SNOW] → Generating map tiles...")

    # True Color RGB (B4=Red, B3=Green, B2=Blue)
    rgb_vis = composite.select(['B4', 'B3', 'B2']).visualize(
        min=5000, max=20000)
    rgb_tiles = get_map_tiles(rgb_vis)
    print("[SNOW]   ✓ rgb_tiles")

    # NDSI heatmap
    ndsi_vis = ndsi.visualize(
        min=-0.5, max=1,
        palette=['#8B4513', '#D2691E', '#808080', '#C0C0C0',
                 '#E0E0E0', '#FFFFFF', '#87CEEB'])
    ndsi_tiles = get_map_tiles(ndsi_vis)
    print("[SNOW]   ✓ ndsi_tiles")

    # Snow binary mask
    snow_vis = snow_mask.selfMask().visualize(
        min=0, max=1, palette=['#00bfff'])
    snow_tiles = get_map_tiles(snow_vis)
    print("[SNOW]   ✓ snow_tiles")

    print("[SNOW] ━━━ Analysis complete! ━━━")

    return {
        'stats': stats,
        'rgb_tiles': rgb_tiles,
        'ndsi_tiles': ndsi_tiles,
        'snow_tiles': snow_tiles,
    }


def get_snow_trend(geojson_geom, start_year=2014, end_year=2025):
    """
    Calculate snow-covered area for each year for a multi-year trend chart.
    Uses Landsat 8/9 (available from 2014+).
    """
    print(f"[SNOW] → Computing multi-year trend ({start_year}-{end_year})...")
    init_gee()
    region = ee.Geometry(geojson_geom)

    trend = []
    for yr in range(start_year, end_year + 1):
        try:
            composite = _get_landsat89_composite(region, yr)
            ndsi = composite.normalizedDifference(['B3', 'B6']).rename('NDSI')
            snow_mask = ndsi.gt(NDSI_THRESHOLD).rename('snow')

            pixel_area = ee.Image.pixelArea().divide(1e6)
            snow_area_val = safe_get_info(
                snow_mask.multiply(pixel_area).reduceRegion(
                    reducer=ee.Reducer.sum(), geometry=region,
                    scale=AREA_SCALE, maxPixels=1e9
                ).get('snow'), 0
            )
            trend.append({'year': yr, 'area_km2': round(snow_area_val, 2)})
            print(f"[SNOW]   {yr}: {snow_area_val:.2f} km²")
        except Exception as e:
            logger.warning(f"Snow trend failed for {yr}: {e}")
            trend.append({'year': yr, 'area_km2': 0})

    print(f"[SNOW] ✓ Trend data computed for {len(trend)} years")
    return trend

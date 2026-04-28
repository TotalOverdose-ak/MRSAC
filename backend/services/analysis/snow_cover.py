# ================================================================
#  SNOW & ICE COVER MAPPING — Enhanced Edition
#  Landsat 8/9 NDSI + SRTM DEM Elevation Analysis via GEE
#  Features: Fractional Snow Cover, Elevation Zones, Snow Line Altitude
# ================================================================

import ee
import logging
from .gee_utils import init_gee, safe_get_info, get_map_tiles

logger = logging.getLogger(__name__)

# ── CONSTANTS ──────────────────────────────────────────────────
NDSI_THRESHOLD = 0.4   # Standard snow threshold
AREA_SCALE = 200       # Memory-safe area calculation resolution

# Elevation zone boundaries (meters)
ELEVATION_ZONES = [
    (0, 1000, "0–1,000m", "#4ade80"),
    (1000, 2000, "1,000–2,000m", "#22d3ee"),
    (2000, 3000, "2,000–3,000m", "#818cf8"),
    (3000, 4000, "3,000–4,000m", "#c084fc"),
    (4000, 5000, "4,000–5,000m", "#f472b6"),
    (5000, 9000, "5,000m+", "#f43f5e"),
]


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


def _compute_elevation_zones(snow_mask, ndsi, region):
    """
    Compute snow coverage per elevation zone using SRTM DEM.
    Returns elevation zone breakdown + snow line altitude.
    """
    dem = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(region)
    pixel_area = ee.Image.pixelArea().divide(1e6)  # km²

    zones = []
    for low, high, label, color in ELEVATION_ZONES:
        zone_mask = dem.gte(low).And(dem.lt(high))
        
        # Total area in this zone
        zone_area = safe_get_info(
            zone_mask.multiply(pixel_area).reduceRegion(
                reducer=ee.Reducer.sum(), geometry=region,
                scale=AREA_SCALE, maxPixels=1e9
            ).get('elevation'), 0
        )
        
        if zone_area <= 0:
            continue
        
        # Snow area in this zone
        snow_in_zone = snow_mask.And(zone_mask)
        snow_zone_area = safe_get_info(
            snow_in_zone.multiply(pixel_area).reduceRegion(
                reducer=ee.Reducer.sum(), geometry=region,
                scale=AREA_SCALE, maxPixels=1e9
            ).get('snow'), 0
        )
        
        # Mean NDSI in this zone
        ndsi_in_zone = ndsi.updateMask(zone_mask)
        zone_ndsi_mean = safe_get_info(
            ndsi_in_zone.reduceRegion(
                reducer=ee.Reducer.mean(), geometry=region,
                scale=AREA_SCALE, maxPixels=1e9
            ).get('NDSI'), 0
        )
        
        snow_pct = round((snow_zone_area / max(zone_area, 0.001)) * 100, 1)
        
        zones.append({
            'label': label,
            'color': color,
            'elevation_range': [low, high],
            'total_area_km2': round(zone_area, 2),
            'snow_area_km2': round(snow_zone_area, 2),
            'snow_coverage_pct': snow_pct,
            'mean_ndsi': round(zone_ndsi_mean, 3) if zone_ndsi_mean else 0,
        })
    
    return zones


def _compute_snow_line_altitude(snow_mask, region):
    """
    Compute Snow Line Altitude — the lowest elevation where persistent snow exists.
    Uses 10th percentile of snow-covered elevations for robustness.
    """
    dem = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(region)
    
    # Get elevations only where snow is present
    snow_elevation = dem.updateMask(snow_mask)
    
    # 10th percentile = approximate snow line (lower bound of snow)
    sla_stats = snow_elevation.reduceRegion(
        reducer=ee.Reducer.percentile([10, 50, 90]).combine(
            ee.Reducer.minMax(), sharedInputs=True
        ),
        geometry=region, scale=AREA_SCALE, maxPixels=1e9
    )
    
    sla_p10 = safe_get_info(sla_stats.get('elevation_p10'), None)
    sla_median = safe_get_info(sla_stats.get('elevation_p50'), None)
    sla_p90 = safe_get_info(sla_stats.get('elevation_p90'), None)
    sla_min = safe_get_info(sla_stats.get('elevation_min'), None)
    sla_max = safe_get_info(sla_stats.get('elevation_max'), None)
    
    return {
        'snow_line_altitude_m': round(sla_p10) if sla_p10 is not None else None,
        'median_snow_elevation_m': round(sla_median) if sla_median is not None else None,
        'highest_snow_m': round(sla_p90) if sla_p90 is not None else None,
        'min_snow_elevation_m': round(sla_min) if sla_min is not None else None,
        'max_snow_elevation_m': round(sla_max) if sla_max is not None else None,
    }


def _compute_elevation_stats(region):
    """Compute basic elevation statistics for the AOI."""
    dem = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(region)
    
    elev_stats = dem.reduceRegion(
        reducer=ee.Reducer.mean().combine(
            ee.Reducer.minMax(), sharedInputs=True
        ).combine(ee.Reducer.stdDev(), sharedInputs=True),
        geometry=region, scale=AREA_SCALE, maxPixels=1e9
    )
    
    return {
        'mean_elevation_m': round(safe_get_info(elev_stats.get('elevation_mean'), 0)),
        'min_elevation_m': round(safe_get_info(elev_stats.get('elevation_min'), 0)),
        'max_elevation_m': round(safe_get_info(elev_stats.get('elevation_max'), 0)),
        'std_elevation_m': round(safe_get_info(elev_stats.get('elevation_stdDev'), 0)),
    }


def analyze_snow_cover(geojson_geom, year=2024):
    """
    Snow & Ice cover mapping using Landsat 8/9 NDSI + SRTM DEM.

    Enhanced Features:
    - NDSI thresholding (>0.4) + Fractional Snow Cover
    - Elevation zone analysis via SRTM DEM
    - Snow Line Altitude (SLA) calculation
    - 4 map tile layers (RGB, NDSI, Snow Mask, Fractional Snow Cover)

    Returns dict with stats, map tiles, elevation data.
    """
    print("[SNOW] ━━━ Starting Enhanced Snow & Ice Cover Analysis ━━━")
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

    # Fractional Snow Cover (linear scaling: NDSI 0→0%, NDSI 0.6→100%)
    # Clamped between 0 and 100
    fsc = ndsi.subtract(0.0).divide(0.6).multiply(100).clamp(0, 100).rename('fsc')

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
        reducer=ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True)
            .combine(ee.Reducer.percentile([25, 50, 75]), sharedInputs=True),
        geometry=region, scale=AREA_SCALE, maxPixels=1e9
    )
    ndsi_mean = safe_get_info(ndsi_stats.get('NDSI_mean'), 0)
    ndsi_std = safe_get_info(ndsi_stats.get('NDSI_stdDev'), 0)
    ndsi_p25 = safe_get_info(ndsi_stats.get('NDSI_p25'), 0)
    ndsi_median = safe_get_info(ndsi_stats.get('NDSI_p50'), 0)
    ndsi_p75 = safe_get_info(ndsi_stats.get('NDSI_p75'), 0)

    # Mean Fractional Snow Cover
    fsc_stats = fsc.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=region,
        scale=AREA_SCALE, maxPixels=1e9
    )
    mean_fsc = safe_get_info(fsc_stats.get('fsc'), 0)

    print(f"[SNOW]   Snow Area: {snow_area:.2f} km²")
    print(f"[SNOW]   Non-Snow Area: {non_snow_area:.2f} km²")
    print(f"[SNOW]   Snow Coverage: {coverage_pct}%")
    print(f"[SNOW]   Mean NDSI: {ndsi_mean:.3f} ± {ndsi_std:.3f}")
    print(f"[SNOW]   Mean Fractional Snow Cover: {mean_fsc:.1f}%")

    stats = {
        'year': year,
        'snow_area_km2': round(snow_area, 2),
        'non_snow_area_km2': round(non_snow_area, 2),
        'total_area_km2': round(total_area, 2),
        'snow_coverage_pct': coverage_pct,
        'ndsi_mean': round(ndsi_mean, 3) if ndsi_mean else 0,
        'ndsi_std': round(ndsi_std, 3) if ndsi_std else 0,
        'ndsi_p25': round(ndsi_p25, 3) if ndsi_p25 else 0,
        'ndsi_median': round(ndsi_median, 3) if ndsi_median else 0,
        'ndsi_p75': round(ndsi_p75, 3) if ndsi_p75 else 0,
        'mean_fractional_snow_cover_pct': round(mean_fsc, 1) if mean_fsc else 0,
    }

    # ── ELEVATION ANALYSIS ────────────────────────────────────
    print("[SNOW] → Computing elevation zone analysis (SRTM DEM)...")
    elevation_zones = _compute_elevation_zones(snow_mask, ndsi, region)
    print(f"[SNOW]   ✓ {len(elevation_zones)} elevation zones analyzed")

    print("[SNOW] → Computing snow line altitude...")
    snow_line = _compute_snow_line_altitude(snow_mask, region)
    if snow_line['snow_line_altitude_m']:
        print(f"[SNOW]   ✓ Snow Line Altitude: {snow_line['snow_line_altitude_m']}m")
    else:
        print("[SNOW]   ⚠ No snow detected — SLA unavailable")

    print("[SNOW] → Computing AOI elevation statistics...")
    elevation_stats = _compute_elevation_stats(region)
    print(f"[SNOW]   ✓ Elevation: {elevation_stats['min_elevation_m']}m – {elevation_stats['max_elevation_m']}m")

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

    # Fractional Snow Cover heatmap
    fsc_vis = fsc.visualize(
        min=0, max=100,
        palette=['#1e293b', '#334155', '#475569', '#60a5fa',
                 '#38bdf8', '#22d3ee', '#a5f3fc', '#ffffff'])
    fsc_tiles = get_map_tiles(fsc_vis)
    print("[SNOW]   ✓ fsc_tiles (fractional snow cover)")

    print("[SNOW] ━━━ Enhanced Analysis Complete! ━━━")

    return {
        'stats': stats,
        'rgb_tiles': rgb_tiles,
        'ndsi_tiles': ndsi_tiles,
        'snow_tiles': snow_tiles,
        'fsc_tiles': fsc_tiles,
        'elevation_zones': elevation_zones,
        'snow_line': snow_line,
        'elevation_stats': elevation_stats,
    }


def get_snow_trend(geojson_geom, start_year=2014, end_year=2025):
    """
    Calculate snow-covered area + snow line altitude for each year
    for a multi-year trend chart.
    Uses Landsat 8/9 (available from 2014+).
    """
    print(f"[SNOW] → Computing multi-year trend ({start_year}-{end_year})...")
    init_gee()
    region = ee.Geometry(geojson_geom)
    dem = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(region)

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

            # Snow Line Altitude per year (10th percentile)
            snow_elev = dem.updateMask(snow_mask)
            sla_val = safe_get_info(
                snow_elev.reduceRegion(
                    reducer=ee.Reducer.percentile([10]),
                    geometry=region, scale=AREA_SCALE, maxPixels=1e9
                ).get('elevation'), None
            )

            # Mean NDSI per year
            mean_ndsi = safe_get_info(
                ndsi.reduceRegion(
                    reducer=ee.Reducer.mean(), geometry=region,
                    scale=AREA_SCALE, maxPixels=1e9
                ).get('NDSI'), 0
            )

            trend.append({
                'year': yr,
                'area_km2': round(snow_area_val, 2),
                'snow_line_altitude_m': round(sla_val) if sla_val is not None else None,
                'mean_ndsi': round(mean_ndsi, 3) if mean_ndsi else 0,
            })
            sla_str = f", SLA: {round(sla_val)}m" if sla_val else ""
            print(f"[SNOW]   {yr}: {snow_area_val:.2f} km²{sla_str}")
        except Exception as e:
            logger.warning(f"Snow trend failed for {yr}: {e}")
            trend.append({'year': yr, 'area_km2': 0, 'snow_line_altitude_m': None, 'mean_ndsi': 0})

    print(f"[SNOW] ✓ Trend data computed for {len(trend)} years")
    return trend


# ── SEASONAL SNOW METRICS ─────────────────────────────────────
SEASONS = {
    'winter': (12, 2, 'Winter (Dec–Feb)'),
    'spring': (3, 5, 'Spring (Mar–May)'),
    'summer': (6, 8, 'Summer (Jun–Aug)'),
    'autumn': (9, 11, 'Autumn (Sep–Nov)'),
}


def get_seasonal_snow(geojson_geom, year=2024):
    """
    Compute snow coverage for each season within a year.
    Returns seasonal breakdown with area and coverage per season.
    """
    print(f"[SNOW] → Computing seasonal snow metrics for {year}...")
    init_gee()
    region = ee.Geometry(geojson_geom)
    pixel_area = ee.Image.pixelArea().divide(1e6)

    # Total AOI area
    total_area = safe_get_info(
        ee.Image(1).multiply(pixel_area).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region,
            scale=AREA_SCALE, maxPixels=1e9
        ).get('constant'), 0
    )

    seasons = []
    for key, (start_m, end_m, label) in SEASONS.items():
        try:
            # Handle winter spanning year boundary
            if key == 'winter':
                start_date = f'{year - 1}-12-01'
                end_date = f'{year}-02-28'
            else:
                start_date = f'{year}-{start_m:02d}-01'
                end_day = 31 if end_m in (1, 3, 5, 7, 8, 10, 12) else 30
                end_date = f'{year}-{end_m:02d}-{end_day}'

            l8 = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                  .filterBounds(region).filterDate(start_date, end_date))
            l9 = (ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
                  .filterBounds(region).filterDate(start_date, end_date))
            composite = l8.merge(l9).map(_cloud_mask_oli).median().clip(region)

            ndsi = composite.normalizedDifference(['B3', 'B6']).rename('NDSI')
            snow_mask = ndsi.gt(NDSI_THRESHOLD).rename('snow')

            snow_area = safe_get_info(
                snow_mask.multiply(pixel_area).reduceRegion(
                    reducer=ee.Reducer.sum(), geometry=region,
                    scale=AREA_SCALE, maxPixels=1e9
                ).get('snow'), 0
            )

            seasons.append({
                'season': key,
                'label': label,
                'snow_area_km2': round(snow_area, 2),
                'snow_coverage_pct': round((snow_area / max(total_area, 0.001)) * 100, 1),
            })
            print(f"[SNOW]   {label}: {snow_area:.2f} km²")
        except Exception as e:
            logger.warning(f"Seasonal snow failed for {key}: {e}")
            seasons.append({'season': key, 'label': label, 'snow_area_km2': 0, 'snow_coverage_pct': 0})

    print(f"[SNOW] ✓ Seasonal metrics computed")
    return seasons


def get_snow_persistence(geojson_geom, year=2024):
    """
    Compute snow persistence using MODIS MOD10A1 daily snow cover.
    Returns: number of snow-covered days per pixel (as map tiles) + summary stats.
    MODIS NDSI_Snow_Cover band: 0-100 = fractional snow cover.
    """
    print(f"[SNOW] → Computing snow persistence (MODIS daily) for {year}...")
    init_gee()
    region = ee.Geometry(geojson_geom)

    # MODIS MOD10A1 daily snow cover
    modis = (ee.ImageCollection('MODIS/061/MOD10A1')
             .filterBounds(region)
             .filterDate(f'{year}-01-01', f'{year}-12-31')
             .select('NDSI_Snow_Cover'))

    image_count = safe_get_info(modis.size(), 0)
    print(f"[SNOW]   Found {image_count} MODIS daily images")

    if image_count == 0:
        return {'snow_days_tiles': None, 'stats': {'mean_snow_days': 0, 'max_snow_days': 0, 'total_images': 0}}

    # Create binary snow mask for each image (NDSI_Snow_Cover > 10%)
    def _to_snow_binary(img):
        return img.gt(10).rename('snow_day').copyProperties(img, ['system:time_start'])

    snow_binary = modis.map(_to_snow_binary)

    # Sum all binary masks = number of snow-covered days per pixel
    snow_days = snow_binary.sum().clip(region).rename('snow_days')

    # Stats
    days_stats = snow_days.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True)
            .combine(ee.Reducer.percentile([50, 90]), sharedInputs=True),
        geometry=region, scale=500, maxPixels=1e9
    )

    mean_days = safe_get_info(days_stats.get('snow_days_mean'), 0)
    max_days = safe_get_info(days_stats.get('snow_days_max'), 0)
    median_days = safe_get_info(days_stats.get('snow_days_p50'), 0)
    p90_days = safe_get_info(days_stats.get('snow_days_p90'), 0)

    print(f"[SNOW]   Mean snow days: {mean_days:.0f}, Max: {max_days:.0f}")

    # Map tiles — snow persistence heatmap
    snow_days_vis = snow_days.visualize(
        min=0, max=min(max(max_days, 30), 365),
        palette=['#1e293b', '#312e81', '#4338ca', '#6366f1',
                 '#818cf8', '#a78bfa', '#c084fc', '#e879f9',
                 '#f472b6', '#fb7185', '#f43f5e', '#ffffff'])
    snow_days_tiles = get_map_tiles(snow_days_vis)

    print(f"[SNOW] ✓ Snow persistence computed")
    return {
        'snow_days_tiles': snow_days_tiles,
        'stats': {
            'mean_snow_days': round(mean_days),
            'max_snow_days': round(max_days),
            'median_snow_days': round(median_days),
            'p90_snow_days': round(p90_days),
            'total_images': image_count,
            'year': year,
        }
    }

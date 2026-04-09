# ================================================================
#  FOREST FIRE — Burn Severity Analysis (dNBR)
#  Uses Sentinel-2 SR Harmonized imagery from GEE
#  Computes Normalized Burn Ratio change (dNBR) for fire mapping
# ================================================================

import ee
import logging
from .gee_utils import init_gee, safe_get_info, get_map_tiles

logger = logging.getLogger(__name__)

# USGS Burn Severity Classification thresholds
SEVERITY_CLASSES = {
    'unburned':  {'min': -0.50, 'max': 0.10, 'color': '#1a9850', 'label': 'Unburned / Regrowth'},
    'low':       {'min': 0.10,  'max': 0.27, 'color': '#fee08b', 'label': 'Low Severity'},
    'moderate':  {'min': 0.27,  'max': 0.66, 'color': '#fc8d59', 'label': 'Moderate Severity'},
    'high':      {'min': 0.66,  'max': 1.30, 'color': '#d73027', 'label': 'High Severity'},
}


def _mask_s2_clouds(image):
    """Mask clouds using the Sentinel-2 QA60 band."""
    qa = image.select('QA60')
    cloud_bit = 1 << 10
    cirrus_bit = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))
    return image.updateMask(mask).divide(10000)


def analyze_burn_severity(geojson_geom, pre_start, pre_end, post_start, post_end):
    """
    Burn severity analysis using Sentinel-2 dNBR (delta Normalized Burn Ratio).

    Args:
        geojson_geom: GeoJSON dict of the AOI polygon
        pre_start/pre_end: Pre-fire date range (str, 'YYYY-MM-DD')
        post_start/post_end: Post-fire date range (str, 'YYYY-MM-DD')

    Returns:
        dict with tiles (pre-RGB, post-RGB, dNBR severity mask) and stats
    """
    print(f'\n[FIRE] ━━━ Starting Burn Severity analysis ━━━')
    init_gee()
    print(f'[FIRE] ✓ GEE initialized')

    region = ee.Geometry(geojson_geom)
    print(f'[FIRE] → Pre-fire: {pre_start} to {pre_end}')
    print(f'[FIRE] → Post-fire: {post_start} to {post_end}')

    # ── SENTINEL-2 COMPOSITES ─────────────────────────────────
    print(f'[FIRE] → Fetching Sentinel-2 pre-fire imagery...')
    s2_pre = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
              .filterDate(pre_start, pre_end)
              .filterBounds(region)
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(_mask_s2_clouds)
              .median()
              .clip(region))

    pre_count = safe_get_info(
        ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(pre_start, pre_end)
        .filterBounds(region)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .size(), 0)
    print(f'[FIRE]   Pre-fire images: {pre_count}')

    print(f'[FIRE] → Fetching Sentinel-2 post-fire imagery...')
    s2_post = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
               .filterDate(post_start, post_end)
               .filterBounds(region)
               .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
               .map(_mask_s2_clouds)
               .median()
               .clip(region))

    post_count = safe_get_info(
        ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(post_start, post_end)
        .filterBounds(region)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .size(), 0)
    print(f'[FIRE]   Post-fire images: {post_count}')

    # ── NBR COMPUTATION ───────────────────────────────────────
    # NBR = (NIR - SWIR2) / (NIR + SWIR2)  → Sentinel-2: (B8 - B12) / (B8 + B12)
    print(f'[FIRE] → Computing NBR and dNBR...')
    nbr_pre = s2_pre.normalizedDifference(['B8', 'B12']).rename('NBR')
    nbr_post = s2_post.normalizedDifference(['B8', 'B12']).rename('NBR')

    # dNBR = Pre-fire NBR - Post-fire NBR
    dnbr = nbr_pre.subtract(nbr_post).rename('dNBR')

    # ── WATER MASKING ─────────────────────────────────────────
    # Mask out permanent water bodies using Dynamic World
    print(f'[FIRE] → Masking water bodies...')
    water_mask = (ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
                  .filterDate(pre_start, post_end)
                  .filterBounds(region)
                  .select('label')
                  .mode()
                  .neq(0)
                  .clip(region))
    dnbr = dnbr.updateMask(water_mask)

    # ── SEVERITY CLASSIFICATION ───────────────────────────────
    print(f'[FIRE] → Classifying burn severity...')
    pixel_area = ee.Image.pixelArea().divide(10000)  # hectares

    severity_areas = {}
    for key, cls in SEVERITY_CLASSES.items():
        if key == 'unburned':
            continue  # don't compute area for unburned
        mask = dnbr.gte(cls['min']).And(dnbr.lt(cls['max']))
        area = safe_get_info(
            mask.multiply(pixel_area)
            .reduceRegion(reducer=ee.Reducer.sum(), geometry=region,
                          scale=20, maxPixels=1e10)
            .get('dNBR'), 0
        )
        area_ha = round(float(area or 0.0), 2)
        severity_areas[key] = area_ha
        print(f'[FIRE]   {cls["label"]}: {area_ha} ha')

    total_burned = round(sum(severity_areas.values()), 2)
    print(f'[FIRE]   Total Burned Area: {total_burned} ha')

    # ── STATS ─────────────────────────────────────────────────
    stats = {
        'pre_fire_period': f'{pre_start} to {pre_end}',
        'post_fire_period': f'{post_start} to {post_end}',
        'source': 'Sentinel-2 SR Harmonized (10m)',
        'pre_images': int(pre_count or 0),
        'post_images': int(post_count or 0),
        'low_severity_ha': severity_areas.get('low', 0),
        'moderate_severity_ha': severity_areas.get('moderate', 0),
        'high_severity_ha': severity_areas.get('high', 0),
        'total_burned_ha': total_burned,
    }

    # ── MAP TILES ─────────────────────────────────────────────
    print(f'[FIRE] → Generating map tiles...')

    # Pre-fire RGB
    pre_rgb = s2_pre.select(['B4', 'B3', 'B2']).visualize(
        min=0.04, max=0.24, gamma=1.0)

    # Post-fire RGB
    post_rgb = s2_post.select(['B4', 'B3', 'B2']).visualize(
        min=0.04, max=0.24, gamma=1.0)

    # dNBR severity heatmap
    severity_vis = dnbr.visualize(
        min=-0.1, max=0.66,
        palette=['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027']
    )

    # Burned area mask (dNBR > 0.1 = any burn)
    burned_mask = dnbr.gte(0.1).selfMask()
    burned_vis = burned_mask.visualize(palette=['#FF4444'])

    tiles = {}
    for name, vis in [('pre_rgb_tiles', pre_rgb),
                       ('post_rgb_tiles', post_rgb),
                       ('severity_tiles', severity_vis),
                       ('burned_mask_tiles', burned_vis)]:
        tiles[name] = get_map_tiles(vis)
        print(f'[FIRE]   ✓ {name}')

    print(f'[FIRE] ━━━ Analysis complete! ━━━\n')

    return {
        'stats': stats,
        'severity_classes': {k: {'label': v['label'], 'color': v['color']}
                             for k, v in SEVERITY_CLASSES.items()},
        **tiles,
    }

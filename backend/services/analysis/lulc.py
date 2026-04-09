# ================================================================
#  LAND USE LAND COVER (LULC) — Google Dynamic World
#  Near real-time 10m LULC classification from GEE
#  Dataset: GOOGLE/DYNAMICWORLD/V1
# ================================================================

import ee
import logging
from datetime import datetime
from .gee_utils import init_gee, safe_get_info, get_map_tiles, mask_s2_clouds

logger = logging.getLogger(__name__)

# ── DYNAMIC WORLD CLASS DEFINITIONS ────────────────────────────
# https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1
DW_CLASSES = {
    0: {'name': 'Water',              'color': '#419BDF', 'band': 'water'},
    1: {'name': 'Trees',              'color': '#397D49', 'band': 'trees'},
    2: {'name': 'Grass',              'color': '#88B053', 'band': 'grass'},
    3: {'name': 'Flooded Vegetation', 'color': '#7A87C6', 'band': 'flooded_vegetation'},
    4: {'name': 'Crops',              'color': '#E49635', 'band': 'crops'},
    5: {'name': 'Shrub & Scrub',      'color': '#DFC35A', 'band': 'shrub_and_scrub'},
    6: {'name': 'Built Area',         'color': '#C4281B', 'band': 'built'},
    7: {'name': 'Bare Ground',        'color': '#A59B8F', 'band': 'bare'},
    8: {'name': 'Snow & Ice',         'color': '#B39FE1', 'band': 'snow_and_ice'},
}


def analyze_lulc(geojson_geom, year=None, season='annual'):
    """
    Land Use Land Cover classification using Google Dynamic World.

    Dynamic World is a 10m near-real-time LULC dataset built by Google
    using a deep learning model on Sentinel-2 imagery. It provides
    per-pixel class probabilities for 9 land cover types.

    Returns dict with tiles, stats, class distribution, probability layers
    """
    print(f'\n[LULC] ━━━ Starting Dynamic World analysis ━━━')
    init_gee()
    print(f'[LULC] ✓ GEE initialized')

    if year is None:
        year = datetime.now().year - 1

    region = ee.Geometry(geojson_geom)
    print(f'[LULC] → Year: {year} | Season: {season}')

    # ── DATE RANGE ─────────────────────────────────────────────
    if season == 'dry':
        start_date, end_date = f'{year}-10-01', f'{year}-12-31'
    elif season == 'wet':
        start_date, end_date = f'{year}-06-01', f'{year}-09-30'
    elif season == 'kharif':
        start_date, end_date = f'{year}-07-01', f'{year}-10-31'
    elif season == 'rabi':
        start_date, end_date = f'{year}-11-01', f'{year+1}-03-31'
    else:  # annual
        start_date, end_date = f'{year}-01-01', f'{year}-12-31'

    # ── DYNAMIC WORLD COMPOSITE ────────────────────────────────
    print(f'[LULC] → Fetching Dynamic World collection ({start_date} to {end_date})...')
    dw_col = (ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
              .filterDate(start_date, end_date)
              .filterBounds(region))

    # Mode (most frequent class) composite
    print(f'[LULC] → Computing mode composite (most frequent class)...')
    dw_label = dw_col.select('label').mode().clip(region)
    
    # ── FIX: SALT PAN / SNOW MISCLASSIFICATION ─────────────────
    # Google Dynamic World often misclassifies extremely bright salt pans 
    # (like the Rann of Kutch) as Snow & Ice (Class 8). We remap Class 8 
    # to Class 7 (Bare Ground) for realistic mapping in non-Himalayan contexts.
    dw_label = dw_label.remap(
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
        [0, 1, 2, 3, 4, 5, 6, 7, 7]
    ).rename('label')

    # Mean probability bands for each class
    print(f'[LULC] → Computing probability bands...')
    prob_bands = [info['band'] for info in DW_CLASSES.values()]
    dw_probs = dw_col.select(prob_bands).mean().clip(region)

    # ── SENTINEL-2 RGB COMPOSITE ───────────────────────────────
    print(f'[LULC] → Fetching Sentinel-2 for RGB + indices...')
    s2_col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
              .filterDate(start_date, end_date)
              .filterBounds(region)
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(mask_s2_clouds))
    s2_composite = s2_col.median().clip(region)
    print(f'[LULC] ✓ S2 composite ready')

    # Spectral indices from S2
    nir = s2_composite.select('B8')
    red = s2_composite.select('B4')
    green = s2_composite.select('B3')
    swir1 = s2_composite.select('B11')

    ndvi = nir.subtract(red).divide(nir.add(red).max(0.001)).rename('NDVI')
    ndbi = swir1.subtract(nir).divide(swir1.add(nir).max(0.001)).rename('NDBI')
    mndwi = green.subtract(swir1).divide(green.add(swir1).max(0.001)).rename('MNDWI')

    # ── AREA PER CLASS ─────────────────────────────────────────
    print(f'[LULC] → Computing area per class (9 classes)...')
    pixel_area = ee.Image.pixelArea().divide(1e6)  # km²
    class_areas = {}
    for cls_val, cls_info in DW_CLASSES.items():
        area = safe_get_info(
            dw_label.eq(cls_val).multiply(pixel_area)
            .reduceRegion(reducer=ee.Reducer.sum(), geometry=region,
                          scale=10, maxPixels=1e10)
            .get('label'), 0
        )
        class_areas[cls_info['name']] = round(float(area), 2) if area else 0.0
        print(f'[LULC]   {cls_info["name"]}: {class_areas[cls_info["name"]]} km²')

    total_area = sum(class_areas.values())
    class_pct = {k: round(v / max(total_area, 0.01) * 100, 1)
                 for k, v in class_areas.items()}

    # Find dominant class
    dominant = max(class_areas.items(), key=lambda x: x[1]) if total_area > 0 else ('N/A', 0)

    # ── STATS ──────────────────────────────────────────────────
    img_count = safe_get_info(dw_col.size(), 0)
    stats = {
        'year': year,
        'season': season,
        'source': 'Google Dynamic World (V1)',
        'resolution': '10m',
        'total_area_km2': round(total_area, 2),
        'dominant_class': dominant[0],
        'dominant_area_km2': dominant[1],
        'class_areas_km2': class_areas,
        'class_percentages': class_pct,
        'images_used': img_count,
    }

    # ── MAP TILES ──────────────────────────────────────────────
    print(f'[LULC] → Generating map tiles...')
    # LULC classification (Dynamic World palette)
    palette = [info['color'] for info in DW_CLASSES.values()]
    lulc_vis = dw_label.visualize(min=0, max=8, palette=palette)

    # RGB composite
    rgb_vis = s2_composite.select(['B4', 'B3', 'B2']).visualize(
        min=0.04, max=0.24, gamma=1.0
    )

    # NDVI
    ndvi_vis = ndvi.visualize(
        min=-0.2, max=0.8,
        palette=['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850']
    )

    # NDBI (Built-up index)
    ndbi_vis = ndbi.visualize(
        min=-0.3, max=0.3,
        palette=['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027']
    )

    # MNDWI (Water index)
    mndwi_vis = mndwi.visualize(
        min=-0.5, max=0.5,
        palette=['#A59B8F', '#fee08b', '#91d8ef', '#419BDF', '#0a3d6b']
    )

    # Probability heatmaps for key classes
    built_prob_vis = dw_probs.select('built').visualize(
        min=0, max=1,
        palette=['#000000', '#3d0c02', '#8b1a1a', '#C4281B', '#ff4444', '#ff8888']
    )
    trees_prob_vis = dw_probs.select('trees').visualize(
        min=0, max=1,
        palette=['#000000', '#1a3d1a', '#2d6a2d', '#397D49', '#66bb6a', '#a5d6a7']
    )
    crops_prob_vis = dw_probs.select('crops').visualize(
        min=0, max=1,
        palette=['#000000', '#5c3d1e', '#8b6914', '#E49635', '#ffc107', '#ffe082']
    )

    print(f'[LULC] → Fetching tile URLs from GEE (8 layers)...')
    tiles = {}
    for name, vis in [('lulc_tiles', lulc_vis), ('rgb_tiles', rgb_vis),
                       ('ndvi_tiles', ndvi_vis), ('ndbi_tiles', ndbi_vis),
                       ('mndwi_tiles', mndwi_vis), ('built_prob_tiles', built_prob_vis),
                       ('trees_prob_tiles', trees_prob_vis), ('crops_prob_tiles', crops_prob_vis)]:
        tiles[name] = get_map_tiles(vis)
        print(f'[LULC]   ✓ {name}')

    if not tiles['lulc_tiles']:
        raise RuntimeError("Failed to generate Dynamic World LULC tiles from GEE.")

    print(f'[LULC] ━━━ Analysis complete! ━━━\n')

    return {
        'stats': stats,
        'classes': DW_CLASSES,
        **tiles,
    }

# ================================================================
#  DEFORESTATION — Global Forest Watch (Hansen)
#  30m resolution global forest change dataset from GEE
#  Dataset: UMD/hansen/global_forest_change_2024_v1_12
# ================================================================

import ee
import logging
from .gee_utils import init_gee, safe_get_info, get_map_tiles

logger = logging.getLogger(__name__)

def analyze_deforestation(geojson_geom, start_year=2001, end_year=2024, min_canopy=20):
    """
    Forest loss tracking using Global Forest Watch (Hansen) dataset.
    
    Returns dict with tiles (base forest, forest loss) and stats (area in hectares).
    """
    print(f'\n[DEF] ━━━ Starting Deforestation analysis ━━━')
    init_gee()
    print(f'[DEF] ✓ GEE initialized')

    region = ee.Geometry(geojson_geom)
    print(f'[DEF] → Years: {start_year}-{end_year} | Min Canopy: {min_canopy}%')

    # Load Hansen dataset
    hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12').clip(region)

    print(f'[DEF] → Computing base forest and loss areas...')
    
    # Base forest cover in year 2000 >= min_canopy
    base_forest = hansen.select('treecover2000').gte(min_canopy)

    # Loss is flagged 1 in 'loss' band. 'lossyear' band contains 1-23 for years 2001-2023.
    # We want lossyear >= start_year - 2000 AND lossyear <= end_year - 2000
    start_val = max(1, start_year - 2000)
    end_val = end_year - 2000

    loss_year_band = hansen.select('lossyear')
    in_period = loss_year_band.gte(start_val).And(loss_year_band.lte(end_val))
    is_loss = hansen.select('loss').eq(1)

    # Final mask for forest loss
    forest_loss = is_loss.And(in_period).And(base_forest)

    # ── AREA CALCULATION ─────────────────────────────────────────
    # Use hectare (10,000 m²) for deforestation stats
    pixel_area = ee.Image.pixelArea().divide(10000)

    base_area = safe_get_info(
        base_forest.multiply(pixel_area)
        .reduceRegion(reducer=ee.Reducer.sum(), geometry=region, scale=30, maxPixels=1e10)
        .get('treecover2000'), 0
    )

    loss_area = safe_get_info(
        forest_loss.multiply(pixel_area)
        .reduceRegion(reducer=ee.Reducer.sum(), geometry=region, scale=30, maxPixels=1e10)
        .get('loss'), 0
    )

    base_area_ha = round(float(base_area or 0.0), 2)
    loss_area_ha = round(float(loss_area or 0.0), 2)
    loss_pct = round((loss_area_ha / max(base_area_ha, 0.01)) * 100.0, 2)

    print(f'[DEF]   Base Forest Area: {base_area_ha} ha')
    print(f'[DEF]   Forest Loss Area: {loss_area_ha} ha')

    stats = {
        'start_year': start_year,
        'end_year': end_year,
        'min_canopy': min_canopy,
        'source': 'Global Forest Watch (Hansen, 30m)',
        'base_forest_area_ha': base_area_ha,
        'loss_area_ha': loss_area_ha,
        'loss_percentage': loss_pct
    }

    # ── MAP TILES ──────────────────────────────────────────────
    print(f'[DEF] → Generating map tiles...')
    
    # Base forest: green (#00FF00)
    base_vis = base_forest.updateMask(base_forest).visualize(palette=['#2d6a2d'])

    # Forest loss: bright red (#FF0000)
    loss_vis = forest_loss.updateMask(forest_loss).visualize(palette=['#FF2222'])

    # Combined overlay
    combined_vis = ee.ImageCollection([base_vis, loss_vis]).mosaic()

    tiles = {
        'base_forest_tiles': get_map_tiles(base_vis),
        'forest_loss_tiles': get_map_tiles(loss_vis),
        'combined_tiles': get_map_tiles(combined_vis)
    }

    if not tiles['combined_tiles']:
        logger.warning("Failed to generate combined forest tiles from GEE.")
        # Note: We won't raise an error here because zero forest area could be a valid result in deserts
        tiles['base_forest_tiles'] = None
        tiles['forest_loss_tiles'] = None
        tiles['combined_tiles'] = None
        
    print(f'[DEF] ━━━ Analysis complete! ━━━\n')

    return {
        'stats': stats,
        **tiles,
    }

# ================================================================
#  DEFORESTATION — Global Forest Watch (Hansen) + Sentinel-2 NDVI
#  Hansen: 30m resolution global forest change dataset from GEE
#  Sentinel-2: 10m NDVI-based temporal change detection
#  Dataset: UMD/hansen/global_forest_change_2024_v1_12
#           COPERNICUS/S2_SR_HARMONIZED
# ================================================================

import ee
import json
import hashlib
import time
import logging
from .gee_utils import (
    init_gee, safe_get_info, get_map_tiles,
    get_s2_composite, compute_ndvi_s2,
    get_s2_ndvi_timeseries, get_ndvi_histogram_data,
)

logger = logging.getLogger(__name__)


# ── DISK-PERSISTENT RESULT CACHE ─────────────────────────────────
# Survives server restarts. Stored as JSON file.
import os as _os
_CACHE_DIR = _os.path.join(_os.path.dirname(__file__), '..', '..', '..', 'cache')
_CACHE_FILE = _os.path.join(_CACHE_DIR, 'deforestation_cache.json')
_CACHE_TTL = 6 * 3600   # 6 hours
_CACHE_MAX = 50          # max cached results

# In-memory mirror of disk cache
_result_cache: dict[str, tuple[float, dict]] = {}


def _load_cache():
    """Load cache from disk into memory."""
    global _result_cache
    try:
        if _os.path.exists(_CACHE_FILE):
            with open(_CACHE_FILE, 'r') as f:
                data = json.load(f)
            # Filter expired entries on load
            now = time.time()
            _result_cache = {
                k: (v[0], v[1]) for k, v in data.items()
                if now - v[0] < _CACHE_TTL
            }
            logger.info(f"Deforestation cache loaded: {len(_result_cache)} entries")
    except Exception as e:
        logger.warning(f"Failed to load cache: {e}")
        _result_cache = {}


def _save_cache():
    """Persist current cache to disk."""
    try:
        _os.makedirs(_CACHE_DIR, exist_ok=True)
        with open(_CACHE_FILE, 'w') as f:
            json.dump(_result_cache, f)
    except Exception as e:
        logger.warning(f"Failed to save cache: {e}")


def clear_cache():
    """Clear all cached deforestation results (called from API)."""
    global _result_cache
    _result_cache = {}
    try:
        if _os.path.exists(_CACHE_FILE):
            _os.remove(_CACHE_FILE)
    except Exception:
        pass
    logger.info("Deforestation cache cleared.")
    return len(_result_cache)


def get_cache_info():
    """Return cache stats for the UI."""
    return {
        'entries': len(_result_cache),
        'max_entries': _CACHE_MAX,
        'ttl_hours': _CACHE_TTL / 3600,
    }


# Load cache from disk on module import
_load_cache()


def _make_cache_key(geojson_geom, start_year, end_year, min_canopy,
                    include_ndvi, ndvi_before_year, ndvi_after_year,
                    ndvi_threshold, season_start_month, season_end_month):
    """Create a deterministic hash from all input parameters."""
    raw = json.dumps({
        'geom': geojson_geom,
        'sy': start_year, 'ey': end_year, 'mc': min_canopy,
        'ndvi': include_ndvi, 'nb': ndvi_before_year, 'na': ndvi_after_year,
        'nt': ndvi_threshold, 'ss': season_start_month, 'se': season_end_month,
    }, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()


def _get_cached(key: str):
    """Return cached result if valid, else None."""
    if key in _result_cache:
        ts, result = _result_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return result
        else:
            del _result_cache[key]
            _save_cache()
    return None


def _put_cache(key: str, result: dict):
    """Store result in cache, evict oldest if full, persist to disk."""
    if len(_result_cache) >= _CACHE_MAX:
        oldest_key = min(_result_cache, key=lambda k: _result_cache[k][0])
        del _result_cache[oldest_key]
    _result_cache[key] = (time.time(), result)
    _save_cache()


# ── HANSEN ANALYSIS ──────────────────────────────────────────────
def analyze_deforestation(
    geojson_geom,
    start_year=2001,
    end_year=2024,
    min_canopy=20,
    include_ndvi=False,
    ndvi_before_year=2018,
    ndvi_after_year=2023,
    ndvi_threshold=0.4,
    season_start_month=1,
    season_end_month=12,
):
    """
    Forest loss tracking using Global Forest Watch (Hansen) dataset,
    optionally enhanced with Sentinel-2 NDVI temporal analysis.

    Results are cached in memory — same polygon + same params = instant return.
    """
    # ── CHECK CACHE ───────────────────────────────────────────
    cache_key = _make_cache_key(
        geojson_geom, start_year, end_year, min_canopy,
        include_ndvi, ndvi_before_year, ndvi_after_year,
        ndvi_threshold, season_start_month, season_end_month,
    )
    cached = _get_cached(cache_key)
    if cached:
        print(f'\n[DEF] ⚡ Cache HIT — returning stored result instantly')
        return cached

    print(f'\n[DEF] ━━━ Starting Deforestation analysis ━━━')
    init_gee()
    print(f'[DEF] ✓ GEE initialized')

    region = ee.Geometry(geojson_geom)
    print(f'[DEF] → Years: {start_year}-{end_year} | Min Canopy: {min_canopy}%')


    # Load Hansen dataset
    hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12').clip(region)

    print(f'[DEF] → Computing base forest, loss, and gain areas...')

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

    # Forest gain (Hansen gain band)
    gain = hansen.select('gain').eq(1)

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

    gain_area = safe_get_info(
        gain.multiply(pixel_area)
        .reduceRegion(reducer=ee.Reducer.sum(), geometry=region, scale=30, maxPixels=1e10)
        .get('gain'), 0
    )

    base_area_ha = round(float(base_area or 0.0), 2)
    loss_area_ha = round(float(loss_area or 0.0), 2)
    gain_area_ha = round(float(gain_area or 0.0), 2)
    loss_pct = round((loss_area_ha / max(base_area_ha, 0.01)) * 100.0, 2)

    print(f'[DEF]   Base Forest Area: {base_area_ha} ha')
    print(f'[DEF]   Forest Loss Area: {loss_area_ha} ha')
    print(f'[DEF]   Forest Gain Area: {gain_area_ha} ha')

    # ── YEAR-BY-YEAR LOSS BREAKDOWN ──────────────────────────────
    print(f'[DEF] → Computing year-by-year loss breakdown...')
    yearly_loss = []
    effective_start = max(start_year, 2001)
    effective_end = min(end_year, 2024)

    for yr in range(effective_start, effective_end + 1):
        yr_val = yr - 2000
        yr_mask = loss_year_band.eq(yr_val).And(base_forest)
        yr_area = safe_get_info(
            yr_mask.multiply(pixel_area)
            .reduceRegion(reducer=ee.Reducer.sum(), geometry=region, scale=30, maxPixels=1e10)
            .get('lossyear'), 0
        )
        yr_ha = round(float(yr_area or 0.0), 2)
        yearly_loss.append({'year': yr, 'loss_ha': yr_ha})
        if yr_ha > 0:
            print(f'[DEF]     {yr}: {yr_ha} ha')

    # Compute peak year and average
    loss_values = [y['loss_ha'] for y in yearly_loss]
    peak_loss_year = yearly_loss[loss_values.index(max(loss_values))]['year'] if loss_values else None
    avg_annual_loss = round(sum(loss_values) / max(len(loss_values), 1), 2)

    stats = {
        'start_year': start_year,
        'end_year': end_year,
        'min_canopy': min_canopy,
        'source': 'Global Forest Watch (Hansen, 30m)',
        'base_forest_area_ha': base_area_ha,
        'loss_area_ha': loss_area_ha,
        'loss_percentage': loss_pct,
        'gain_area_ha': gain_area_ha,
        'yearly_loss': yearly_loss,
        'peak_loss_year': peak_loss_year,
        'avg_annual_loss_ha': avg_annual_loss,
    }

    # ── MAP TILES ──────────────────────────────────────────────
    print(f'[DEF] → Generating map tiles...')

    # Use actual treecover2000 (0-100%) for gradient green forest density
    treecover = hansen.select('treecover2000')
    base_vis = treecover.updateMask(treecover.gte(min_canopy)).visualize(
        min=min_canopy, max=100,
        palette=['#a8ddb5', '#4eb36b', '#2d6a2d', '#0a3d0a']
    )

    # Forest loss: use lossyear for color-graded timeline (yellow=old, red=recent)
    loss_year_masked = loss_year_band.updateMask(forest_loss)
    loss_vis = loss_year_masked.visualize(
        min=start_val, max=max(end_val, start_val + 1),
        palette=['#ffff00', '#ffaa00', '#ff5500', '#ff0000', '#cc0000']
    )

    # Forest gain: bright cyan
    gain_vis = gain.selfMask().visualize(
        min=0, max=1, palette=['#00FF88']
    )

    # Combined overlay (base → gain → loss on top for visibility)
    combined_vis = ee.ImageCollection([base_vis, gain_vis, loss_vis]).mosaic()

    # Generate each tile independently — one failure shouldn't kill others
    tiles = {}
    for tile_name, vis_img in [
        ('base_forest_tiles', base_vis),
        ('forest_loss_tiles', loss_vis),
        ('gain_tiles', gain_vis),
        ('combined_tiles', combined_vis),
    ]:
        try:
            url = get_map_tiles(vis_img)
            tiles[tile_name] = url
            print(f'[DEF]   {"✓" if url else "✗"} {tile_name}')
        except Exception as e:
            logger.warning(f"Failed to generate {tile_name}: {e}")
            tiles[tile_name] = None
            print(f'[DEF]   ✗ {tile_name} (ERROR: {e})')

    # ── SENTINEL-2 NDVI ANALYSIS (OPTIONAL) ──────────────────────
    ndvi_data = None
    if include_ndvi:
        print(f'[DEF] → Starting Sentinel-2 NDVI analysis...')
        print(f'[DEF]   Before: {ndvi_before_year} | After: {ndvi_after_year} | Threshold: {ndvi_threshold}')
        ndvi_data = _compute_ndvi_analysis(
            region, ndvi_before_year, ndvi_after_year,
            ndvi_threshold, season_start_month, season_end_month,
            start_year, end_year,
        )

    print(f'[DEF] ━━━ Analysis complete! ━━━\n')

    result = {
        'stats': stats,
        **tiles,
    }
    if ndvi_data:
        result['ndvi'] = ndvi_data
        stats['source'] = 'Global Forest Watch (Hansen, 30m) + Sentinel-2 SR (10m)'

    # ── STORE IN CACHE ────────────────────────────────────────
    _put_cache(cache_key, result)
    print(f'[DEF] ✓ Result cached (key: {cache_key[:8]}...)')

    return result


# ── SENTINEL-2 NDVI ANALYSIS ENGINE ─────────────────────────────
def _compute_ndvi_analysis(
    region, before_year, after_year, threshold,
    season_start, season_end, hansen_start, hansen_end
):
    """
    Sentinel-2 based NDVI temporal analysis for deforestation monitoring.

    Computes:
    - Before/After NDVI composites and map tiles
    - Delta NDVI change map
    - NDVI time-series (yearly mean)
    - Tree area time-series (area with NDVI > threshold)
    - Histogram distributions for before/after
    """
    months = (season_start, season_end)

    # ── BEFORE / AFTER COMPOSITES ─────────────────────────────────
    print(f'[DEF-NDVI] → Fetching Sentinel-2 composites...')
    before_composite = get_s2_composite(region, before_year, months).clip(region)
    after_composite = get_s2_composite(region, after_year, months).clip(region)

    # Compute NDVI
    ndvi_before = compute_ndvi_s2(before_composite)
    ndvi_after = compute_ndvi_s2(after_composite)

    # Delta NDVI = After - Before (negative = vegetation loss)
    ndvi_delta = ndvi_after.subtract(ndvi_before).rename('NDVI')

    # ── STATISTICS ────────────────────────────────────────────────
    print(f'[DEF-NDVI] → Computing NDVI statistics...')
    before_mean = safe_get_info(
        ndvi_before.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e9
        ).get('NDVI'), 0
    )
    after_mean = safe_get_info(
        ndvi_after.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e9
        ).get('NDVI'), 0
    )

    before_mean = round(float(before_mean or 0), 4)
    after_mean = round(float(after_mean or 0), 4)
    ndvi_change = round(after_mean - before_mean, 4)
    print(f'[DEF-NDVI]   Before NDVI: {before_mean} | After NDVI: {after_mean} | Change: {ndvi_change}')

    # ── COMBINED TIME-SERIES (NDVI mean + Tree area in ONE loop) ────
    print(f'[DEF-NDVI] → Computing NDVI + tree area time-series (single pass)...')
    pixel_area_ha = ee.Image.pixelArea().divide(10000)
    effective_start = max(2017, hansen_start)

    ndvi_timeseries = []
    tree_area_timeseries = []
    for yr in range(effective_start, hansen_end + 1):
        try:
            comp = get_s2_composite(region, yr, months).clip(region)
            ndvi_yr = compute_ndvi_s2(comp)

            # Mean NDVI for this year
            mean_val = safe_get_info(
                ndvi_yr.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=region, scale=10, maxPixels=1e9,
                ).get('NDVI'), 0
            )
            mean_ndvi = round(float(mean_val or 0), 4)
            ndvi_timeseries.append({'year': yr, 'mean_ndvi': mean_ndvi})

            # Tree area (NDVI > threshold) for this year
            tree_mask = ndvi_yr.gt(threshold)
            tree_area = safe_get_info(
                tree_mask.multiply(pixel_area_ha)
                .reduceRegion(reducer=ee.Reducer.sum(), geometry=region, scale=10, maxPixels=1e9)
                .get('NDVI'), 0
            )
            tree_ha = round(float(tree_area or 0), 2)
            tree_area_timeseries.append({'year': yr, 'tree_area_ha': tree_ha})

            print(f'[DEF-NDVI]     {yr}: NDVI={mean_ndvi} | tree area={tree_ha} ha')
        except Exception as e:
            logger.warning(f"Time-series failed for {yr}: {e}")
            ndvi_timeseries.append({'year': yr, 'mean_ndvi': 0})
            tree_area_timeseries.append({'year': yr, 'tree_area_ha': 0})

    # ── HISTOGRAMS ────────────────────────────────────────────────
    print(f'[DEF-NDVI] → Computing NDVI histograms...')
    before_histogram = get_ndvi_histogram_data(ndvi_before, region)
    after_histogram = get_ndvi_histogram_data(ndvi_after, region)

    # ── MAP TILES ─────────────────────────────────────────────────
    print(f'[DEF-NDVI] → Generating NDVI map tiles...')
    ndvi_palette = ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850', '#006837']

    ndvi_before_vis = ndvi_before.visualize(min=-0.1, max=0.8, palette=ndvi_palette)
    ndvi_after_vis = ndvi_after.visualize(min=-0.1, max=0.8, palette=ndvi_palette)

    # Delta: red = loss, white = no change, green = gain
    delta_palette = ['#d73027', '#fc8d59', '#fee08b', '#ffffbf', '#d9ef8b', '#91cf60', '#1a9850']
    ndvi_delta_vis = ndvi_delta.visualize(min=-0.5, max=0.5, palette=delta_palette)

    ndvi_before_tiles = get_map_tiles(ndvi_before_vis)
    ndvi_after_tiles = get_map_tiles(ndvi_after_vis)
    ndvi_delta_tiles = get_map_tiles(ndvi_delta_vis)

    print(f'[DEF-NDVI]   ✓ Before/After/Delta tiles generated')

    # ── AREA OF SIGNIFICANT DECLINE ───────────────────────────────
    # Pixels where NDVI dropped by > 0.2 (significant vegetation loss)
    significant_decline = ndvi_delta.lt(-0.2)
    decline_area = safe_get_info(
        significant_decline.multiply(pixel_area_ha)
        .reduceRegion(reducer=ee.Reducer.sum(), geometry=region, scale=10, maxPixels=1e9)
        .get('NDVI'), 0
    )
    decline_area_ha = round(float(decline_area or 0), 2)

    # Max decline value
    max_decline = safe_get_info(
        ndvi_delta.reduceRegion(
            reducer=ee.Reducer.min(), geometry=region, scale=10, maxPixels=1e9
        ).get('NDVI'), 0
    )
    max_decline_val = round(float(max_decline or 0), 4)

    return {
        'before_year': before_year,
        'after_year': after_year,
        'threshold': threshold,
        'ndvi_before_tiles': ndvi_before_tiles,
        'ndvi_after_tiles': ndvi_after_tiles,
        'ndvi_delta_tiles': ndvi_delta_tiles,
        'ndvi_before_mean': before_mean,
        'ndvi_after_mean': after_mean,
        'ndvi_change': ndvi_change,
        'max_ndvi_decline': max_decline_val,
        'significant_decline_area_ha': decline_area_ha,
        'timeseries': ndvi_timeseries,
        'tree_area_timeseries': tree_area_timeseries,
        'before_histogram': before_histogram,
        'after_histogram': after_histogram,
    }

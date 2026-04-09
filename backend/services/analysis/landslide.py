# ================================================================
#  LANDSLIDE SUSCEPTIBILITY MAPPING
#  Random Forest classifier on DEM-derived variables via GEE
#  Memory-optimized: samples at 90m, tiles at native resolution
# ================================================================

import ee
import logging
from datetime import datetime
from .gee_utils import (
    init_gee, mask_s2_clouds,
    safe_get_info, get_map_tiles
)

logger = logging.getLogger(__name__)

# ── SCALE CONSTANTS ────────────────────────────────────────────
# Sampling at 90m instead of 30m reduces GEE memory by ~9x
SAMPLE_SCALE = 90
# Area calculation at 200m is plenty accurate for km² stats
AREA_SCALE = 500
# Number of trees in the RF (fewer = faster)
NUM_TREES = 50


def build_terrain_stack(region):
    """
    Build a lightweight terrain stack for landslide susceptibility.
    CRITICAL: Avoid .reproject() on heavy bands — let GEE use native resolution.
    """
    buffered = region.buffer(1000)

    # DEM & core terrain (native 30m — these are lightweight)
    dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation').clip(buffered)
    slope = ee.Terrain.slope(dem).rename('slope').clip(region)
    aspect = ee.Terrain.aspect(dem).rename('aspect').clip(region)
    hillshade = ee.Terrain.hillshade(dem, 90, 45).rename('hillshade').clip(region)
    elevation = dem.rename('elevation').clip(region)

    # Hydrology (native resolution, no reproject)
    flow_acc = (ee.Image('MERIT/Hydro/v1_0_1')
                .select('upa').log().clip(region).rename('flow_acc'))
    hand = (ee.Image('users/gena/GlobalHAND/30m/hand-1000')
            .clip(region).rename('hand'))
    mean_elev = dem.focalMean(5, 'square')
    tpi = dem.subtract(mean_elev).rename('tpi').clip(region)
    rivers = ee.Image('MERIT/Hydro/v1_0_1').select('upa').clip(region).gt(0.5)
    dist_drainage = (rivers.distance(ee.Kernel.euclidean(5000, 'meters'))
                     .rename('dist_drainage'))

    # Sentinel-2 NDVI only (NDWI/NDBI removed to reduce memory)
    current_year = datetime.now().year
    s2 = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(region)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
          .filterDate(f'{current_year - 1}-01-01', f'{current_year}-12-31')
          .map(mask_s2_clouds)
          .median())
    ndvi = s2.normalizedDifference(['B8', 'B4']).rename('ndvi').clip(region)

    # Precipitation (CHIRPS) - Added for Tutor's Methodology
    try:
        chirps = (ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                  .filterBounds(region)
                  .filterDate(f'{current_year - 1}-01-01', f'{current_year - 1}-12-31'))
        precipitation = chirps.sum().rename('precipitation').clip(region)
    except:
        precipitation = ee.Image(0).rename('precipitation').clip(region)

    # Stack 10 bands
    stack = (elevation
             .addBands(slope)
             .addBands(aspect)
             .addBands(hillshade)
             .addBands(flow_acc)
             .addBands(hand)
             .addBands(tpi)
             .addBands(dist_drainage)
             .addBands(ndvi)
             .addBands(precipitation))

    return stack


def build_overlay_layers(region):
    """
    Build visualization-only layers (Precipitation, Temperature).
    These are NOT part of the RF classifier — they're just map overlays.
    """
    current_year = datetime.now().year
    last_year = current_year - 1

    try:
        # CHIRPS Precipitation (native ~5km resolution — DO NOT reproject)
        chirps = (ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                  .filterBounds(region)
                  .filterDate(f'{last_year}-01-01', f'{last_year}-12-31'))
        precip = chirps.sum().rename('precipitation').clip(region)
        precip_vis = precip.visualize(
            min=0, max=3000,
            palette=['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e',
                     '#78c679', '#41ab5d', '#238443', '#005a32'])
        precip_tiles = get_map_tiles(precip_vis)
    except Exception as e:
        logger.warning(f"Precipitation overlay failed: {e}")
        precip_tiles = None

    try:
        # MODIS LST (native ~1km — DO NOT reproject)
        modis = (ee.ImageCollection('MODIS/061/MOD11A1')
                 .filterBounds(region)
                 .select('LST_Day_1km')
                 .filterDate(f'{last_year}-01-01', f'{last_year}-12-31'))
        lst = modis.median().multiply(0.02).subtract(273.15).rename('temperature').clip(region)
        temp_vis = lst.visualize(
            min=0, max=40,
            palette=['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8',
                     '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'])
        temp_tiles = get_map_tiles(temp_vis)
    except Exception as e:
        logger.warning(f"Temperature overlay failed: {e}")
        temp_tiles = None

    return precip_tiles, temp_tiles


def analyze_landslide(geojson_geom, num_samples=200):
    """
    Landslide susceptibility mapping using Random Forest.
    Memory-optimized: samples at 90m, uses 9 terrain bands (no heavy climate reprojection).
    """
    print("[LANDSLIDE] ━━━ Starting Landslide Susceptibility analysis ━━━")
    init_gee()
    print("[LANDSLIDE] ✓ GEE initialized")

    region = ee.Geometry(geojson_geom)

    # Build terrain stack (lightweight, 9 bands)
    print("[LANDSLIDE] → Building terrain stack (9 variables)...")
    stack = build_terrain_stack(region)
    band_names = stack.bandNames()

    # ── SLOPE UNIT GENERATION (TUTOR METHODOLOGY) ──────────────────────
    print("[LANDSLIDE] → Generating Slope Units (HydroSHEDS Catchments)...")
    basins = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_12').filterBounds(region)
    
    # Strictly isolate the 5 parameters the tutor defined in the video
    tutor_bands = ['elevation', 'slope', 'aspect', 'precipitation', 'ndvi']
    stack_subset = stack.select(tutor_bands)
    
    print("[LANDSLIDE] → Aggregating terrain features per Catchment (Slope Unit)...")
    # Instead of pulling isolated pixel samples, we calculate the mathematical MEAN
    # of the 5 variables entirely within the geometry of every single basin independently.
    basin_stats = stack_subset.reduceRegions(
        collection=basins,
        reducer=ee.Reducer.mean(),
        scale=90, # 90m protects memory while giving accurate averages
        tileScale=4
    )
    
    valid_samples = basin_stats.filter(ee.Filter.notNull(tutor_bands))
    total_valid = safe_get_info(valid_samples.size(), 0)
    print(f"[LANDSLIDE]   Total Catchments Analyzed: {total_valid}")

    if total_valid < 4:
        raise ValueError(
            f"AOI too small! Found only {total_valid} valid catchments. "
            f"Please draw a larger area to span multiple valleys."
        )

    # Split Catchments into high-risk (steepest 50%) and low-risk (flattest 50%)
    split_size = max(total_valid // 2, 2)
    occurrence = valid_samples.sort('slope', False).limit(split_size).map(lambda f: f.set('class', 1))
    non_occurrence = valid_samples.sort('slope', True).limit(split_size).map(lambda f: f.set('class', 0))

    num_occ = safe_get_info(occurrence.size(), 0)
    print(f"[LANDSLIDE]   High-risk proxy Catchments: {num_occ}")

    samples = occurrence.merge(non_occurrence).randomColumn('random')
    training = samples.filter(ee.Filter.lte('random', 0.8))
    testing = samples.filter(ee.Filter.gt('random', 0.8))

    train_size = safe_get_info(training.size(), 0)
    test_size = safe_get_info(testing.size(), 0)
    print(f"[LANDSLIDE] → Training Random Forest on Slope Units ({NUM_TREES} trees, Train: {train_size}, Test: {test_size})...")

    # Train directly on the BASINS, not pixels
    rf = (ee.Classifier.smileRandomForest(NUM_TREES)
          .train(training, 'class', tutor_bands)
          .setOutputMode('PROBABILITY'))

    # Classify the basins!
    classified_basins = valid_samples.classify(rf, 'probability')
    
    print("[LANDSLIDE] → Converting colored catchments back into a solid map image...")
    # This renders the discrete polygons to match the tutor's QGIS patchwork style natively!
    susceptibility = classified_basins.reduceToImage(['probability'], ee.Reducer.first()).rename('probability').clip(region)

    # Reclassify into 4 categories
    classes = (susceptibility
               .where(susceptibility.lt(0.25), 1)
               .where(susceptibility.gte(0.25).And(susceptibility.lt(0.50)), 2)
               .where(susceptibility.gte(0.50).And(susceptibility.lt(0.65)), 3)
               .where(susceptibility.gte(0.65), 4)
               .rename('risk_class'))

    # ── AREA CALCULATIONS ──────────────────────────────────────
    print("[LANDSLIDE] → Calculating risk areas (optimized)...")
    pixel_area = ee.Image.pixelArea().divide(1e6)

    # Use a single grouped reducer with bestEffort + tileScale for memory safety.
    # bestEffort=True lets GEE auto-coarsen scale if memory is still tight.
    # tileScale=4 splits the computation into 16x smaller tiles.
    area_dict = {}
    try:
        grouped_area_result = safe_get_info(
            pixel_area.addBands(classes).reduceRegion(
                reducer=ee.Reducer.sum().group(
                    groupField=1,
                    groupName='risk_class'
                ),
                geometry=region,
                scale=AREA_SCALE,
                maxPixels=1e9,
                bestEffort=True,
                tileScale=4
            ).get('groups'), []
        )
        area_dict = {int(item['risk_class']): item['sum']
                     for item in grouped_area_result if 'risk_class' in item}
    except Exception as e:
        print(f"[LANDSLIDE]   ⚠ Grouped area calc failed ({e}), using pixel-count fallback...")
        # Fallback: use frequencyHistogram (counts pixels instead of summing area)
        try:
            hist = safe_get_info(
                classes.reduceRegion(
                    reducer=ee.Reducer.frequencyHistogram(),
                    geometry=region,
                    scale=AREA_SCALE,
                    maxPixels=1e9,
                    bestEffort=True,
                    tileScale=4
                ).get('risk_class'), {}
            )
            px_km2 = (AREA_SCALE * AREA_SCALE) / 1e6
            area_dict = {int(k): v * px_km2 for k, v in hist.items()}
        except Exception as e2:
            print(f"[LANDSLIDE]   ⚠ Fallback also failed ({e2}). Areas will be 0.")

    low_area = area_dict.get(1, 0.0)
    mod_area = area_dict.get(2, 0.0)
    high_area = area_dict.get(3, 0.0)
    vhigh_area = area_dict.get(4, 0.0)

    print(f"[LANDSLIDE]   Low Risk: {low_area:.2f} km²")
    print(f"[LANDSLIDE]   Moderate Risk: {mod_area:.2f} km²")
    print(f"[LANDSLIDE]   High Risk: {high_area:.2f} km²")
    print(f"[LANDSLIDE]   Very High Risk: {vhigh_area:.2f} km²")

    # Variable importance
    print("[LANDSLIDE] → Extracting feature importance...")
    rf_explain = safe_get_info(rf.explain(), {})
    importance = rf_explain.get('importance', {})
    total_imp = sum(importance.values()) if importance else 1
    importance_pct = {k: round(v / total_imp * 100, 1) for k, v in importance.items()}

    # Accuracy
    print("[LANDSLIDE] → Computing accuracy metrics...")
    try:
        tested = testing.classify(rf.setOutputMode('CLASSIFICATION'))
        error_matrix = tested.errorMatrix('class', 'classification')
        
        # Evaluate accuracy and confusion matrix in a single server call
        metrics = safe_get_info(ee.Dictionary({
            'accuracy': error_matrix.accuracy(),
            'array': error_matrix.array()
        }), {})
        
        accuracy = metrics.get('accuracy', 0)
        cm = metrics.get('array', [[0, 0], [0, 0]])
        if cm and len(cm) >= 2 and len(cm[0]) >= 2:
            tp = cm[1][1] if len(cm) > 1 and len(cm[1]) > 1 else 0
            tn = cm[0][0]
            fp = cm[0][1] if len(cm[0]) > 1 else 0
            fn = cm[1][0] if len(cm) > 1 else 0
            precision = round(tp / max(tp + fp, 1), 3)
            recall = round(tp / max(tp + fn, 1), 3)
            f1 = round(2 * precision * recall / max(precision + recall, 0.001), 3)
        else:
            precision, recall, f1 = 0, 0, 0
    except Exception as e:
        logger.warning(f"Accuracy computation failed: {e}")
        accuracy, precision, recall, f1 = 0, 0, 0, 0

    # Skip ROC/AUC for speed (it was adding heavy computation)
    auc = 0

    stats = {
        'low_risk_km2': round(low_area, 2),
        'moderate_risk_km2': round(mod_area, 2),
        'high_risk_km2': round(high_area, 2),
        'very_high_risk_km2': round(vhigh_area, 2),
        'total_km2': round(low_area + mod_area + high_area + vhigh_area, 2),
        'accuracy': round(accuracy * 100, 1) if accuracy else 0,
        'auc': auc,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'num_training_samples': train_size,
        'num_test_samples': test_size,
    }

    # ── MAP TILES (only 5 core layers) ─────────────────────────
    print("[LANDSLIDE] → Generating map tiles (with Polygon Borders)...")
    base_class_vis = classes.visualize(
        min=1, max=4, palette=['#00c48c', '#f5d623', '#f5a623', '#ff3d5a'])
    base_prob_vis = susceptibility.visualize(
        min=0, max=1, palette=['#00c48c', '#90ee90', '#ffffcc', '#f5a623', '#ff3d5a'])

    # Render Catchment Polygon Borders (QGIS-style)
    empty = ee.Image().byte()
    outlines = empty.paint(featureCollection=valid_samples, color=1, width=1)
    outline_vis = outlines.visualize(palette=['#000000'])

    # Overlay outlines on top of the raster heatmaps
    class_vis = ee.ImageCollection([base_class_vis, outline_vis]).mosaic()
    prob_vis = ee.ImageCollection([base_prob_vis, outline_vis]).mosaic()
    slope_vis = stack.select('slope').visualize(
        min=0, max=60, palette=['#0d1117', '#1c2535', '#f5a623', '#ff3d5a', '#ff0000'])
    elevation_vis = stack.select('elevation').visualize(
        min=0, max=3000, palette=['#00c48c', '#90ee90', '#ffffcc', '#f5a623', '#ff3d5a', '#800000'])
    hand_vis = stack.select('hand').visualize(
        min=0, max=100, palette=['#0d1117', '#1c2535', '#4da6ff', '#00d4aa', '#00c48c'])

    class_tiles = get_map_tiles(class_vis)
    print("[LANDSLIDE]   ✓ class_tiles")
    prob_tiles = get_map_tiles(prob_vis)
    print("[LANDSLIDE]   ✓ probability_tiles")
    slope_tiles = get_map_tiles(slope_vis)
    print("[LANDSLIDE]   ✓ slope_tiles")
    elev_tiles = get_map_tiles(elevation_vis)
    print("[LANDSLIDE]   ✓ elevation_tiles")
    hand_tiles = get_map_tiles(hand_vis)
    print("[LANDSLIDE]   ✓ hand_tiles")

    # Build overlay layers (Precipitation, Temperature) separately — they may fail on large AOIs
    print("[LANDSLIDE] → Building climate overlay layers...")
    precip_tiles, temp_tiles = build_overlay_layers(region)
    if precip_tiles:
        print("[LANDSLIDE]   ✓ precip_tiles")
    else:
        print("[LANDSLIDE]   ⚠ precip_tiles skipped (memory limit)")
    if temp_tiles:
        print("[LANDSLIDE]   ✓ temp_tiles")
    else:
        print("[LANDSLIDE]   ⚠ temp_tiles skipped (memory limit)")

    print("[LANDSLIDE] ━━━ Analysis complete! ━━━")

    return {
        'stats': stats,
        'importance': importance_pct,
        'probability_tiles': prob_tiles,
        'class_tiles': class_tiles,
        'slope_tiles': slope_tiles,
        'elevation_tiles': elev_tiles,
        'hand_tiles': hand_tiles,
        'precip_tiles': precip_tiles,
        'temp_tiles': temp_tiles,
    }

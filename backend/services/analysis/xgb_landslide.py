# ================================================================
#  LANDSLIDE SUSCEPTIBILITY — XGBoost (GEE Gradient Tree Boost)
#  Uses ee.Classifier.smileGradientTreeBoost on the same terrain
#  stack as the RF model, producing identical GEE tile output.
#  Dataset: Landslide4Sense-inspired feature set
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
SAMPLE_SCALE = 90
AREA_SCALE = 500
NUM_TREES = 100
MAX_DEPTH = 8
SHRINKAGE = 0.1


def build_xgb_terrain_stack(region):
    """
    Build a Landslide4Sense-inspired terrain stack for XGBoost classification.
    Uses spectral + topographic features similar to the Kaggle dataset.
    """
    buffered = region.buffer(1000)

    # DEM & core terrain
    dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation').clip(buffered)
    slope = ee.Terrain.slope(dem).rename('slope').clip(region)
    aspect = ee.Terrain.aspect(dem).rename('aspect').clip(region)
    elevation = dem.rename('elevation').clip(region)

    # Hydrology
    hand = (ee.Image('users/gena/GlobalHAND/30m/hand-1000')
            .clip(region).rename('hand'))
    mean_elev = dem.focalMean(5, 'square')
    tpi = dem.subtract(mean_elev).rename('tpi').clip(region)

    # Sentinel-2 spectral indices (Landslide4Sense features)
    current_year = datetime.now().year
    s2 = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(region)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
          .filterDate(f'{current_year - 1}-01-01', f'{current_year}-12-31')
          .map(mask_s2_clouds)
          .median())
    ndvi = s2.normalizedDifference(['B8', 'B4']).rename('ndvi').clip(region)
    ndwi = s2.normalizedDifference(['B3', 'B8']).rename('ndwi').clip(region)
    bsi = (s2.expression(
        '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))',
        {'SWIR': s2.select('B11'), 'RED': s2.select('B4'),
         'NIR': s2.select('B8'), 'BLUE': s2.select('B2')})
        .rename('bsi').clip(region))

    # Precipitation (CHIRPS)
    try:
        chirps = (ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                  .filterBounds(region)
                  .filterDate(f'{current_year - 1}-01-01', f'{current_year - 1}-12-31'))
        precipitation = chirps.sum().rename('precipitation').clip(region)
    except:
        precipitation = ee.Image(0).rename('precipitation').clip(region)

    # Stack all bands
    stack = (elevation
             .addBands(slope)
             .addBands(aspect)
             .addBands(hand)
             .addBands(tpi)
             .addBands(ndvi)
             .addBands(ndwi)
             .addBands(bsi)
             .addBands(precipitation))

    return stack


def build_overlay_layers(region):
    """Build visualization-only layers (Precipitation, Temperature)."""
    current_year = datetime.now().year
    last_year = current_year - 1

    precip_tiles = None
    try:
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

    temp_tiles = None
    try:
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

    return precip_tiles, temp_tiles


def analyze_landslide_xgb(geojson_geom, num_samples=200):
    """
    Landslide susceptibility mapping using GEE Gradient Tree Boost (XGBoost).
    
    Uses the SAME approach as the RF mode:
    - Builds terrain stack ON GEE
    - Trains smileGradientTreeBoost classifier ON GEE
    - Generates GEE tile output (probability + classes)
    - Returns IDENTICAL format to RF mode = same smooth map tiles
    """
    print("[LANDSLIDE XGB] --- Starting GEE Gradient Tree Boost Analysis ---")
    init_gee()
    print("[LANDSLIDE XGB] OK GEE initialized")

    region = ee.Geometry(geojson_geom)

    # Build terrain stack (Landslide4Sense-inspired features)
    print("[LANDSLIDE XGB] >> Building terrain stack (9 variables)...")
    stack = build_xgb_terrain_stack(region)
    band_names = stack.bandNames()
    feature_bands = ['elevation', 'slope', 'aspect', 'hand', 'tpi',
                     'ndvi', 'ndwi', 'bsi', 'precipitation']

    # ── SLOPE UNIT GENERATION ──────────────────────────────────
    print("[LANDSLIDE XGB] >> Generating Slope Units (HydroSHEDS Catchments)...")
    basins = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_12').filterBounds(region)

    print("[LANDSLIDE XGB] >> Aggregating terrain features per Catchment...")
    stack_subset = stack.select(feature_bands)
    basin_stats = stack_subset.reduceRegions(
        collection=basins,
        reducer=ee.Reducer.mean(),
        scale=SAMPLE_SCALE,
        tileScale=4
    )

    valid_samples = basin_stats.filter(ee.Filter.notNull(feature_bands))
    total_valid = safe_get_info(valid_samples.size(), 0)
    print(f"[LANDSLIDE XGB]   Total Catchments Analyzed: {total_valid}")

    if total_valid < 4:
        raise ValueError(
            f"AOI too small! Found only {total_valid} valid catchments. "
            f"Please draw a larger area to span multiple valleys."
        )

    # Split into high-risk (steepest 50%) and low-risk (flattest 50%)
    split_size = max(total_valid // 2, 2)
    occurrence = valid_samples.sort('slope', False).limit(split_size).map(lambda f: f.set('class', 1))
    non_occurrence = valid_samples.sort('slope', True).limit(split_size).map(lambda f: f.set('class', 0))

    num_occ = safe_get_info(occurrence.size(), 0)
    print(f"[LANDSLIDE XGB]   High-risk proxy Catchments: {num_occ}")

    samples = occurrence.merge(non_occurrence).randomColumn('random')
    training = samples.filter(ee.Filter.lte('random', 0.8))
    testing = samples.filter(ee.Filter.gt('random', 0.8))

    train_size = safe_get_info(training.size(), 0)
    test_size = safe_get_info(testing.size(), 0)
    print(f"[LANDSLIDE XGB] >> Training GradientTreeBoost ({NUM_TREES} trees, depth={MAX_DEPTH}, "
          f"Train: {train_size}, Test: {test_size})...")

    # ── GRADIENT TREE BOOST (GEE's XGBoost) ────────────────────
    gtb = (ee.Classifier.smileGradientTreeBoost(
            numberOfTrees=NUM_TREES,
            shrinkage=SHRINKAGE)
           .train(training, 'class', feature_bands)
           .setOutputMode('PROBABILITY'))

    # Classify all catchments
    classified_basins = valid_samples.classify(gtb, 'probability')

    print("[LANDSLIDE XGB] >> Converting to probability raster map...")
    susceptibility = (classified_basins
                      .reduceToImage(['probability'], ee.Reducer.first())
                      .rename('probability').clip(region))

    # Reclassify into 4 risk categories
    classes = (susceptibility
               .where(susceptibility.lt(0.25), 1)
               .where(susceptibility.gte(0.25).And(susceptibility.lt(0.50)), 2)
               .where(susceptibility.gte(0.50).And(susceptibility.lt(0.65)), 3)
               .where(susceptibility.gte(0.65), 4)
               .rename('risk_class'))

    # ── AREA CALCULATIONS ──────────────────────────────────────
    print("[LANDSLIDE XGB] >> Calculating risk areas...")
    pixel_area = ee.Image.pixelArea().divide(1e6)
    area_dict = {}
    try:
        grouped_area_result = safe_get_info(
            pixel_area.addBands(classes).reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName='risk_class'),
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
        print(f"[LANDSLIDE XGB]   Area calc failed ({e}), using fallback...")
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
            print(f"[LANDSLIDE XGB]   Fallback also failed ({e2}). Areas will be 0.")

    low_area = area_dict.get(1, 0.0)
    mod_area = area_dict.get(2, 0.0)
    high_area = area_dict.get(3, 0.0)
    vhigh_area = area_dict.get(4, 0.0)

    print(f"[LANDSLIDE XGB]   Low Risk: {low_area:.2f} km2")
    print(f"[LANDSLIDE XGB]   Moderate Risk: {mod_area:.2f} km2")
    print(f"[LANDSLIDE XGB]   High Risk: {high_area:.2f} km2")
    print(f"[LANDSLIDE XGB]   Very High Risk: {vhigh_area:.2f} km2")

    # Feature importance
    print("[LANDSLIDE XGB] >> Extracting feature importance...")
    gtb_explain = safe_get_info(gtb.explain(), {})
    importance = gtb_explain.get('importance', {})
    total_imp = sum(importance.values()) if importance else 1
    importance_pct = {k: round(v / total_imp * 100, 1) for k, v in importance.items()}

    # Accuracy
    print("[LANDSLIDE XGB] >> Computing accuracy metrics...")
    try:
        tested = testing.classify(gtb.setOutputMode('CLASSIFICATION'))
        error_matrix = tested.errorMatrix('class', 'classification')
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

    stats = {
        'low_risk_km2': round(low_area, 2),
        'moderate_risk_km2': round(mod_area, 2),
        'high_risk_km2': round(high_area, 2),
        'very_high_risk_km2': round(vhigh_area, 2),
        'total_km2': round(low_area + mod_area + high_area + vhigh_area, 2),
        'accuracy': round(accuracy * 100, 1) if accuracy else 0,
        'auc': 0,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'num_training_samples': train_size,
        'num_test_samples': test_size,
    }

    # ── MAP TILES (same format as RF mode) ─────────────────────
    print("[LANDSLIDE XGB] >> Generating map tiles (with Polygon Borders)...")
    base_class_vis = classes.visualize(
        min=1, max=4, palette=['#00c48c', '#f5d623', '#f5a623', '#ff3d5a'])
    base_prob_vis = susceptibility.visualize(
        min=0, max=1, palette=['#00c48c', '#90ee90', '#ffffcc', '#f5a623', '#ff3d5a'])

    # Catchment polygon borders
    empty = ee.Image().byte()
    outlines = empty.paint(featureCollection=valid_samples, color=1, width=1)
    outline_vis = outlines.visualize(palette=['#000000'])

    class_vis = ee.ImageCollection([base_class_vis, outline_vis]).mosaic()
    prob_vis = ee.ImageCollection([base_prob_vis, outline_vis]).mosaic()
    slope_vis = stack.select('slope').visualize(
        min=0, max=60, palette=['#0d1117', '#1c2535', '#f5a623', '#ff3d5a', '#ff0000'])
    elevation_vis = stack.select('elevation').visualize(
        min=0, max=3000, palette=['#00c48c', '#90ee90', '#ffffcc', '#f5a623', '#ff3d5a', '#800000'])
    hand_vis = stack.select('hand').visualize(
        min=0, max=100, palette=['#0d1117', '#1c2535', '#4da6ff', '#00d4aa', '#00c48c'])

    class_tiles = get_map_tiles(class_vis)
    print("[LANDSLIDE XGB]   OK class_tiles")
    prob_tiles = get_map_tiles(prob_vis)
    print("[LANDSLIDE XGB]   OK probability_tiles")
    slope_tiles = get_map_tiles(slope_vis)
    print("[LANDSLIDE XGB]   OK slope_tiles")
    elev_tiles = get_map_tiles(elevation_vis)
    print("[LANDSLIDE XGB]   OK elevation_tiles")
    hand_tiles = get_map_tiles(hand_vis)
    print("[LANDSLIDE XGB]   OK hand_tiles")

    # Climate overlays
    print("[LANDSLIDE XGB] >> Building climate overlay layers...")
    precip_tiles, temp_tiles = build_overlay_layers(region)
    if precip_tiles:
        print("[LANDSLIDE XGB]   OK precip_tiles")
    if temp_tiles:
        print("[LANDSLIDE XGB]   OK temp_tiles")

    print("[LANDSLIDE XGB] --- Analysis complete! ---")

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

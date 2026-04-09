# ================================================================
#  LAND USE LAND COVER (LULC) — Custom 1D CNN Inference
# ================================================================

import os
import ee
import json
import numpy as np
import rasterio
import urllib.request
import time
import base64
import io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from .gee_utils import init_gee, mask_s2_clouds

# Try to load tensorflow (optional so backend doesn't crash if TF fails)
try:
    import tensorflow as tf
except ImportError:
    tf = None

LULC_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'training_data', 'lulc_training_data'))
MODEL_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'backend', 'ml_models', 'lulc_custom_model.h5'))
CLASSES_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'backend', 'ml_models', 'lulc_classes.npy'))
CSV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'lulc_samples.csv'))
TEMP_TIF = "temp_lulc_roi.tif"

BANDS = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12']
INDEX_BANDS = ['NDVI', 'NDBI', 'MNDWI', 'NDSLI']

# Dynamic World style colors
COLORS = ['#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1']
cmap = ListedColormap(COLORS)

def compute_indices(img):
    ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
    ndbi = img.normalizedDifference(['B11', 'B8']).rename('NDBI')
    mndwi = img.normalizedDifference(['B3', 'B11']).rename('MNDWI')
    ndsli = img.normalizedDifference(['B11', 'B4']).rename('NDSLI')
    return img.addBands([ndvi, ndbi, mndwi, ndsli])

def get_s2_stack(region):
    s2_col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
              .filterBounds(region)
              .filterDate('2024-01-01', '2024-12-31')
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(mask_s2_clouds))
    
    composite = s2_col.median().clip(region)
    composite = compute_indices(composite)
    return composite.select(BANDS + INDEX_BANDS).toFloat()

def predict_lulc_custom_b64(geojson_geom):
    print(f"\n[CUSTOM LULC] ━━━ Starting 1D-CNN Base64 Inference ━━━")
    if tf is None:
        raise RuntimeError("TensorFlow is not installed. Cannot run custom 1D CNN.")
    
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Custom model not found at {MODEL_PATH}. Please run lulc_trainer.py first.")

    init_gee()
    
    region = ee.Geometry(geojson_geom)
    print(f"[CUSTOM LULC] Fetching Sentinel-2 10-band stack...")
    
    composite = get_s2_stack(region)
    
    try:
        url = composite.getDownloadURL({
            'bands': BANDS + INDEX_BANDS,
            'region': region,
            'scale': 10,
            'crs': 'EPSG:4326',
            'format': 'GEO_TIFF'
        })
        urllib.request.urlretrieve(url, TEMP_TIF)
    except Exception as e:
        raise RuntimeError(f"Error downloading from GEE: {e}")

    print(f"[CUSTOM LULC] Running Neural Network Inference...")
    model = tf.keras.models.load_model(MODEL_PATH)
    
    with rasterio.open(TEMP_TIF) as src:
        img_data = src.read()
        bounds = src.bounds
        lng_min, lat_min, lng_max, lat_max = bounds.left, bounds.bottom, bounds.right, bounds.top
        coords = [
            [lng_min, lat_max], # NW
            [lng_max, lat_max], # NE
            [lng_max, lat_min], # SE
            [lng_min, lat_min]  # SW
        ]

    _, H, W = img_data.shape
    img_flat = img_data.reshape(10, H * W).T
    img_flat = np.nan_to_num(img_flat, nan=0.0, posinf=1.0, neginf=-1.0)
    
    X_input = img_flat.reshape(H * W, 10, 1)
    preds = model.predict(X_input, batch_size=2048, verbose=0)
    
    class_indices = np.argmax(preds, axis=1)
    
    if os.path.exists(CLASSES_PATH):
        original_classes = np.load(CLASSES_PATH)
        predicted_classes = original_classes[class_indices]
    else:
        predicted_classes = class_indices

    # Shift 1-indexed classes down to 0-indexed so they align with LULC_PALETTE
    # (Water = 1 -> 0, Trees = 2 -> 1, etc.)
    out_img = predicted_classes.reshape(H, W) - 1
    
    # Save array as Image overlay without margins to perfectly fit bounding box
    fig = plt.figure(figsize=(W/100, H/100), dpi=100, frameon=False)
    ax = plt.Axes(fig, [0., 0., 1., 1.])
    ax.set_axis_off()
    fig.add_axes(ax)
    ax.imshow(out_img, cmap=cmap, vmin=0, vmax=8, aspect='auto')

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0, transparent=True)
    plt.close(fig)
    
    b64_str = base64.b64encode(buf.getvalue()).decode('utf-8')
    
    print(f"[CUSTOM LULC] ━━━ Base64 Rendering Complete! ━━━")
    return {
        "status": "success",
        "custom_image_b64": b64_str,
        "coordinates": coords,
        "stats": {
            "source": "Custom 1D-CNN (TensorFlow)",
            "resolution": "10m",
            "year": "2024",
            "images_used": 1,
            "total_area_km2": "N/A"
        }
    }


import csv

def add_active_learning_sample(geojson_geom, class_label: int, year: int = 2024, season: str = 'annual'):
    print(f"\n[CUSTOM LULC HITL] ━━━ Extracting Training Label {class_label} ━━━")
    init_gee()
    
    region = ee.Geometry(geojson_geom)
    composite = get_s2_stack(region)
    
    reduced = composite.reduceRegion(
        reducer=ee.Reducer.median(),
        geometry=region,
        scale=10,
        maxPixels=1e9
    ).getInfo()
    
    row = [
        reduced.get('B4', 0),
        reduced.get('B3', 0),
        reduced.get('B2', 0),
        reduced.get('B8', 0),
        reduced.get('B11', 0),
        reduced.get('B12', 0),
        reduced.get('NDVI', 0),
        reduced.get('NDBI', 0),
        reduced.get('MNDWI', 0),
        reduced.get('NDSLI', 0),
        class_label,
        'user_hitl'
    ]
    
    print(f"[CUSTOM LULC HITL] Appending new features to {CSV_PATH}: {row}")
    
    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(row)
        
    print(f"[CUSTOM LULC HITL] Triggering lulc_trainer.py to fine-tune the model...")
    try:
        # Import dynamically to prevent circular dependencies
        import sys
        import os
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))
        from ml_training.lulc_trainer import train_lulc_model
        train_lulc_model()
        print(f"[CUSTOM LULC HITL] Model Retrained Successfully.")
        return {"status": "success", "message": "Model updated successfully with user label!"}
    except Exception as e:
        print(f"[CUSTOM LULC HITL] Retraining failed: {e}")
        return {"status": "error", "message": f"Features appended but retraining failed: {str(e)}"}


def add_ui_distill_sample(geojson_geom, year: int = 2024, num_points: int = 250):
    print(f"\n[AUTO-DISTILL UI] ━━━ Mining {num_points} Pixels inside Polygon using Dynamic World ━━━")
    init_gee()

    region = ee.Geometry(geojson_geom)
    
    # 1. Fetch Sentinel-2 Features (The 'X' variables)
    s2_col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
              .filterBounds(region)
              .filterDate(f'{year}-01-01', f'{year}-12-31')
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(mask_s2_clouds))

    s2_median = s2_col.median().clip(region)
    # Re-use compute_indices function from this file
    s2_with_indices = compute_indices(s2_median)
    features_img = s2_with_indices.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'NDVI', 'NDBI', 'MNDWI', 'NDSLI']).toFloat()

    # 2. Fetch Dynamic World Labels (The 'Y' Target)
    dw_col = (ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
               .filterBounds(region)
               .filterDate(f'{year}-01-01', f'{year}-12-31'))
    
    dw_mode = dw_col.select('label').mode().clip(region)

    combined_img = features_img.addBands(dw_mode)

    print(f"[AUTO-DISTILL UI] Sampling points...")
    samples = combined_img.sample(
        region=region,
        scale=10, 
        numPixels=num_points,
        seed=42,
        geometries=False
    )

    fetched_data = samples.getInfo()
    features = fetched_data.get('features', [])
    
    rows_written = 0
    
    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.writer(f)
        for feat in features:
            props = feat.get('properties', {})
            if 'label' not in props or 'B4' not in props:
                continue
            
            target_class = int(props['label']) + 1
            
            row = [
                props.get('B4', 0), props.get('B3', 0), props.get('B2', 0), props.get('B8', 0),
                props.get('B11', 0), props.get('B12', 0), props.get('NDVI', 0), props.get('NDBI', 0),
                props.get('MNDWI', 0), props.get('NDSLI', 0), target_class, 'ui_auto_distill'
            ]
            writer.writerow(row)
            rows_written += 1

    print(f"[AUTO-DISTILL UI] Added {rows_written} new rows labeled as 'ui_auto_distill'. Triggering trainer...")
    
    try:
        import sys
        import os
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))
        from ml_training.lulc_trainer import train_lulc_model
        train_lulc_model()
        return {"status": "success", "message": f"Successfully auto-labeled {rows_written} pixels from Dynamic World and retrained Model!"}
    except Exception as e:
        return {"status": "error", "message": f"Features appended but retraining failed: {str(e)}"}

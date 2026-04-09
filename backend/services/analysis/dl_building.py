import ee
import requests
import numpy as np
import io
import base64
import rasterio
from PIL import Image
import os
import matplotlib.pyplot as plt
import io
import json
import logging
import asyncio
from backend.services.analysis.gee_utils import init_gee

logger = logging.getLogger(__name__)

# Attempt to load tensorflow
try:
    import tensorflow as tf
    from tensorflow.keras.models import load_model, Model
    from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, UpSampling2D, concatenate, Dropout, BatchNormalization, Activation
    from tensorflow.keras.optimizers import Adam
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    logger.warning("Tensorflow not available for dl_building.py")

model_path = os.path.join("backend", "ml_models", "custom_building_best.h5")

# Global memory model for fast inference
_building_model = None

def get_building_model():
    global _building_model
    if not TF_AVAILABLE:
        raise RuntimeError("TensorFlow is not installed.")
        
    if _building_model is None:
        candidates = [
            os.environ.get("BUILDING_MODEL_PATH", ""),
            os.path.join("backend", "ml_models", "custom_building_best.h5"),
            os.path.join('models', 'building', 'best_model.h5'),
            os.path.join(os.path.dirname(__file__), '..', '..', '..', 'backend', 'ml_models', 'model_output.h5')
        ]
        
        resolved = None
        for p in candidates:
            if not p: continue
            ap = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', p)) if not os.path.isabs(p) else os.path.abspath(p)
            if os.path.exists(ap):
                resolved = ap
                break
                
        if resolved is None:
            searched = "\n".join([f"- {c}" for c in candidates if c])
            raise FileNotFoundError(
                "Building DL model file not found.\n"
                "Please place 'model_output.h5' in your tutor reference folder or 'custom_building_best.h5' in the root directory.\n"
                f"Searched locations:\n{searched}"
            )
            
        logger.info(f"Loading Building U-Net from {resolved}")
        try:
            _building_model = load_model(resolved, compile=False)
        except Exception as e:
            logger.error(f"Error natively loading {resolved}: {e}")
            raise
            
    return _building_model

def get_rgb_composite(region, include_labels=False):
    """
    Downloads a 3-band (RGB) Sentinel-2 patch at 256x256 resolution.
    If include_labels=True, appends Google Open Buildings mask as 4th band.
    """
    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(region) \
           .filterDate('2023-01-01', '2024-01-01') \
           .median().select(['B4', 'B3', 'B2'])
           
    # Scale from 0..10000 to 0..255 roughly (or 0..1)
    rgb = s2.divide(10000).clamp(0, 0.3).multiply(255).toByte()
    
    if include_labels:
        # Load Google Open Buildings
        buildings = ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons").filterBounds(region)
        # Create a mask where buildings are 1, else 0
        b_mask = ee.Image().byte().paint(buildings, 1).unmask(0).rename('label')
        rgb = rgb.addBands(b_mask)
        
    url = rgb.getDownloadURL({
        'format': 'GEO_TIFF',
        'dimensions': '256x256',
        'region': region
    })
    return url

def download_256_patch(region, include_labels=False, return_raw_bytes=False):
    url = get_rgb_composite(region, include_labels=include_labels)
    resp = requests.get(url)
    if resp.status_code != 200:
        raise Exception(f"Failed to fetch RGB image from GEE. Status: {resp.status_code}")
    
    raw_bytes = resp.content
    
    with rasterio.MemoryFile(raw_bytes) as memfile:
        with memfile.open() as ds:
            arr = ds.read()  # (Bands, H, W)
    
    # rasterio returns (Bands, H, W) -> transpose to (H, W, Bands)
    if len(arr.shape) == 3:
        arr = np.transpose(arr, (1, 2, 0)) # (256, 256, Channels)
    elif len(arr.shape) == 2:
        arr = np.expand_dims(arr, axis=-1)
        
    arr = np.nan_to_num(arr, nan=0.0).astype(np.float32)
    
    if return_raw_bytes:
        return arr, raw_bytes
    return arr

def analyze_building_dl(geojson_geom):
    init_gee()
    region = ee.Geometry(geojson_geom)
    arr = download_256_patch(region, include_labels=False)
    
    # Scale to 0-1 for normalized inputs to U-Net
    X_test = arr[:, :, :3] / 255.0
    X_test = np.expand_dims(X_test, axis=0) # (1, 256, 256, 3)
    
    model = get_building_model()
    # Predict building mask
    pred = model.predict(X_test)[0, :, :, 0] # (256, 256)
    
    # Apply threshold
    pred_mask = np.where(pred >= 0.5, 1, 0)
    
    total_pixels = 256 * 256
    building_pixels = np.sum(pred_mask)
    area_ratio = float(building_pixels / total_pixels)
    
    # Use ee.Geometry to approximate actual geographic area for stats
    aoi_area_sqm = region.area().getInfo()
    built_area_ha = (aoi_area_sqm * area_ratio) / 10000.0
    
    stats = [
        {"name": "Total Built-Up Area (ha)", "value": f"{built_area_ha:.2f}"},
        {"name": "Building Density", "value": f"{area_ratio*100:.1f}%"},
        {"name": "DL Inference Engine", "value": "ResU-Net (2D-CNN)"}
    ]
    
    # Create colored transparent mask (Red for buildings, fully transparent elsewhere)
    colored_img = np.zeros((256, 256, 4), dtype=np.uint8)
    colored_img[pred_mask == 1] = [255, 60, 60, 180] # Red-ish buildings
    
    buf = io.BytesIO()
    plt.imsave(buf, colored_img, format='png')
    img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    
    coords = geojson_geom.get('coordinates', [[]])[0]
    lats = [c[1] for c in coords]
    lons = [c[0] for c in coords]
    # Mapbox image source needs 4 corners: [TL, TR, BR, BL]
    bounds = [
        [min(lons), max(lats)],  # Top-Left
        [max(lons), max(lats)],  # Top-Right
        [max(lons), min(lats)],  # Bottom-Right
        [min(lons), min(lats)]   # Bottom-Left
    ]
    
    return {
        'stats': stats,
        'custom_image_b64': img_b64,
        'coordinates': bounds,
        'alert': 'Custom DL Inference Complete.'
    }

def train_building_active_learning(geojson_geom, class_label: int):
    """ Fine-tunes the local building UNet on a user-provided drawn patch. """
    init_gee()
    region = ee.Geometry(geojson_geom)
    arr = download_256_patch(region, include_labels=False)
    
    X_train = arr[:, :, :3] / 255.0
    X_train = np.expand_dims(X_train, axis=0) # (1, 256, 256, 3)
    y_train = np.full((1, 256, 256, 1), class_label, dtype=np.float32)
    
    model = get_building_model()
    if not hasattr(model, 'optimizer') or model.optimizer is None:
        model.compile(optimizer=Adam(learning_rate=1e-4), loss='binary_crossentropy', metrics=['accuracy'])
        
    # Append to dataset buffer to avoid catastrophic forgetting
    # We should ideally load previous data, but here we just append this patch to disk
    import threading
    import time
    stamp = int(time.time() * 1000)
    data_dir = os.path.join("data", "training_data", "building_training_data", "processed")
    os.makedirs(data_dir, exist_ok=True)
    np.save(os.path.join(data_dir, f"active_{stamp}_X.npy"), arr[:, :, :3])
    np.save(os.path.join(data_dir, f"active_{stamp}_y.npy"), y_train[0, :, :, 0])
    
    # Still train slightly on current pattern
    model.fit(X_train, y_train, epochs=2, batch_size=1, verbose=1)
    
    # Save full model to maintain compatibility
    model.save(model_path)
    return True

def train_building_distill(geojson_geom):
    """ Auto-Trains local building UNet on GEE Open Buildings ground truth mask. """
    init_gee()
    region = ee.Geometry(geojson_geom)
    arr = download_256_patch(region, include_labels=True) # 4 bands: RGB + Mask
    
    X_train = arr[:, :, :3] / 255.0
    X_train = np.expand_dims(X_train, axis=0) # (1, 256, 256, 3)
    
    y_mask = arr[:, :, 3] # The 4th band is the GEE Open Buildings Google mask
    y_mask = np.where(y_mask > 0.5, 1.0, 0.0) 
    y_train = np.expand_dims(y_mask.astype(np.float32), axis=(0, -1)) # (1, 256, 256, 1)
    
    model = get_building_model()
    if not hasattr(model, 'optimizer') or model.optimizer is None:
        model.compile(optimizer=Adam(learning_rate=1e-4), loss='binary_crossentropy', metrics=['accuracy'])
        
    import time
    stamp = int(time.time() * 1000)
    data_dir = os.path.join("data", "training_data", "building_training_data", "processed")
    os.makedirs(data_dir, exist_ok=True)
    np.save(os.path.join(data_dir, f"distill_{stamp}_X.npy"), arr[:, :, :3])
    np.save(os.path.join(data_dir, f"distill_{stamp}_y.npy"), y_mask)

    model.fit(X_train, y_train, epochs=3, batch_size=1, verbose=1)
    
    # Save full model to maintain compatibility with training script
    model.save(model_path)
    return True

# ── Predefined urban locations for Auto-Collect (lat, lon, name) ──
BUILDING_COLLECT_LOCATIONS = [
    {"name": "Mumbai, India",      "lat": 19.076,  "lon": 72.877,  "size": 0.02},
    {"name": "Delhi, India",       "lat": 28.644,  "lon": 77.216,  "size": 0.02},
    {"name": "Pune, India",        "lat": 18.520,  "lon": 73.856,  "size": 0.02},
    {"name": "Bangalore, India",   "lat": 12.972,  "lon": 77.595,  "size": 0.02},
    {"name": "Hyderabad, India",   "lat": 17.385,  "lon": 78.487,  "size": 0.02},
    {"name": "Chennai, India",     "lat": 13.083,  "lon": 80.270,  "size": 0.02},
    {"name": "Kolkata, India",     "lat": 22.573,  "lon": 88.364,  "size": 0.02},
    {"name": "Ahmedabad, India",   "lat": 23.023,  "lon": 72.572,  "size": 0.02},
    {"name": "Jaipur, India",      "lat": 26.913,  "lon": 75.787,  "size": 0.02},
    {"name": "Nagpur, India",      "lat": 21.146,  "lon": 79.088,  "size": 0.02},
]

BUILDING_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'training_data', 'building_training_data')

def _update_collection_log(data_dir, entry):
    """Update or create collection_log.json with new entry."""
    from datetime import datetime
    log_path = os.path.join(data_dir, 'collection_log.json')
    
    if os.path.exists(log_path):
        with open(log_path, 'r') as f:
            log = json.load(f)
    else:
        log = {"total_patches": 0, "last_updated": "", "locations": []}
    
    # Avoid duplicate entries
    existing_names = [l['name'] for l in log['locations']]
    if entry['name'] not in existing_names:
        log['locations'].append(entry)
    
    log['total_patches'] = len(log['locations'])
    log['last_updated'] = datetime.now().isoformat()
    
    with open(log_path, 'w') as f:
        json.dump(log, f, indent=2)

def auto_collect_building(num_locations=5):
    """
    Auto-Collect: Downloads RGB + Google Open Buildings mask from predefined
    urban locations. Saves:
      - raw_tiles/*.tif   (raw GeoTIFF from GEE, QGIS-compatible)
      - processed/*_X.npy (normalized RGB)
      - processed/*_y.npy (binary building mask)
      - collection_log.json (metadata tracker)
    Then trains the U-Net from ALL stored patches on disk.
    """
    from datetime import datetime
    init_gee()
    
    raw_dir = os.path.join(BUILDING_DATA_DIR, 'raw_tiles')
    proc_dir = os.path.join(BUILDING_DATA_DIR, 'processed')
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(proc_dir, exist_ok=True)
    
    locations = BUILDING_COLLECT_LOCATIONS[:num_locations]
    new_collected = 0
    
    # Step 1: Download and SAVE to organized directories
    for loc in locations:
        safe_name = loc['name'].replace(', ', '_').replace(' ', '_')
        tif_path = os.path.join(raw_dir, f"{safe_name}.tif")
        x_path = os.path.join(proc_dir, f"{safe_name}_X.npy")
        y_path = os.path.join(proc_dir, f"{safe_name}_y.npy")
        
        if os.path.exists(x_path) and os.path.exists(y_path):
            logger.info(f"[AUTO-COLLECT] ⏩ {loc['name']} already cached, skipping download.")
            continue
        
        try:
            logger.info(f"[AUTO-COLLECT] 📡 Downloading patch from {loc['name']}...")
            sz = loc['size']
            bbox = ee.Geometry.Rectangle([
                loc['lon'] - sz, loc['lat'] - sz,
                loc['lon'] + sz, loc['lat'] + sz
            ])
            
            arr, raw_bytes = download_256_patch(bbox, include_labels=True, return_raw_bytes=True)
            
            # Save raw GeoTIFF
            with open(tif_path, 'wb') as f:
                f.write(raw_bytes)
            
            # Process and save
            X_patch = arr[:, :, :3] / 255.0
            y_patch = arr[:, :, 3]
            y_patch = np.where(y_patch > 0.5, 1.0, 0.0)
            
            np.save(x_path, X_patch.astype(np.float32))
            np.save(y_path, y_patch.astype(np.float32))
            
            building_pixels = int(np.sum(y_patch))
            total_pixels = 256 * 256
            
            # Update collection log
            _update_collection_log(BUILDING_DATA_DIR, {
                "name": loc['name'],
                "lat": loc['lat'], "lon": loc['lon'],
                "collected_at": datetime.now().isoformat(),
                "building_pixels": building_pixels,
                "total_pixels": total_pixels,
                "density": f"{building_pixels/total_pixels*100:.1f}%",
                "raw_tile": f"raw_tiles/{safe_name}.tif",
                "processed_X": f"processed/{safe_name}_X.npy",
                "processed_y": f"processed/{safe_name}_y.npy"
            })
            
            new_collected += 1
            logger.info(f"[AUTO-COLLECT] ✅ Saved {loc['name']} — {building_pixels} building pixels ({building_pixels/total_pixels*100:.1f}%)")
            
        except Exception as e:
            logger.warning(f"[AUTO-COLLECT] ⚠ Skipped {loc['name']}: {e}")
            continue
    
    # Step 2: Load ALL processed patches from disk
    X_all = []
    y_all = []
    
    for f in os.listdir(proc_dir):
        if f.endswith('_X.npy'):
            base = f.replace('_X.npy', '')
            x_path = os.path.join(proc_dir, f)
            y_path = os.path.join(proc_dir, f"{base}_y.npy")
            if os.path.exists(y_path):
                X_all.append(np.load(x_path))
                y_all.append(np.load(y_path))
    
    if len(X_all) == 0:
        raise RuntimeError("No training data found on disk. Download failed for all locations.")
    
    X_train = np.array(X_all, dtype=np.float32)
    y_train = np.expand_dims(np.array(y_all, dtype=np.float32), axis=-1)
    
    total_patches = len(X_all)
    logger.info(f"[AUTO-COLLECT] → Training U-Net on {total_patches} patches from disk (Shape: {X_train.shape})...")
    
    # Step 3: Train model
    model = get_building_model()
    if not hasattr(model, 'optimizer') or model.optimizer is None:
        model.compile(optimizer=Adam(learning_rate=1e-4), loss='binary_crossentropy', metrics=['accuracy'])
    
    model.fit(X_train, y_train, epochs=5, batch_size=1, verbose=1)
    model.save_weights(model_path)
    
    return {
        "status": "success",
        "message": f"Collected {new_collected} new patches. Trained on {total_patches} total patches. Data saved in {BUILDING_DATA_DIR}"
    }




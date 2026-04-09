"""
auto_labeler.py
================
Knowledge Distillation & Data Mining Script

This script acts as a background teacher-student pipeline. 
It queries the Google Dynamic World (Cloud API) for high-confidence LULC pixel labels 
and pairs them with exact 10-band Sentinel-2 pixel signatures. 
It then appends these rows to the local dataset (lulc_samples.csv) to scale the Custom 1D-CNN.
"""

import ee
import os
import csv
import sys
from dotenv import load_dotenv

load_dotenv()
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))
from backend.services.analysis.gee_utils import init_gee, mask_s2_clouds

def compute_indices(img):
    ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
    ndbi = img.normalizedDifference(['B11', 'B8']).rename('NDBI')
    mndwi = img.normalizedDifference(['B3', 'B11']).rename('MNDWI')
    ndsli = img.normalizedDifference(['B11', 'B4']).rename('NDSLI')
    return img.addBands([ndvi, ndbi, mndwi, ndsli])

def extract_training_pixels(region: ee.Geometry, num_points: int = 500, year: int = 2024):
    print(f"\n[AUTO-LABELER] ━━━ Mining {num_points} Weak-Supervision Pixels ━━━")

    # 1. Fetch Sentinel-2 Features (The 'X' variables)
    s2_col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
              .filterBounds(region)
              .filterDate(f'{year}-01-01', f'{year}-12-31')
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(mask_s2_clouds))

    s2_median = s2_col.median().clip(region)
    s2_with_indices = compute_indices(s2_median)
    features_img = s2_with_indices.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'NDVI', 'NDBI', 'MNDWI', 'NDSLI']).toFloat()

    # 2. Fetch Dynamic World Labels (The 'Y' Target)
    dw_col = (ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
               .filterBounds(region)
               .filterDate(f'{year}-01-01', f'{year}-12-31'))
    
    # DW mode class (0-8)
    dw_mode = dw_col.select('label').mode().clip(region)

    # Combine X and Y into a single multi-band image
    combined_img = features_img.addBands(dw_mode)

    print(f"[AUTO-LABELER] Sampling Google Earth Engine...")
    
    # 3. Randomly sample N points
    samples = combined_img.sample(
        region=region,
        scale=10, 
        numPixels=num_points,
        seed=42,
        geometries=False
    )

    # Pull the exact feature dictionaries back to python
    fetched_data = samples.getInfo()
    features = fetched_data.get('features', [])
    
    print(f"[AUTO-LABELER] Successfully extracted {len(features)} valid multi-band pixels.")

    # 4. Append to CSV
    # Expected columns: B4, B3, B2, B8, B11, B12, NDVI, NDBI, MNDWI, NDSLI, class, sample
    csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../data/training_data/lulc_training_data/samples/lulc_samples.csv'))
    
    # Track distributions
    class_counts = {i: 0 for i in range(1, 10)}
    rows_written = 0
    
    with open(csv_path, 'a', newline='') as f:
        writer = csv.writer(f)
        for feat in features:
            props = feat.get('properties', {})
            
            # Skip if any band is missing (cloud mask nulls)
            if 'label' not in props or 'B4' not in props:
                continue
                
            # Dynamic world labels are 0-8. Our internal mapping is 1-9.
            dw_label = int(props['label'])
            target_class = dw_label + 1
            
            row = [
                props.get('B4', 0),
                props.get('B3', 0),
                props.get('B2', 0),
                props.get('B8', 0),
                props.get('B11', 0),
                props.get('B12', 0),
                props.get('NDVI', 0),
                props.get('NDBI', 0),
                props.get('MNDWI', 0),
                props.get('NDSLI', 0),
                target_class,
                'auto_distill'
            ]
            
            writer.writerow(row)
            class_counts[target_class] += 1
            rows_written += 1

    print(f"[AUTO-LABELER] Database updated! Added {rows_written} new rows labeled as 'auto_distill'.")
    print(f"[AUTO-LABELER] Class distribution acquired: {class_counts}")
    
    return rows_written

if __name__ == "__main__":
    try:
        ee.Initialize(project='shaped-crossbar-467909-b8')
    except Exception as e:
        print("GEE Init Error:", e)
    except Exception as e:
        print("GEE Init Error:", e)

    # Test Polygon (A region near Mumbai/Pune, India with varied classes)
    roi_polygon = ee.Geometry.Polygon([
        [[73.5, 18.5],
         [74.0, 18.5],
         [74.0, 19.0],
         [73.5, 19.0],
         [73.5, 18.5]]
    ])
    
    try:
        extract_training_pixels(region=roi_polygon, num_points=2000)
        
        print(f"\n[AUTO-LABELER] Would you like to re-train the model on the expanded dataset now? (y/n)")
        ans = input("> ").strip().lower()
        if ans == 'y':
            from lulc_trainer import train_lulc_model
            train_lulc_model()
    except Exception as e:
        print(f"[AUTO-LABELER] Error: {e}")

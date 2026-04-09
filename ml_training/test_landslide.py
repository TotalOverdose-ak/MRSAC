import sys
import os
import json

# Add the project root to sys.path so 'backend' can be imported
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from backend.services.analysis.dl_landslide import analyze_landslide_dl

test_geojson = {
  "type": "Polygon",
  "coordinates": [
    [
      [85.80, 27.76],
      [85.80, 27.74],
      [85.83, 27.74],
      [85.83, 27.76],
      [85.80, 27.76]
    ]
  ]
}

try:
    print("Testing Landslide DL Inference End-to-End...")
    result = analyze_landslide_dl(test_geojson)
    
    print("\n[SUCCESS] Response generated successfully!")
    print("Stats:", json.dumps(result['stats'], indent=2))
    print("Coordinates:", result['coordinates'])
    print("Base64 string length:", len(result['custom_image_b64']))
except Exception as e:
    print(f"\n[ERROR] test failed: {e}")

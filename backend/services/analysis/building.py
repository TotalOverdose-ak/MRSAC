import ee
import logging
from backend.services.analysis.gee_utils import init_gee

logger = logging.getLogger(__name__)

BUILDING_DATASET = "GOOGLE/Research/open-buildings/v3/polygons"

def analyze_building(ee_object):
    """
    Performs building detection using Google Open Buildings dataset.
    Returns the tile layer URL and calculated statistics.
    """
    init_gee()
    print("[BUILDING] ━━━ Starting Google Open Buildings Analysis ━━━")
    
    # Filter building footprints in the user's drawn Area of Interest
    print("[BUILDING] → Filtering building footprints in AOI...")
    buildings = ee.FeatureCollection(BUILDING_DATASET).filterBounds(ee_object)
    
    # Convert polygons to a raster image for fast Map Visualizations
    # Paint buildings as value 1
    building_img = ee.Image().byte().paint(buildings, 1)
    # Mask out areas with no buildings so they are transparent on the map
    building_img = building_img.updateMask(building_img.eq(1))
    
    # Get Earth Engine Map Tile URL
    print("[BUILDING] → Generating map tiles...")
    vis_params = {
        'palette': ['FF3333'], # Semi-translucent red
        'opacity': 0.8
    }
    map_id_dict = building_img.getMapId(vis_params)
    tile_url = map_id_dict['tile_fetcher'].url_format
    print("[BUILDING]   ✓ Tile URL ready")

    try:
        # Compute building statistics
        print("[BUILDING] → Computing building statistics...")
        
        # Get building count first (lighter computation)
        building_count = buildings.size().getInfo()
        print(f"[BUILDING]   → Found {building_count} buildings in AOI")
        
        # Use pixel-based area calculation (much more memory-efficient than geometry merge)
        aoi_area = ee_object.area().getInfo()
        
        if building_count > 0:
            # Paint buildings as 1, compute total area using pixel reducer
            building_raster = ee.Image().byte().paint(buildings, 1).unmask(0)
            pixel_area_img = ee.Image.pixelArea().multiply(building_raster)
            
            total_built_area = pixel_area_img.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=ee_object,
                scale=10,  # 10m resolution for accuracy
                maxPixels=1e9,
                bestEffort=True
            ).getInfo().get('area', 0)
        else:
            total_built_area = 0
            
        built_area_ha = total_built_area / 10000.0
        density_pct = (total_built_area / aoi_area) * 100.0 if aoi_area > 0 else 0
        
        print(f"[BUILDING]   ✓ {built_area_ha:.2f} ha built-up, {density_pct:.1f}% density")
        
    except Exception as e:
        print(f"[BUILDING]   ✗ Stats computation failed: {e}")
        logger.error(f"Failed to compute building stats: {e}")
        built_area_ha = 0
        density_pct = 0
        building_count = "N/A"
        
    # Attempt 3D Vector Export only if reasonable size
    try:
        if building_count != "N/A" and building_count > 0 and building_count <= 25000:
            print("[BUILDING] → Exporting 3D Vector Geometries...")
            building_geojson = buildings.limit(5000).getInfo()
            print(f"[BUILDING]   ✓ Exported {len(building_geojson.get('features', []))} features to GeoJSON.")
        else:
            if building_count != "N/A" and building_count > 25000:
                print(f"[BUILDING]   ⚠ Area too large ({building_count} buildings). Skipping 3D export, reverting to 2D tiles.")
            building_geojson = None
    except Exception as e:
        print(f"[BUILDING]   ✗ GeoJSON export failed (Payload too large?): {e}")
        building_geojson = None

    stats = [
        {'name': 'Total Built-Up Area (ha)', 'value': f"{built_area_ha:.2f}"},
        {'name': 'Estimated Building Count', 'value': str(building_count)},
        {'name': 'Building Density', 'value': f"{density_pct:.1f}%"},
        {'name': 'Provider Engine', 'value': 'Google Open Buildings V3'}
    ]

    print("[BUILDING] ━━━ Analysis complete! ━━━")
    return {
        'tile_url': tile_url,
        'geojson': building_geojson,
        'stats': stats,
        'coordinates': ee_object.bounds().coordinates().getInfo()
    }

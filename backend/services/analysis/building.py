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
    
    # ── Multi-class confidence raster for beautiful gradient visualization ──
    # Paint confidence as continuous value (0.0–1.0) for smooth color mapping
    print("[BUILDING] → Generating confidence-graded map tiles...")
    confidence_img = ee.Image().float().paint(buildings, 'confidence')
    confidence_img = confidence_img.updateMask(confidence_img.gt(0))
    
    vis_params = {
        'min': 0.5,
        'max': 1.0,
        'palette': [
            '1a1a2e',   # Very low confidence - deep navy
            '5b21b6',   # Low - deep purple
            '7c3aed',   # Medium-low - vibrant purple
            'a78bfa',   # Medium - soft lavender
            '06b6d4',   # Medium-high - cyan
            '22d3ee',   # High - bright cyan
            '67e8f9',   # Very high - light cyan
        ],
        'opacity': 0.85
    }
    map_id_dict = confidence_img.getMapId(vis_params)
    tile_url = map_id_dict['tile_fetcher'].url_format
    print("[BUILDING]   ✓ Gradient tile URL ready")

    # ── Statistics computation ──
    building_count = 0
    built_area_ha = 0
    density_pct = 0
    aoi_area_sqm = 0
    aoi_area_ha = 0
    confidence_breakdown = {}
    avg_building_area_sqm = 0

    try:
        print("[BUILDING] → Computing building statistics...")
        
        building_count = buildings.size().getInfo()
        print(f"[BUILDING]   → Found {building_count} buildings in AOI")
        
        aoi_area_sqm = ee_object.area().getInfo()
        aoi_area_ha = aoi_area_sqm / 10000.0
        
        if building_count > 0:
            # Pixel-based area calculation
            building_raster = ee.Image().byte().paint(buildings, 1).unmask(0)
            pixel_area_img = ee.Image.pixelArea().multiply(building_raster)
            
            total_built_area = pixel_area_img.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=ee_object,
                scale=10,
                maxPixels=1e9,
                bestEffort=True
            ).getInfo().get('area', 0)
            
            built_area_ha = total_built_area / 10000.0
            density_pct = (total_built_area / aoi_area_sqm) * 100.0 if aoi_area_sqm > 0 else 0
            avg_building_area_sqm = total_built_area / building_count if building_count > 0 else 0
        
            # ── Confidence distribution (sampled for performance) ──
            try:
                print("[BUILDING] → Computing confidence distribution...")
                sample_limit = min(building_count, 5000)
                sampled = buildings.limit(sample_limit)
                
                conf_histogram = sampled.aggregate_histogram('confidence').getInfo()
                
                # Bucket into confidence bands
                low = 0    # 0.0 - 0.6
                medium = 0  # 0.6 - 0.8
                high = 0    # 0.8 - 1.0
                for k, v in conf_histogram.items():
                    c = float(k)
                    if c < 0.6:
                        low += v
                    elif c < 0.8:
                        medium += v
                    else:
                        high += v
                
                total_sampled = low + medium + high
                if total_sampled > 0:
                    confidence_breakdown = {
                        'low': {'count': low, 'pct': round(low / total_sampled * 100, 1)},
                        'medium': {'count': medium, 'pct': round(medium / total_sampled * 100, 1)},
                        'high': {'count': high, 'pct': round(high / total_sampled * 100, 1)},
                    }
                print(f"[BUILDING]   ✓ Confidence: Low={low}, Med={medium}, High={high}")
            except Exception as e:
                print(f"[BUILDING]   ⚠ Confidence distribution skipped: {e}")
                confidence_breakdown = {}
                
        print(f"[BUILDING]   ✓ {built_area_ha:.2f} ha built-up, {density_pct:.1f}% density")
        
    except Exception as e:
        print(f"[BUILDING]   ✗ Stats computation failed: {e}")
        logger.error(f"Failed to compute building stats: {e}")
        building_count = "N/A"
        
    # ── 3D Vector Export (GeoJSON) ──
    building_geojson = None
    try:
        if building_count != "N/A" and building_count > 0 and building_count <= 25000:
            print("[BUILDING] → Exporting 3D Vector Geometries...")
            building_geojson = buildings.limit(5000).getInfo()
            print(f"[BUILDING]   ✓ Exported {len(building_geojson.get('features', []))} features to GeoJSON.")
        elif building_count != "N/A" and building_count > 25000:
            print(f"[BUILDING]   ⚠ Area too large ({building_count} buildings). Skipping 3D export, reverting to 2D tiles.")
    except Exception as e:
        print(f"[BUILDING]   ✗ GeoJSON export failed (Payload too large?): {e}")

    # ── Density classification ──
    if density_pct > 60:
        density_class = "Ultra-Dense Urban Core"
    elif density_pct > 40:
        density_class = "High-Density Urban"
    elif density_pct > 20:
        density_class = "Medium-Density Suburban"
    elif density_pct > 5:
        density_class = "Low-Density Peri-Urban"
    else:
        density_class = "Rural / Sparse Settlement"

    # ── Format stats for frontend ──
    stats = [
        {'name': 'Total Built-Up Area', 'value': f"{built_area_ha:.2f} ha"},
        {'name': 'AOI Total Area', 'value': f"{aoi_area_ha:.2f} ha"},
        {'name': 'Estimated Building Count', 'value': f"{building_count:,}" if isinstance(building_count, int) else str(building_count)},
        {'name': 'Building Density', 'value': f"{density_pct:.1f}%"},
        {'name': 'Density Classification', 'value': density_class},
        {'name': 'Avg Building Footprint', 'value': f"{avg_building_area_sqm:.1f} m²"},
        {'name': 'Provider Engine', 'value': 'Google Open Buildings V3'},
        {'name': 'Resolution', 'value': '~0.5m (Maxar) → 10m raster'},
    ]

    print("[BUILDING] ━━━ Analysis complete! ━━━")
    return {
        'tile_url': tile_url,
        'geojson': building_geojson,
        'stats': stats,
        'coordinates': ee_object.bounds().coordinates().getInfo(),
        'confidence_breakdown': confidence_breakdown,
        'density_class': density_class,
        'built_area_ha': built_area_ha,
        'aoi_area_ha': aoi_area_ha,
        'building_count': building_count if isinstance(building_count, int) else 0,
        'density_pct': density_pct,
        'avg_building_area_sqm': avg_building_area_sqm,
    }

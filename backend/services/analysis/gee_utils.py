# ================================================================
#  SHARED GEE UTILITIES — Common functions for all analysis modules
# ================================================================

import ee
import logging
from backend.config import GEE_PROJECT

logger = logging.getLogger(__name__)

_gee_initialized = False


def init_gee():
    """Initialize Google Earth Engine with proper error handling.
    Only initializes once per session."""
    global _gee_initialized
    if _gee_initialized:
        return

    try:
        ee.Initialize(project=GEE_PROJECT)
        _gee_initialized = True
        logger.info("GEE initialized successfully.")
    except ee.EEException:
        try:
            ee.Authenticate()
            ee.Initialize(project=GEE_PROJECT)
            _gee_initialized = True
            logger.info("GEE authenticated and initialized.")
        except Exception as e:
            raise RuntimeError(
                f"Failed to initialize Google Earth Engine.\n"
                f"Make sure you have authenticated with `earthengine authenticate`.\n"
                f"Error: {e}"
            )


def mask_s2_clouds(image):
    """Mask clouds in Sentinel-2 SR imagery using QA60 + SCL bands."""
    qa = image.select('QA60')
    cloud_mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))

    # Also use Scene Classification Layer if available
    try:
        scl = image.select('SCL')
        # Exclude: 3=cloud shadow, 8=cloud medium, 9=cloud high, 10=cirrus
        scl_mask = (scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)))
        cloud_mask = cloud_mask.And(scl_mask)
    except Exception:
        pass

    return (image.updateMask(cloud_mask)
            .divide(10000)
            .copyProperties(image, ['system:time_start']))


def mask_landsat_clouds(image):
    """Mask clouds in Landsat 8/9 imagery using QA_PIXEL."""
    qa = image.select('QA_PIXEL')
    cloud = qa.bitwiseAnd(1 << 3).eq(0)
    shadow = qa.bitwiseAnd(1 << 4).eq(0)
    return image.updateMask(cloud.And(shadow))


def safe_get_info(ee_object, default=0):
    """Safely call .getInfo() with fallback on failure."""
    try:
        result = ee_object.getInfo()
        return result if result is not None else default
    except Exception as e:
        logger.warning(f"getInfo() failed: {e}")
        return default


def get_map_tiles(ee_image):
    """Extract tile URL from an Earth Engine image visualization."""
    try:
        map_id = ee_image.getMapId()
        return map_id['tile_fetcher'].url_format
    except Exception as e:
        logger.error(f"Failed to get map tiles: {e}")
        return None


def get_s2_composite(region, year, months=(1, 12)):
    """Get annual Sentinel-2 SR composite with cloud masking."""
    start = ee.Date.fromYMD(year, months[0], 1)
    # Use last day of the end month
    end_month = months[1]
    end_day = 31 if end_month in (1, 3, 5, 7, 8, 10, 12) else (
        30 if end_month in (4, 6, 9, 11) else 28
    )
    end = ee.Date.fromYMD(year, end_month, end_day)

    col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
           .filterDate(start, end)
           .filterBounds(region)
           .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
           .map(mask_s2_clouds))

    return col.median()


def get_landsat_composite(region, year, months=(1, 12)):
    """Get annual Landsat 8/9 composite with cloud masking."""
    start = ee.Date.fromYMD(year, months[0], 1)
    end_month = months[1]
    end_day = 31 if end_month in (1, 3, 5, 7, 8, 10, 12) else (
        30 if end_month in (4, 6, 9, 11) else 28
    )
    end = ee.Date.fromYMD(year, end_month, end_day)

    col8 = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
            .filterDate(start, end).filterBounds(region)
            .map(mask_landsat_clouds))
    col9 = (ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
            .filterDate(start, end).filterBounds(region)
            .map(mask_landsat_clouds))

    return col8.merge(col9).median()


def compute_ndvi_s2(composite):
    """Compute NDVI from Sentinel-2 bands."""
    return composite.normalizedDifference(['B8', 'B4']).rename('NDVI')


def compute_ndvi_landsat(composite):
    """Compute NDVI from Landsat bands."""
    return composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI')


def calc_area_km2(mask, region, scale=10):
    """Calculate area in km² for a binary mask."""
    pixel_area = ee.Image.pixelArea().divide(1e6)
    return mask.multiply(pixel_area).reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=region,
        scale=scale,
        maxPixels=1e10
    )


def get_s2_ndvi_timeseries(region, start_year, end_year, months=(1, 12)):
    """Compute mean NDVI per year using Sentinel-2 composites.

    Returns list of {'year': int, 'mean_ndvi': float}.
    Sentinel-2 data is only available from 2017 onwards.
    """
    init_gee()
    effective_start = max(start_year, 2017)
    results = []
    for yr in range(effective_start, end_year + 1):
        try:
            composite = get_s2_composite(region, yr, months)
            ndvi = compute_ndvi_s2(composite)
            mean_val = safe_get_info(
                ndvi.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=region,
                    scale=10,
                    maxPixels=1e9,
                ).get('NDVI'), 0
            )
            results.append({'year': yr, 'mean_ndvi': round(float(mean_val or 0), 4)})
            logger.info(f"NDVI timeseries {yr}: {mean_val}")
        except Exception as e:
            logger.warning(f"NDVI timeseries failed for {yr}: {e}")
            results.append({'year': yr, 'mean_ndvi': 0})
    return results


def get_ndvi_histogram_data(ndvi_image, region, num_buckets=30):
    """Extract histogram bin data from an NDVI image.

    Returns list of {'bin': float, 'count': int}.
    """
    try:
        hist = safe_get_info(
            ndvi_image.reduceRegion(
                reducer=ee.Reducer.fixedHistogram(-0.2, 1.0, num_buckets),
                geometry=region,
                scale=10,
                maxPixels=1e9,
            ).get('NDVI'), []
        )
        if hist:
            return [{'bin': round(float(row[0]), 3), 'count': int(row[1])} for row in hist]
        return []
    except Exception as e:
        logger.warning(f"Histogram extraction failed: {e}")
        return []

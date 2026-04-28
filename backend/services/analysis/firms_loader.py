# ================================================================
#  NASA FIRMS Fire Data Loader + Spatial Index
#  Loads CSV data into memory with KD-Tree for fast spatial queries
# ================================================================

import os
import logging
import pandas as pd
import numpy as np
from datetime import datetime
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)

# ── Paths to FIRMS CSV data ───────────────────────────────────
FIRMS_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), '..', '..', '..', 'Forest Fire CSV NASA FIRMS'
))

# Essential columns to load (saves ~60% RAM)
VIIRS_COLS = ['latitude', 'longitude', 'brightness', 'frp', 'confidence',
              'acq_date', 'acq_time', 'satellite', 'daynight']
MODIS_COLS = ['latitude', 'longitude', 'brightness', 'frp', 'confidence',
              'acq_date', 'acq_time', 'satellite', 'daynight']

# ── Global cache ──────────────────────────────────────────────
_fire_df: pd.DataFrame | None = None
_fire_tree: cKDTree | None = None
_is_loaded = False


def _find_csv_files():
    """Discover all FIRMS CSV files in the data directory."""
    csv_files = []
    if not os.path.isdir(FIRMS_DIR):
        logger.warning(f"FIRMS directory not found: {FIRMS_DIR}")
        return csv_files

    for subdir in os.listdir(FIRMS_DIR):
        subpath = os.path.join(FIRMS_DIR, subdir)
        if not os.path.isdir(subpath):
            continue
        for fname in os.listdir(subpath):
            if fname.endswith('.csv'):
                csv_files.append(os.path.join(subpath, fname))
    return csv_files


def _load_single_csv(filepath: str) -> pd.DataFrame:
    """Load a single FIRMS CSV with only essential columns."""
    fname = os.path.basename(filepath)
    logger.info(f"[FIRMS] Loading {fname}...")

    try:
        df = pd.read_csv(
            filepath,
            usecols=lambda c: c in VIIRS_COLS,
            dtype={
                'latitude': 'float32',
                'longitude': 'float32',
                'brightness': 'float32',
                'frp': 'float32',
                'daynight': 'category',
                'satellite': 'category',
                'confidence': 'object',  # VIIRS uses 'l'/'n'/'h', MODIS uses 0-100
            },
            parse_dates=['acq_date'],
            low_memory=True,
        )
        logger.info(f"[FIRMS]   Loaded {fname}: {len(df):,} rows")
        return df
    except Exception as e:
        logger.error(f"[FIRMS]   Failed to load {fname}: {e}")
        return pd.DataFrame()


def load_firms_data(force_reload=False):
    """
    Load all FIRMS CSVs into a single DataFrame + build spatial index.
    Called once at startup, cached in memory.
    """
    global _fire_df, _fire_tree, _is_loaded

    if _is_loaded and not force_reload:
        return

    logger.info(f"\n[FIRMS] ━━━ Loading NASA FIRMS Fire Data ━━━")
    logger.info(f"[FIRMS] Directory: {FIRMS_DIR}")

    csv_files = _find_csv_files()
    if not csv_files:
        logger.warning("[FIRMS] No CSV files found. FIRMS queries will return empty.")
        _fire_df = pd.DataFrame()
        _is_loaded = True
        return

    logger.info(f"[FIRMS] Found {len(csv_files)} CSV files")

    # Load all CSVs
    frames = []
    for fp in csv_files:
        df = _load_single_csv(fp)
        if not df.empty:
            frames.append(df)

    if not frames:
        _fire_df = pd.DataFrame()
        _is_loaded = True
        return

    _fire_df = pd.concat(frames, ignore_index=True)

    # Normalize confidence — VIIRS uses 'l'/'n'/'h', MODIS uses 0-100
    if 'confidence' in _fire_df.columns:
        conf_map = {'l': 30, 'n': 60, 'h': 90, 'low': 30, 'nominal': 60, 'high': 90}

        def _normalize_confidence(val):
            if pd.isna(val):
                return 50.0
            s = str(val).strip().lower()
            if s in conf_map:
                return float(conf_map[s])
            try:
                return float(s)
            except (ValueError, TypeError):
                return 50.0

        _fire_df['confidence'] = _fire_df['confidence'].apply(_normalize_confidence).astype('float32')

    # Normalize satellite names for readable reports
    if 'satellite' in _fire_df.columns:
        sat_map = {
            'N': 'Suomi-NPP',
            'N20': 'NOAA-20',
            'N21': 'NOAA-21',
        }
        _fire_df['satellite'] = _fire_df['satellite'].astype(str).map(
            lambda s: sat_map.get(s.strip(), s.strip())
        ).astype('category')

    # Add derived columns
    _fire_df['month'] = _fire_df['acq_date'].dt.month.astype('int8')
    _fire_df['year'] = _fire_df['acq_date'].dt.year.astype('int16')

    # Drop rows with missing coordinates
    _fire_df.dropna(subset=['latitude', 'longitude'], inplace=True)

    # Build KD-Tree spatial index
    logger.info(f"[FIRMS] Building KD-Tree spatial index on {len(_fire_df):,} fire points...")
    coords = _fire_df[['latitude', 'longitude']].values
    _fire_tree = cKDTree(coords)

    _is_loaded = True
    mem_mb = _fire_df.memory_usage(deep=True).sum() / (1024 * 1024)
    logger.info(f"[FIRMS] ━━━ Loaded {len(_fire_df):,} fire detections ({mem_mb:.0f} MB RAM) ━━━\n")


def _ensure_loaded():
    """Ensure FIRMS data is loaded before querying."""
    if not _is_loaded:
        load_firms_data()


def query_fires(bbox: dict, start_date: str = None, end_date: str = None,
                satellite: str = None, confidence_min: float = 0,
                max_points: int = 50000) -> list[dict]:
    """
    Query fire hotspots within a bounding box + date range.

    Args:
        bbox: dict with keys 'min_lat', 'max_lat', 'min_lon', 'max_lon'
        start_date: 'YYYY-MM-DD' (optional)
        end_date: 'YYYY-MM-DD' (optional)
        satellite: filter by satellite name (optional)
        confidence_min: minimum confidence threshold (0-100)
        max_points: cap results to prevent frontend overload

    Returns:
        list of fire point dicts with lat, lon, date, brightness, frp, etc.
    """
    _ensure_loaded()

    if _fire_df is None or _fire_df.empty:
        return []

    # Spatial filter using bounding box
    mask = (
        (_fire_df['latitude'] >= bbox['min_lat']) &
        (_fire_df['latitude'] <= bbox['max_lat']) &
        (_fire_df['longitude'] >= bbox['min_lon']) &
        (_fire_df['longitude'] <= bbox['max_lon'])
    )

    # Date filter
    if start_date:
        mask &= _fire_df['acq_date'] >= pd.Timestamp(start_date)
    if end_date:
        mask &= _fire_df['acq_date'] <= pd.Timestamp(end_date)

    # Satellite filter
    if satellite and satellite != 'all':
        mask &= _fire_df['satellite'].astype(str).str.contains(satellite, case=False, na=False)

    # Confidence filter
    if confidence_min > 0:
        mask &= _fire_df['confidence'] >= confidence_min

    filtered = _fire_df[mask]

    # Cap results
    if len(filtered) > max_points:
        filtered = filtered.sample(n=max_points, random_state=42)

    # Convert to list of dicts
    result = []
    for _, row in filtered.iterrows():
        result.append({
            'lat': float(row['latitude']),
            'lon': float(row['longitude']),
            'brightness': float(row.get('brightness', 0)),
            'frp': float(row.get('frp', 0)) if pd.notna(row.get('frp')) else 0,
            'confidence': float(row.get('confidence', 0)),
            'date': str(row['acq_date'].date()) if pd.notna(row.get('acq_date')) else '',
            'satellite': str(row.get('satellite', '')),
            'daynight': str(row.get('daynight', '')),
        })

    return result


def get_fire_stats(bbox: dict, start_date: str = None, end_date: str = None) -> dict:
    """
    Get aggregated fire statistics for an area + date range.
    Used by the Fire Report.
    """
    _ensure_loaded()

    if _fire_df is None or _fire_df.empty:
        return {'total_fires': 0}

    mask = (
        (_fire_df['latitude'] >= bbox['min_lat']) &
        (_fire_df['latitude'] <= bbox['max_lat']) &
        (_fire_df['longitude'] >= bbox['min_lon']) &
        (_fire_df['longitude'] <= bbox['max_lon'])
    )

    if start_date:
        mask &= _fire_df['acq_date'] >= pd.Timestamp(start_date)
    if end_date:
        mask &= _fire_df['acq_date'] <= pd.Timestamp(end_date)

    filtered = _fire_df[mask]

    if filtered.empty:
        return {'total_fires': 0, 'message': 'No fire detections found in this area/time range.'}

    # Monthly breakdown
    monthly = filtered.groupby('month').size().reindex(range(1, 13), fill_value=0).to_dict()
    month_names = {1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
                   7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'}
    monthly_named = {month_names[k]: int(v) for k, v in monthly.items()}

    # Yearly trend
    yearly = filtered.groupby('year').size().to_dict()
    yearly_trend = [{'year': int(y), 'count': int(c)} for y, c in sorted(yearly.items())]

    # Peak month
    peak_month_num = max(monthly, key=monthly.get) if monthly else 0
    peak_month = month_names.get(peak_month_num, 'N/A')

    # FRP stats
    frp_valid = filtered['frp'].dropna()
    avg_frp = round(float(frp_valid.mean()), 2) if not frp_valid.empty else 0
    max_frp = round(float(frp_valid.max()), 2) if not frp_valid.empty else 0

    # Day/Night split (handle missing daynight values)
    daynight_str = filtered['daynight'].astype(str).str.strip().str.upper()
    day_count = int((daynight_str == 'D').sum())
    night_count = int((daynight_str == 'N').sum())

    # Confidence distribution
    high_conf = int((filtered['confidence'] >= 70).sum())
    med_conf = int(((filtered['confidence'] >= 40) & (filtered['confidence'] < 70)).sum())
    low_conf = int((filtered['confidence'] < 40).sum())

    # Satellite breakdown
    sat_counts = filtered['satellite'].value_counts().head(5).to_dict()
    sat_breakdown = {str(k): int(v) for k, v in sat_counts.items()}

    return {
        'total_fires': int(len(filtered)),
        'monthly_breakdown': monthly_named,
        'yearly_trend': yearly_trend,
        'peak_month': peak_month,
        'avg_frp_mw': avg_frp,
        'max_frp_mw': max_frp,
        'avg_brightness_k': round(float(filtered['brightness'].mean()), 1) if not filtered['brightness'].empty else 0,
        'day_fires': day_count,
        'night_fires': night_count,
        'confidence_high': high_conf,
        'confidence_medium': med_conf,
        'confidence_low': low_conf,
        'satellite_breakdown': sat_breakdown,
        'date_range': {
            'earliest': str(filtered['acq_date'].min().date()),
            'latest': str(filtered['acq_date'].max().date()),
        },
    }


def get_geojson_fires(bbox: dict, start_date: str = None, end_date: str = None,
                      confidence_min: float = 0, max_points: int = 15000) -> dict:
    """
    Return fire hotspots as GeoJSON FeatureCollection for map rendering.
    """
    fires = query_fires(bbox, start_date, end_date, confidence_min=confidence_min, max_points=max_points)

    features = []
    for f in fires:
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [f['lon'], f['lat']]},
            'properties': {
                'brightness': f['brightness'],
                'frp': f['frp'],
                'confidence': f['confidence'],
                'date': f['date'],
                'satellite': f['satellite'],
                'daynight': f['daynight'],
            }
        })

    return {
        'type': 'FeatureCollection',
        'features': features,
    }

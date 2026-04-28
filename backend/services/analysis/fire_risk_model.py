# ================================================================
#  FIRE RISK PREDICTION MODEL
#  Random Forest trained on NASA FIRMS data (17M+ detections)
#  Predicts spatial fire risk for any AOI in India
#  Inspired by Ken Steif's PredictingFireRisk (R/Poisson GLM)
#  Adapted to Python/scikit-learn with 12 engineered features
# ================================================================

import logging
import numpy as np
import pandas as pd
import joblib
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_error
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Global model cache ────────────────────────────────────────
_model: RandomForestRegressor | None = None
_scaler: StandardScaler | None = None
_model_metrics: dict | None = None
_is_trained = False

MODEL_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), '..', '..', '..', 'backend', 'ml_models'
))
MODEL_PATH = os.path.join(MODEL_DIR, 'fire_risk_rf.joblib')
SCALER_PATH = os.path.join(MODEL_DIR, 'fire_risk_scaler.joblib')


# ================================================================
#  FEATURE ENGINEERING
# ================================================================

def _compute_cell_features(cell_fires: pd.DataFrame, total_years: int) -> dict:
    """
    Compute 12 ML features for a single grid cell from its fire detections.
    
    Args:
        cell_fires: DataFrame of fire detections within this cell
        total_years: Total span of years in the dataset
    
    Returns:
        dict of 12 feature values
    """
    if cell_fires.empty or len(cell_fires) == 0:
        return {
            'fire_count': 0,
            'fire_density': 0.0,
            'mean_frp': 0.0,
            'max_frp': 0.0,
            'mean_brightness': 0.0,
            'fire_years': 0,
            'recurrence_rate': 0.0,
            'seasonal_concentration': 0.0,
            'peak_month_fires': 0,
            'mean_confidence': 0.0,
            'recent_fire_trend': 0.0,
            'neighbor_fire_density': 0.0,  # filled later
        }

    n = len(cell_fires)
    
    # 1. Fire count
    fire_count = n

    # 2. Fire density (fires per year, normalized)
    fire_density = n / max(total_years, 1)

    # 3-4. FRP stats
    frp_vals = cell_fires['frp'].dropna()
    mean_frp = float(frp_vals.mean()) if len(frp_vals) > 0 else 0.0
    max_frp = float(frp_vals.max()) if len(frp_vals) > 0 else 0.0

    # 5. Mean brightness temperature
    bright_vals = cell_fires['brightness'].dropna()
    mean_brightness = float(bright_vals.mean()) if len(bright_vals) > 0 else 0.0

    # 6-7. Recurrence
    if 'year' in cell_fires.columns:
        unique_years = cell_fires['year'].nunique()
    else:
        unique_years = cell_fires['acq_date'].dt.year.nunique()
    fire_years = unique_years
    recurrence_rate = fire_years / max(total_years, 1)

    # 8. Seasonal concentration (Gini-like: 0 = uniform, 1 = one month)
    if 'month' in cell_fires.columns:
        monthly = cell_fires.groupby('month').size().reindex(range(1, 13), fill_value=0).values
    else:
        monthly = cell_fires.groupby(cell_fires['acq_date'].dt.month).size().reindex(
            range(1, 13), fill_value=0).values
    monthly_frac = monthly / max(monthly.sum(), 1)
    # Herfindahl index (sum of squared proportions)
    seasonal_concentration = float(np.sum(monthly_frac ** 2))

    # 9. Peak month fires
    peak_month_fires = int(monthly.max())

    # 10. Mean confidence
    conf_vals = cell_fires['confidence'].dropna()
    mean_confidence = float(conf_vals.mean()) if len(conf_vals) > 0 else 50.0

    # 11. Recent fire trend (slope of yearly count, last 5 years)
    if 'year' in cell_fires.columns:
        max_year = int(cell_fires['year'].max())
    else:
        max_year = int(cell_fires['acq_date'].dt.year.max())
    recent_years = range(max_year - 4, max_year + 1)
    
    if 'year' in cell_fires.columns:
        yearly_recent = cell_fires[cell_fires['year'].isin(recent_years)].groupby('year').size()
    else:
        yearly_recent = cell_fires[cell_fires['acq_date'].dt.year.isin(recent_years)].groupby(
            cell_fires['acq_date'].dt.year).size()
    
    if len(yearly_recent) >= 2:
        x = np.arange(len(yearly_recent))
        y = yearly_recent.values.astype(float)
        slope = np.polyfit(x, y, 1)[0]
        recent_fire_trend = float(slope)
    else:
        recent_fire_trend = 0.0

    return {
        'fire_count': fire_count,
        'fire_density': round(fire_density, 4),
        'mean_frp': round(mean_frp, 2),
        'max_frp': round(max_frp, 2),
        'mean_brightness': round(mean_brightness, 1),
        'fire_years': fire_years,
        'recurrence_rate': round(recurrence_rate, 4),
        'seasonal_concentration': round(seasonal_concentration, 4),
        'peak_month_fires': peak_month_fires,
        'mean_confidence': round(mean_confidence, 1),
        'recent_fire_trend': round(recent_fire_trend, 3),
        'neighbor_fire_density': 0.0,  # filled in grid-level computation
    }


def _build_grid(min_lat, max_lat, min_lon, max_lon, cell_size):
    """Create a fishnet grid of cells over the bounding box."""
    lats = np.arange(min_lat, max_lat, cell_size)
    lons = np.arange(min_lon, max_lon, cell_size)
    
    cells = []
    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            cells.append({
                'row': i, 'col': j,
                'lat_min': lat, 'lat_max': lat + cell_size,
                'lon_min': lon, 'lon_max': lon + cell_size,
                'center_lat': lat + cell_size / 2,
                'center_lon': lon + cell_size / 2,
            })
    return cells


def _compute_grid_features(cells, fire_df, target_year=None, cell_size=0.05,
                            min_lat=None, min_lon=None):
    """
    Compute features for all grid cells using VECTORIZED cell assignment.
    Much faster than per-cell DataFrame filtering.
    
    Args:
        cells: list of cell dicts from _build_grid
        fire_df: FIRMS DataFrame
        target_year: if set, compute target (fire count in this year)
                     and use only data BEFORE this year for features
        cell_size: grid cell size for computing cell indices
        min_lat/min_lon: grid origin for cell index computation
    """
    if target_year:
        train_df = fire_df[fire_df['year'] < target_year].copy()
        target_df = fire_df[fire_df['year'] == target_year].copy()
    else:
        train_df = fire_df.copy()
        target_df = None

    total_years = int(train_df['year'].nunique()) if not train_df.empty else 1
    
    feature_names = [
        'fire_count', 'fire_density', 'mean_frp', 'max_frp', 'mean_brightness',
        'fire_years', 'recurrence_rate', 'seasonal_concentration',
        'peak_month_fires', 'mean_confidence', 'recent_fire_trend',
        'neighbor_fire_density'
    ]

    # Determine grid origin
    if min_lat is None:
        min_lat = cells[0]['lat_min']
    if min_lon is None:
        min_lon = cells[0]['lon_min']

    # Build cell lookup: (row, col) -> cell index
    cell_lookup = {}
    for idx, cell in enumerate(cells):
        cell_lookup[(cell['row'], cell['col'])] = idx

    n_rows = max(c['row'] for c in cells) + 1
    n_cols = max(c['col'] for c in cells) + 1

    # ── Vectorized cell assignment ────────────────────────────
    # Assign each fire point to a grid cell using integer division
    train_df['_row'] = ((train_df['latitude'].values - min_lat) / cell_size).astype(int)
    train_df['_col'] = ((train_df['longitude'].values - min_lon) / cell_size).astype(int)
    # Clip to valid range
    train_df['_row'] = train_df['_row'].clip(0, n_rows - 1)
    train_df['_col'] = train_df['_col'].clip(0, n_cols - 1)
    train_df['_cell_key'] = train_df['_row'] * n_cols + train_df['_col']

    # ── Vectorized aggregation per cell ───────────────────────
    grouped = train_df.groupby('_cell_key')
    
    # Pre-compute aggregates
    agg = grouped.agg(
        fire_count=('latitude', 'size'),
        mean_frp=('frp', 'mean'),
        max_frp=('frp', 'max'),
        mean_brightness=('brightness', 'mean'),
        fire_years=('year', 'nunique'),
        mean_confidence=('confidence', 'mean'),
    ).fillna(0)

    # Peak month fires + seasonal concentration
    monthly_counts = train_df.groupby(['_cell_key', 'month']).size().unstack(fill_value=0)
    peak_month = monthly_counts.max(axis=1)
    monthly_frac = monthly_counts.div(monthly_counts.sum(axis=1), axis=0).fillna(0)
    seasonal_conc = (monthly_frac ** 2).sum(axis=1)

    # Recent trend (last 5 years)
    max_year = int(train_df['year'].max()) if not train_df.empty else 2025
    recent_mask = train_df['year'] >= max_year - 4
    if recent_mask.any():
        recent_yearly = train_df[recent_mask].groupby(['_cell_key', 'year']).size().unstack(fill_value=0)
        # Simple trend: last year count minus first year count
        if recent_yearly.shape[1] >= 2:
            trend = (recent_yearly.iloc[:, -1] - recent_yearly.iloc[:, 0]) / max(recent_yearly.shape[1] - 1, 1)
        else:
            trend = pd.Series(0, index=recent_yearly.index)
    else:
        trend = pd.Series(dtype=float)

    # Target variable
    targets = np.zeros(len(cells))
    if target_df is not None and not target_df.empty:
        target_df['_row'] = ((target_df['latitude'].values - min_lat) / cell_size).astype(int).clip(0, n_rows - 1)
        target_df['_col'] = ((target_df['longitude'].values - min_lon) / cell_size).astype(int).clip(0, n_cols - 1)
        target_df['_cell_key'] = target_df['_row'] * n_cols + target_df['_col']
        target_counts = target_df.groupby('_cell_key').size()
        for key, count in target_counts.items():
            row_idx = int(key) // n_cols
            col_idx = int(key) % n_cols
            cidx = cell_lookup.get((row_idx, col_idx))
            if cidx is not None:
                targets[cidx] = count

    # ── Assemble feature matrix ───────────────────────────────
    X = np.zeros((len(cells), len(feature_names)))
    fire_counts_grid = {}

    for key, row in agg.iterrows():
        row_idx = int(key) // n_cols
        col_idx = int(key) % n_cols
        cidx = cell_lookup.get((row_idx, col_idx))
        if cidx is None:
            continue
        
        fc = int(row['fire_count'])
        fire_counts_grid[(row_idx, col_idx)] = fc
        
        X[cidx, 0] = fc                                    # fire_count
        X[cidx, 1] = fc / max(total_years, 1)              # fire_density
        X[cidx, 2] = row['mean_frp']                       # mean_frp
        X[cidx, 3] = row['max_frp']                        # max_frp
        X[cidx, 4] = row['mean_brightness']                # mean_brightness
        X[cidx, 5] = row['fire_years']                     # fire_years
        X[cidx, 6] = row['fire_years'] / max(total_years, 1)  # recurrence_rate
        X[cidx, 7] = seasonal_conc.get(key, 0)             # seasonal_concentration
        X[cidx, 8] = peak_month.get(key, 0)                # peak_month_fires
        X[cidx, 9] = row['mean_confidence']                # mean_confidence
        X[cidx, 10] = trend.get(key, 0)                    # recent_fire_trend
        # neighbor_fire_density filled below

    # Fill neighbor_fire_density (spatial autocorrelation)
    for idx, cell in enumerate(cells):
        r, c = cell['row'], cell['col']
        nb_sum = 0
        nb_count = 0
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0:
                    continue
                nb_sum += fire_counts_grid.get((r + dr, c + dc), 0)
                nb_count += 1
        X[idx, 11] = nb_sum / max(nb_count, 1)

    y = targets if target_year else None
    return X, y, feature_names


# ================================================================
#  MODEL TRAINING
# ================================================================

def train_fire_risk_model(fire_df: pd.DataFrame, validation_year: int = 2025):
    """
    Train the Random Forest fire risk model on FIRMS data.
    """
    global _model, _scaler, _model_metrics, _is_trained

    logger.info(f"\n[FIRE-ML] --- Training Fire Risk Prediction Model ---")
    logger.info(f"[FIRE-ML] Total fire detections: {len(fire_df):,}")
    logger.info(f"[FIRE-ML] Validation year: {validation_year}")

    # Build coarse grid over India (0.1° ~ 11km cells)
    cell_size = 0.1
    min_lat, max_lat = 6.0, 38.0
    min_lon, max_lon = 68.0, 98.0
    cells = _build_grid(min_lat, max_lat, min_lon, max_lon, cell_size)
    logger.info(f"[FIRE-ML] Grid: {len(cells):,} cells ({cell_size}d ~ {cell_size * 111:.1f}km)")

    # Compute features with temporal split (VECTORIZED)
    logger.info(f"[FIRE-ML] Computing features (vectorized)...")
    X, y, feature_names = _compute_grid_features(
        cells, fire_df, target_year=validation_year,
        cell_size=cell_size, min_lat=min_lat, min_lon=min_lon
    )

    # Remove cells with zero features AND zero target (empty ocean/border cells)
    has_data = (X.sum(axis=1) > 0) | (y > 0)
    X_filtered = X[has_data]
    y_filtered = y[has_data]
    logger.info(f"[FIRE-ML] Active cells (with fire data): {len(X_filtered):,} / {len(cells):,}")

    # Scale features
    _scaler = StandardScaler()
    X_scaled = _scaler.fit_transform(X_filtered)

    # Train Random Forest
    logger.info(f"[FIRE-ML] Training Random Forest (200 trees, max_depth=12)...")
    _model = RandomForestRegressor(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=5,
        random_state=42,
        n_jobs=-1,
    )
    _model.fit(X_scaled, y_filtered)

    # Evaluate
    y_pred = _model.predict(X_scaled)
    r2 = r2_score(y_filtered, y_pred)
    mae = mean_absolute_error(y_filtered, y_pred)

    # Feature importances
    importances = dict(zip(feature_names, _model.feature_importances_.tolist()))
    importances = dict(sorted(importances.items(), key=lambda x: -x[1]))

    _model_metrics = {
        'algorithm': 'Random Forest Regressor',
        'n_estimators': 200,
        'max_depth': 12,
        'training_cells': int(len(X_filtered)),
        'total_grid_cells': len(cells),
        'grid_cell_size_deg': cell_size,
        'grid_cell_size_km': round(cell_size * 111, 1),
        'validation_year': validation_year,
        'r2_score': round(r2, 4),
        'mae': round(mae, 4),
        'feature_importances': {k: round(v, 4) for k, v in importances.items()},
        'training_fires': int(len(fire_df[fire_df['year'] < validation_year])),
        'validation_fires': int(len(fire_df[fire_df['year'] == validation_year])),
        'trained_at': datetime.now().isoformat(),
    }

    _is_trained = True

    logger.info(f"[FIRE-ML] R² Score: {r2:.4f}")
    logger.info(f"[FIRE-ML] MAE: {mae:.4f}")
    logger.info(f"[FIRE-ML] Top features:")
    for feat, imp in list(importances.items())[:5]:
        logger.info(f"[FIRE-ML]   {feat}: {imp:.4f}")
    logger.info(f"[FIRE-ML] ━━━ Model trained successfully! ━━━\n")

    # Save model to disk
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(_model, MODEL_PATH)
    joblib.dump(_scaler, SCALER_PATH)
    logger.info(f"[FIRE-ML] Model saved to {MODEL_PATH}")

    return _model_metrics


def _ensure_trained():
    """Load model from disk if not in memory."""
    global _model, _scaler, _model_metrics, _is_trained
    
    if _is_trained:
        return True
    
    # Try loading from disk
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        try:
            _model = joblib.load(MODEL_PATH)
            _scaler = joblib.load(SCALER_PATH)
            _is_trained = True
            logger.info("[FIRE-ML] Loaded pre-trained model from disk")
            return True
        except Exception as e:
            logger.warning(f"[FIRE-ML] Failed to load model: {e}")
    
    return False


# ================================================================
#  PREDICTION
# ================================================================

def predict_fire_risk(bbox: dict, fire_df: pd.DataFrame, cell_size: float = 0.01) -> dict:
    """
    Generate fire risk predictions for a user-drawn AOI.
    
    Args:
        bbox: dict with min_lat, max_lat, min_lon, max_lon
        fire_df: Full FIRMS DataFrame
        cell_size: Grid resolution in degrees (0.01° ≈ 1.1km)
    
    Returns:
        dict with GeoJSON FeatureCollection of risk cells + model metrics
    """
    if not _ensure_trained():
        raise RuntimeError("Fire risk model not trained. Please train first.")

    logger.info(f"[FIRE-ML] Predicting risk for bbox: {bbox}")

    # Cap grid size to prevent excessive computation
    lat_range = bbox['max_lat'] - bbox['min_lat']
    lon_range = bbox['max_lon'] - bbox['min_lon']
    
    # Auto-adjust cell size if AOI is very large
    max_cells = 2500
    estimated_cells = (lat_range / cell_size) * (lon_range / cell_size)
    if estimated_cells > max_cells:
        cell_size = max(lat_range, lon_range) / (max_cells ** 0.5)
        cell_size = round(cell_size, 4)
        logger.info(f"[FIRE-ML] Auto-adjusted cell size to {cell_size}° for large AOI")

    # Build fine grid over AOI
    cells = _build_grid(
        bbox['min_lat'], bbox['max_lat'],
        bbox['min_lon'], bbox['max_lon'],
        cell_size
    )
    logger.info(f"[FIRE-ML] AOI grid: {len(cells)} cells ({cell_size}°)")

    if not cells:
        return {'type': 'FeatureCollection', 'features': [], 'model_metrics': _model_metrics}

    # Compute features for AOI cells (no target year — use all data)
    X, _, feature_names = _compute_grid_features(
        cells, fire_df, target_year=None,
        cell_size=cell_size, min_lat=bbox['min_lat'], min_lon=bbox['min_lon']
    )

    # Scale and predict
    X_scaled = _scaler.transform(X)
    raw_predictions = _model.predict(X_scaled)

    # Normalize to 0-100 risk score (percentile-based)
    if raw_predictions.max() > 0:
        # Use percentile ranking
        from scipy.stats import rankdata
        ranks = rankdata(raw_predictions, method='average')
        risk_scores = (ranks / len(ranks)) * 100
    else:
        risk_scores = np.zeros(len(raw_predictions))

    # Build GeoJSON
    features = []
    for i, cell in enumerate(cells):
        risk = round(float(risk_scores[i]), 1)
        raw = round(float(raw_predictions[i]), 3)
        
        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[
                    [cell['lon_min'], cell['lat_min']],
                    [cell['lon_max'], cell['lat_min']],
                    [cell['lon_max'], cell['lat_max']],
                    [cell['lon_min'], cell['lat_max']],
                    [cell['lon_min'], cell['lat_min']],
                ]]
            },
            'properties': {
                'risk_score': risk,
                'raw_prediction': raw,
                'center_lat': cell['center_lat'],
                'center_lon': cell['center_lon'],
            }
        })

    # Risk distribution summary
    scores = risk_scores
    risk_summary = {
        'high_risk_cells': int(np.sum(scores >= 75)),
        'medium_risk_cells': int(np.sum((scores >= 40) & (scores < 75))),
        'low_risk_cells': int(np.sum(scores < 40)),
        'total_cells': len(cells),
        'mean_risk': round(float(np.mean(scores)), 1),
        'max_risk': round(float(np.max(scores)), 1),
    }

    logger.info(f"[FIRE-ML] Risk summary: High={risk_summary['high_risk_cells']}, "
                f"Med={risk_summary['medium_risk_cells']}, Low={risk_summary['low_risk_cells']}")

    return {
        'type': 'FeatureCollection',
        'features': features,
        'risk_summary': risk_summary,
        'model_metrics': _model_metrics,
        'grid_cell_size_deg': cell_size,
        'grid_cell_size_km': round(cell_size * 111, 1),
    }

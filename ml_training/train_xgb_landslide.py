"""
============================================================
 XGBoost Landslide Classifier — Trained on Landslide4Sense
 Pixel-level binary classification using 6 spectral features
 Dataset: https://www.kaggle.com/datasets/tekbahadurkshetri/landslide4sense
============================================================
"""

import os
import sys
import glob
import numpy as np
import h5py
import joblib
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)

# ── CONFIG ────────────────────────────────────────────────────
MAX_TRAIN_PIXELS = 500_000   # Subsample to keep training fast (~2-3 min)
MAX_VAL_PIXELS   = 100_000
BALANCE_RATIO    = 1.0       # 1:1 ratio of landslide vs safe pixels
N_ESTIMATORS     = 200
MAX_DEPTH        = 8
LEARNING_RATE    = 0.1
RANDOM_STATE     = 42

FEATURE_NAMES = ['RED', 'GREEN', 'BLUE', 'NDVI', 'SLOPE', 'ELEVATION']

# ── FEATURE EXTRACTION ───────────────────────────────────────
def extract_6ch_features(h5_path: str) -> np.ndarray:
    """
    Extract 6-channel feature array from a 14-band Landslide4Sense H5 file.
    
    Input H5 structure: 'img' key with shape (128, 128, 14)
    Bands: B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12, SLOPE, DEM
    
    Output features (per pixel):
      0: RED   (B4, index 3)
      1: GREEN (B3, index 2)
      2: BLUE  (B2, index 1)
      3: NDVI  (B8-B4)/(B8+B4)
      4: SLOPE (index 12)
      5: ELEVATION/DEM (index 13)
    """
    with h5py.File(h5_path, 'r') as f:
        img = f['img'][:]  # (128, 128, 14)
    
    img = img.astype(np.float32)
    
    b2 = img[:, :, 1]   # Blue
    b3 = img[:, :, 2]   # Green
    b4 = img[:, :, 3]   # Red
    b8 = img[:, :, 7]   # NIR
    slope = img[:, :, 12]
    dem = img[:, :, 13]
    
    # NDVI
    ndvi = np.divide(b8 - b4, b8 + b4 + 1e-8)
    ndvi = np.nan_to_num(ndvi, nan=0.0)
    
    features = np.stack([b4, b3, b2, ndvi, slope, dem], axis=-1)  # (128, 128, 6)
    return features


def load_mask(h5_path: str) -> np.ndarray:
    """Load binary mask from H5 file. Shape: (128, 128)"""
    with h5py.File(h5_path, 'r') as f:
        mask = f['mask'][:]
    return mask.astype(np.int32).squeeze()


def find_dataset_path():
    """
    Auto-detect the Landslide4Sense dataset path.
    Checks kagglehub cache and common local paths.
    """
    # Check kagglehub default cache
    home = os.path.expanduser("~")
    kaggle_cache = os.path.join(home, ".cache", "kagglehub", "datasets",
                                "tekbahadurkshetri", "landslide4sense")
    
    # Find the latest version
    if os.path.isdir(kaggle_cache):
        versions = sorted(glob.glob(os.path.join(kaggle_cache, "versions", "*")))
        if versions:
            return versions[-1]
    
    # Check if dataset is in project data folder
    local_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'landslide4sense')
    if os.path.isdir(local_path):
        return os.path.abspath(local_path)
    
    return None


def load_dataset(dataset_path: str, split: str = "TrainData"):
    """
    Load all H5 images and masks from a split folder.
    Returns flattened (N_pixels, 6) features and (N_pixels,) labels.
    """
    img_dir = os.path.join(dataset_path, split, "img")
    mask_dir = os.path.join(dataset_path, split, "mask") if split != "TestData" else None
    
    if not os.path.isdir(img_dir):
        raise FileNotFoundError(f"Image directory not found: {img_dir}")
    
    h5_files = sorted(glob.glob(os.path.join(img_dir, "*.h5")))
    print(f"  Found {len(h5_files)} H5 files in {split}/img/")
    
    all_features = []
    all_labels = []
    
    for i, h5_path in enumerate(h5_files):
        fname = os.path.basename(h5_path)
        
        try:
            features = extract_6ch_features(h5_path)  # (128, 128, 6)
            pixels = features.reshape(-1, 6)           # (16384, 6)
            
            if mask_dir:
                # Map image_N.h5 → mask_N.h5
                img_id = fname.replace('image_', '').replace('.h5', '')
                mask_fname = f"mask_{img_id}.h5"
                mask_path = os.path.join(mask_dir, mask_fname)
                if os.path.exists(mask_path):
                    mask = load_mask(mask_path)          # (128, 128)
                    labels = mask.reshape(-1)             # (16384,)
                    all_features.append(pixels)
                    all_labels.append(labels)
                else:
                    # No mask file — skip this image
                    continue
            else:
                all_features.append(pixels)
            
            if (i + 1) % 500 == 0:
                print(f"    Processed {i + 1}/{len(h5_files)} files...")
                
        except Exception as e:
            print(f"    Warning: Skipping {fname}: {e}")
            continue
    
    X = np.concatenate(all_features, axis=0)
    y = np.concatenate(all_labels, axis=0) if all_labels else None
    
    print(f"  Total pixels: {X.shape[0]:,} ({X.shape[0] // 16384} images)")
    if y is not None:
        landslide_pct = (y.sum() / len(y)) * 100
        print(f"  Landslide pixels: {y.sum():,} ({landslide_pct:.2f}%)")
    
    return X, y


def balanced_subsample(X, y, max_samples, balance_ratio=1.0):
    """
    Balanced subsampling — ensures equal representation of both classes.
    This is critical for landslide detection since <5% of pixels are landslide.
    """
    pos_idx = np.where(y == 1)[0]
    neg_idx = np.where(y == 0)[0]
    
    n_pos = len(pos_idx)
    n_neg = len(neg_idx)
    
    # Target: equal samples from each class, capped at max_samples/2
    n_per_class = min(n_pos, int(max_samples / (1 + balance_ratio)))
    n_neg_target = min(n_neg, int(n_per_class * balance_ratio))
    
    print(f"  Subsampling: {n_per_class:,} landslide + {n_neg_target:,} safe = {n_per_class + n_neg_target:,} total")
    
    rng = np.random.RandomState(RANDOM_STATE)
    pos_sample = rng.choice(pos_idx, size=n_per_class, replace=False)
    neg_sample = rng.choice(neg_idx, size=n_neg_target, replace=False)
    
    idx = np.concatenate([pos_sample, neg_sample])
    rng.shuffle(idx)
    
    return X[idx], y[idx]


def train():
    """Main training pipeline."""
    import xgboost as xgb
    
    print("=" * 60)
    print("  XGBoost Landslide Classifier — Landslide4Sense Dataset")
    print("=" * 60)
    
    # ── Find dataset ──────────────────────────────────────────
    dataset_path = find_dataset_path()
    if dataset_path is None:
        print("❌ Landslide4Sense dataset not found!")
        print("   Run: python -c \"import kagglehub; kagglehub.dataset_download('tekbahadurkshetri/landslide4sense')\"")
        sys.exit(1)
    
    print(f"\n📂 Dataset path: {dataset_path}")
    
    # ── Load training data ────────────────────────────────────
    print("\n📊 Loading training data...")
    X_train_full, y_train_full = load_dataset(dataset_path, "TrainData")
    
    # ── Clean NaN/Inf values ──────────────────────────────────
    valid_mask = np.isfinite(X_train_full).all(axis=1)
    X_train_full = X_train_full[valid_mask]
    y_train_full = y_train_full[valid_mask]
    print(f"  After cleaning: {X_train_full.shape[0]:,} valid pixels")
    
    # ── Balanced subsampling ──────────────────────────────────
    # ValidData has no mask labels, so we split TrainData 80/20
    print("\n-- Balanced subsampling...")
    X_sampled, y_sampled = balanced_subsample(
        X_train_full, y_train_full, MAX_TRAIN_PIXELS + MAX_VAL_PIXELS
    )
    
    # Split into train/val (80/20)
    from sklearn.model_selection import train_test_split
    X_train, X_val, y_train, y_val = train_test_split(
        X_sampled, y_sampled, test_size=0.2, random_state=RANDOM_STATE, stratify=y_sampled
    )
    print(f"  Train: {len(X_train):,}  |  Val: {len(X_val):,}")
    
    # ── Train XGBoost ─────────────────────────────────────────
    print(f"\n🚀 Training XGBoost Classifier...")
    print(f"   n_estimators={N_ESTIMATORS}, max_depth={MAX_DEPTH}, lr={LEARNING_RATE}")
    print(f"   Training samples: {len(X_train):,}")
    print(f"   Validation samples: {len(X_val):,}")
    
    model = xgb.XGBClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        learning_rate=LEARNING_RATE,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=1.0,  # Already balanced via subsampling
        random_state=RANDOM_STATE,
        eval_metric='logloss',
        tree_method='hist',     # Fast histogram-based training
        n_jobs=-1,
        verbosity=1,
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=True,
    )
    
    # ── Evaluate ──────────────────────────────────────────────
    print("\n📈 Evaluating on validation set...")
    y_pred = model.predict(X_val)
    y_prob = model.predict_proba(X_val)[:, 1]
    
    accuracy = accuracy_score(y_val, y_pred)
    precision = precision_score(y_val, y_pred, zero_division=0)
    recall = recall_score(y_val, y_pred, zero_division=0)
    f1 = f1_score(y_val, y_pred, zero_division=0)
    cm = confusion_matrix(y_val, y_pred)
    
    print(f"\n{'='*40}")
    print(f"  Accuracy:  {accuracy:.4f} ({accuracy*100:.1f}%)")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")
    print(f"  F1 Score:  {f1:.4f}")
    print(f"{'='*40}")
    print(f"\nConfusion Matrix:")
    print(f"  TN={cm[0][0]:,}  FP={cm[0][1]:,}")
    print(f"  FN={cm[1][0]:,}  TP={cm[1][1]:,}")
    
    # Feature importance
    print(f"\n🔍 Feature Importance:")
    importances = model.feature_importances_
    for name, imp in sorted(zip(FEATURE_NAMES, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 50)
        print(f"  {name:>10s}: {imp:.4f} {bar}")
    
    # ── Save model ────────────────────────────────────────────
    save_dir = os.path.join(os.path.dirname(__file__), '..', 'backend', 'ml_models')
    os.makedirs(save_dir, exist_ok=True)
    
    model_path = os.path.join(save_dir, 'landslide_xgb.joblib')
    joblib.dump(model, model_path)
    
    # Save metrics alongside
    metrics = {
        'algorithm': 'XGBoost Classifier',
        'dataset': 'Landslide4Sense',
        'n_estimators': N_ESTIMATORS,
        'max_depth': MAX_DEPTH,
        'learning_rate': LEARNING_RATE,
        'training_samples': len(X_train),
        'validation_samples': len(X_val),
        'accuracy': round(accuracy, 4),
        'precision': round(precision, 4),
        'recall': round(recall, 4),
        'f1': round(f1, 4),
        'feature_names': FEATURE_NAMES,
        'feature_importances': {n: round(float(v), 4) for n, v in zip(FEATURE_NAMES, importances)},
        'confusion_matrix': cm.tolist(),
    }
    metrics_path = os.path.join(save_dir, 'landslide_xgb_metrics.joblib')
    joblib.dump(metrics, metrics_path)
    
    print(f"\n✅ Model saved to: {os.path.abspath(model_path)}")
    print(f"   Size: {os.path.getsize(model_path) / 1024 / 1024:.1f} MB")
    print(f"   Metrics saved to: {os.path.abspath(metrics_path)}")
    
    return model, metrics


if __name__ == '__main__':
    train()

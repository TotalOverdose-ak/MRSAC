"""
backend/utils/thumbnail.py
==========================
Generates RGB base64 thumbnail from a Sentinel-2 GeoTIFF with
spectral mine highlighting and optional segmentation mask overlay.
"""

import base64
import logging
from io import BytesIO

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def make_thumbnail(
    tif_path: str,
    verdict: str = "UNVERIFIED",
    size: int = 320,
    mask_arr: np.ndarray | None = None,
) -> str:
    """
    Returns a base64-encoded PNG thumbnail string.

    Parameters
    ----------
    tif_path  : path to a 11-band Sentinel-2 GeoTIFF
    verdict   : one of ILLEGAL | SUSPECT | LEGAL | USER_LEGAL | UNVERIFIED
    size      : output thumbnail square size in pixels
    mask_arr  : optional binary numpy mask (H×W) from model segmentation
    """
    import rasterio
    from scipy.ndimage import binary_dilation

    with rasterio.open(tif_path) as src:
        raw = src.read().astype(np.float32)

    # ── True-colour RGB (B4/B3/B2 → indices 2,1,0) ──────────────
    rgb = np.stack([raw[2], raw[1], raw[0]], axis=-1)
    for c in range(3):
        vals = rgb[..., c][rgb[..., c] > 0]
        if len(vals) > 10:
            p2, p98 = np.percentile(vals, [2, 98])
            rgb[..., c] = np.clip((rgb[..., c] - p2) / (p98 - p2 + 1e-6), 0, 1)

    # ── Spectral mine mask (BSI + NDVI) ──────────────────────────
    b11  = raw[9]
    b4   = raw[2]
    b8   = raw[6]
    bsi  = (b11 - b4) / np.maximum(b11 + b4, 1e-6)
    ndvi = (b8  - b4) / np.maximum(b8  + b4, 1e-6)
    spec_mask = (bsi > 0.05) & (ndvi < 0.30)

    rgb_u8 = (rgb * 255).clip(0, 255).astype(np.uint8)
    img    = Image.fromarray(rgb_u8, "RGB").convert("RGBA")

    # ── Spectral overlay ─────────────────────────────────────────
    if spec_mask.any():
        color_map = {
            "ILLEGAL":   [255,  61,  90, 100],
            "SUSPECT":   [245, 166,  35, 100],
            "LEGAL":     [  0, 196, 140,  85],
            "USER_LEGAL":[  77,166, 255,  85],
        }
        rgba = color_map.get(verdict, [74, 94, 114, 85])
        ov   = np.zeros((*spec_mask.shape, 4), dtype=np.uint8)
        ov[spec_mask] = rgba
        img = Image.alpha_composite(img, Image.fromarray(ov, "RGBA"))

    # ── Segmentation mask overlay ────────────────────────────────
    if mask_arr is not None and mask_arr.max() > 0:
        h, w  = raw.shape[1], raw.shape[2]
        m_img = Image.fromarray((mask_arr * 255).astype(np.uint8), "L").resize(
            (w, h), Image.NEAREST
        )
        m_np  = np.array(m_img)
        ov2   = np.zeros((h, w, 4), dtype=np.uint8)
        ov2[m_np > 128] = [255, 255, 255, 60]
        border = binary_dilation(m_np > 128, iterations=2) & ~(m_np > 128)
        ov2[border] = [255, 255, 255, 200]
        img = Image.alpha_composite(img, Image.fromarray(ov2, "RGBA"))

    # ── Crop black borders ────────────────────────────────────────
    arr = np.array(img.convert("RGB"))
    nb  = np.any(arr > 10, axis=2)
    rm  = np.any(nb, axis=1)
    cm  = np.any(nb, axis=0)
    if rm.any() and cm.any():
        r0, r1 = np.where(rm)[0][[0, -1]]
        c0, c1 = np.where(cm)[0][[0, -1]]
        img = img.crop((c0, r0, c1 + 1, r1 + 1))

    img = img.convert("RGB").resize((size, size), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()

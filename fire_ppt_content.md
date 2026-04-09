# 🔥 Forest Fire Module — PPT Content

---

## Slide 1 — Forest Fire: Burn Severity Analysis

### Title: Forest Fire — Post-Fire Burn Severity Mapping

### Subtitle / One-liner:
> Detects wildfire-affected zones and classifies burn damage into severity levels using satellite-based spectral analysis

---

### Left Column — "What & How" (bullet points)

**What it does:**
- Analyzes **before & after satellite imagery** to detect fire-damaged areas
- Classifies damage into **4 severity levels** using USGS standard
- Computes **total burned area in hectares**

**Method — dNBR (delta Normalized Burn Ratio):**
- NBR uses **NIR vs SWIR** bands — sensitive to vegetation water content & soil moisture
- **dNBR = Pre-fire NBR − Post-fire NBR**
  - Higher dNBR → More severe burn
  - Near zero → Unburned / Regrowth

**Key Specs:**
- **Satellite:** Sentinel-2 SR (10m resolution)
- **Cloud Filtering:** QA60 band — removes cloud & cirrus pixels
- **Water Masking:** Dynamic World — prevents water bodies from showing as "burned"
- **Processing:** Google Earth Engine (server-side)

---

### Right Column — Severity Classification Table (keep this visual)

| dNBR Range | Severity | Meaning |
|:----------:|:--------:|:--------|
| < 0.10 | 🟢 Unburned | No damage or regrowth |
| 0.10 – 0.27 | 🟡 Low | Mild surface burn |
| 0.27 – 0.66 | 🟠 Moderate | Canopy + ground damage |
| > 0.66 | 🔴 High | Complete vegetation loss |

---

### Bottom Strip / Footer (small text or icons)

**4 Output Layers:** Pre-Fire RGB | Post-Fire RGB | dNBR Severity Heatmap | Burned Area Mask

---

## Slide 2 — Forest Fire: Workflow (flowchart slide — keep as is)

```
User selects area + date ranges (Pre-Fire & Post-Fire)
        ↓
Sentinel-2 imagery fetched (< 20% cloud cover filter)
        ↓
Cloud masking (QA60 band) + Median composite
        ↓
NBR computed | NBR = (B8 − B12) / (B8 + B12)
        ↓
dNBR = Pre-NBR − Post-NBR
        ↓
Water bodies masked (Dynamic World label ≠ 0)
        ↓
Burn severity classified per USGS thresholds
        ↓
Area statistics (hectares per class) + 4 map layers returned
```

---

## Key Talking Points for Viva / Q&A

> **Q: Why dNBR and not just visual comparison?**
> A: dNBR is a **standardized, quantitative method** (USGS). It uses SWIR bands which are highly sensitive to **soil moisture and vegetation water content** — both critically affected by fire — making it far more accurate than RGB analysis.

> **Q: Why Sentinel-2?**
> A: Free 10m resolution with **SWIR bands (B12)** needed for NBR. Global coverage with 5-day revisit via Google Earth Engine.

> **Q: Why mask water bodies?**
> A: Water has very low NBR → looks like "burned" in dNBR. Dynamic World's land cover labels remove this false positive.

> **Q: What is cloud masking?**
> A: QA60 band removes cloud/cirrus pixels. Only images with < 20% cloud cover are used for compositing.

> **Q: Can this detect ongoing/active fires?**
> A: No — this is **post-fire damage assessment** (burn scars). Active fire detection requires thermal sensors (MODIS/VIIRS FIRMS).

> **Q: What is the resolution?**  
> A: 10 meters — each pixel represents a 10m × 10m area on the ground. Area is computed in hectares using `ee.Image.pixelArea()`.

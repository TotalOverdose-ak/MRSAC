# 🔥 Forest Fire Module — PPT Content (4 Slides)

---

## Slide 1 — Forest Fire: Post-Fire Burn Severity Mapping (EXISTING — minor update)

### Title: Forest Fire — Burn Severity Analysis (dNBR)

### Subtitle:
> Detects wildfire-affected zones and classifies burn damage into severity levels using satellite-based spectral analysis

---

### Left Column — "What & How"

**What it does:**
- Analyzes **before & after satellite imagery** to detect fire-damaged areas
- Classifies damage into **5 severity levels** using USGS standard
- Computes **total burned area in hectares** (moderate+ severity only, USGS BAER standard)

**Method — dNBR (delta Normalized Burn Ratio):**
- NBR uses **NIR vs SWIR** bands — sensitive to vegetation water content & soil moisture
- **dNBR = Pre-fire NBR − Post-fire NBR**
  - Higher dNBR → More severe burn
  - Near zero → Unburned / Regrowth

**Key Specs:**
- **Satellite:** Sentinel-2 SR Harmonized (10m resolution)
- **Cloud Filtering:** QA60 band — removes cloud & cirrus pixels
- **Water Masking:** Dynamic World — prevents water bodies from showing as "burned"
- **Processing:** Google Earth Engine (server-side)

---

### Right Column — Severity Classification Table

| dNBR Range | Severity | Meaning |
|:----------:|:--------:|:--------|
| < 0.10 | 🟢 Unburned | No damage or regrowth |
| 0.10 – 0.27 | 🟡 Low | Mild surface burn (grass, surface litter) |
| 0.27 – 0.44 | 🟠 Moderate | Canopy + ground damage |
| 0.44 – 0.66 | 🟠🔴 Moderate-High | Significant canopy and understory loss |
| > 0.66 | 🔴 High | Complete vegetation destruction |

> These thresholds are from **USGS (United States Geological Survey)** — internationally recognized standard, not custom.

---

### Bottom Strip / Footer

**4 Output Map Layers:** Pre-Fire RGB | Post-Fire RGB | dNBR Severity Heatmap | Burned Area Mask

---

## Slide 2 — Forest Fire Workflow (EXISTING — no changes needed)

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

## Slide 3 — ★ NEW ★ NASA FIRMS: 17M+ Satellite Fire Detection Database

### Title: Forest Fire — NASA FIRMS Fire History Engine

### Subtitle:
> Real-time and historical fire detection data from 5 NASA satellites, indexed for instant spatial queries

---

### Left Column — "Data Architecture"

**What is FIRMS?**
- **Fire Information for Resource Management System** by NASA
- Satellite-based fire detection using **thermal sensors** (detects heat, not smoke)
- Covers **all of India** from **2001 to 2025** — 24 years of fire data

**Data Pipeline:**

| Component | Detail |
|-----------|--------|
| **Data Source** | NASA FIRMS (free public dataset) |
| **Data Size** | ~1.29 GB (CSV files) |
| **Total Records** | **17,000,000+ fire detection points** |
| **Satellites** | MODIS (Aqua/Terra), Suomi-NPP, NOAA-20, NOAA-21 |
| **Sensors** | MODIS (1km) + VIIRS (375m resolution) |
| **Loading** | All CSVs loaded into RAM at server startup |
| **Spatial Index** | SciPy **cKDTree** — O(log n) spatial queries |
| **Optimized RAM** | ~500 MB (float32, category dtypes) |

**How It Works:**

```
Server starts
    ↓
All FIRMS CSVs loaded into pandas DataFrame (~17M rows)
    ↓
KD-Tree spatial index built on (latitude, longitude)
    ↓
Ready for instant queries ✓

User draws polygon on map
    ↓
Bounding box extracted from polygon
    ↓
KD-Tree + vectorized pandas filtering
    ↓
Fire points returned as GeoJSON FeatureCollection
    ↓
Rendered on map as heat-styled circles
```

---

### Right Column — "Hotspot Visualization & Analytics"

**Map Visualization:**
- Each fire point = circle on the map
- **Circle radius** scales with **FRP** (Fire Radiative Power): 0 MW → small, 200 MW → large
- **Circle color** scales with **brightness temperature**: 300K → Yellow, 420K → Dark Red
- Supports **date range filtering** and **confidence threshold** (0-100%)
- Caps at 15,000 points for smooth rendering

**Fire Analytics (for Analytical Report):**

| Metric | What It Shows |
|--------|---------------|
| **Total Fire Count** | Number of fire detections in the selected area |
| **Monthly Breakdown** | Bar chart — which months have most fires? |
| **Yearly Trend** | Multi-year trend — fires increasing or decreasing? |
| **Peak Month** | Which month consistently has the most fires |
| **Avg FRP** | Average Fire Radiative Power (MW) — fire intensity |
| **Max FRP** | Highest intensity fire ever recorded in the area |
| **Avg Brightness** | Mean brightness temperature (Kelvin) |
| **Day/Night Split** | % fires detected daytime vs nighttime |
| **Confidence Levels** | High / Medium / Low confidence distribution |
| **Satellite Sources** | Fire count per satellite (MODIS, VIIRS, etc.) |

**Confidence Normalization:**
- VIIRS uses letters: `l` → 30, `n` → 60, `h` → 90
- MODIS uses numbers: 0-100
- System normalizes both to a **unified 0-100 scale**

---

### Bottom Strip

**3 API Endpoints:** `/api/fire/hotspots` (map points) | `/api/fire/stats` (report analytics) | `/api/fire/risk` (ML prediction)

---

## Slide 4 — ★ NEW ★ ML Fire Risk Prediction (Random Forest)

### Title: Forest Fire — Machine Learning Risk Prediction Engine

### Subtitle:
> Predicting future fire risk using a Random Forest model trained on 17M+ historical fire detections

---

### Left Column — "Model Architecture"

**What it does:**
- Divides any user-selected area into a **grid of cells** (~1 km × 1 km)
- For each cell, predicts a **fire risk score (0-100)**
- Uses **12 engineered features** computed from historical FIRMS data
- Output: colored risk grid overlaid on the map

**Model Specifications:**

| Parameter | Value |
|-----------|-------|
| **Algorithm** | Random Forest Regressor |
| **Trees** | 200 estimators |
| **Max Depth** | 12 |
| **Min Samples Leaf** | 5 |
| **Training Data** | 17M+ NASA FIRMS detections |
| **Training Grid** | 0.1° cells (~11 km) over all India |
| **Prediction Grid** | 0.01° cells (~1.1 km) for fine AOI |
| **Validation** | Temporal split — train on pre-2025, test on 2025 |
| **Scaler** | StandardScaler (feature normalization) |

**Inspired by:** Ken Steif's "PredictingFireRisk" research (adapted from R/Poisson GLM to Python/scikit-learn)

---

### Right Column — "12 Engineered Features"

**Per-cell features computed from FIRMS historical data:**

| # | Feature | What It Measures |
|---|---------|-----------------|
| 1 | **fire_count** | Total historical fire detections |
| 2 | **fire_density** | Fires per year (normalized) |
| 3 | **mean_frp** | Average Fire Radiative Power — intensity |
| 4 | **max_frp** | Worst-case fire intensity ever |
| 5 | **mean_brightness** | Average brightness temperature (K) |
| 6 | **fire_years** | How many unique years had fires |
| 7 | **recurrence_rate** | fire_years / total_years — how often fires recur |
| 8 | **seasonal_concentration** | Herfindahl Index — are fires concentrated in 1-2 months? (0 = uniform, 1 = one month) |
| 9 | **peak_month_fires** | Max fires in any single month |
| 10 | **mean_confidence** | Average detection confidence |
| 11 | **recent_fire_trend** | Slope of yearly count (last 5 years) — ↑ or ↓? |
| 12 | **neighbor_fire_density** | Avg fires in 8 surrounding cells (spatial autocorrelation) |

**Feature Computation Pipeline:**
```
FIRMS DataFrame (17M rows)
    ↓
Vectorized cell assignment — each fire point → grid cell (integer division, O(1))
    ↓
GroupBy cell_key → pandas aggregation (fire_count, mean_frp, max_frp, etc.)
    ↓
Monthly counts → Herfindahl index for seasonal_concentration
    ↓
Last 5 years → linear slope for recent_fire_trend
    ↓
3×3 kernel average → neighbor_fire_density (spatial context)
    ↓
Feature Matrix: X (n_cells × 12 features) → StandardScaler → Random Forest
```

**Risk Score Output:**

| Score Range | Risk Level | Map Color |
|-------------|-----------|-----------|
| 0 – 20 | 🟢 Very Low | Deep Emerald |
| 20 – 40 | 🟢 Low | Emerald |
| 40 – 60 | 🟡 Moderate | Amber |
| 60 – 75 | 🟠 Elevated | Orange |
| 75 – 90 | 🔴 High | Red |
| 90 – 100 | ⬛ Extreme | Dark Red |

> Raw prediction → Percentile ranking → Normalized 0-100 score

---

### Bottom Strip

**Key Differentiator:** Unlike dNBR (which detects past burns), this ML model **predicts where fires are likely to occur next** based on historical patterns, intensity, recurrence, and spatial context.

---

## Fire Report: Comprehensive Analytical Output

> This doesn't need a separate slide — mention it on Slide 3 or Slide 4 as a callout box:

**Fire Analytical Report combines all 3 engines:**
1. **dNBR Section** — Total burned area, 4 severity categories with area (ha)
2. **FIRMS Section** — Donut chart (confidence), monthly bars, yearly trend, day/night split, satellite sources
3. **ML Section** — Model metrics (R², MAE), risk distribution (High/Med/Low cells), feature importances
4. **PDF Export** — One-click A4 report with unique tracking ID (EW-FIRE-{timestamp})

---

## Key Talking Points for Viva / Q&A

> **Q: Why dNBR and not just visual comparison?**
> A: dNBR is a **standardized, quantitative method** (USGS). It uses SWIR bands which are highly sensitive to **soil moisture and vegetation water content** — both critically affected by fire — making it far more accurate than RGB analysis.

> **Q: Why Sentinel-2?**
> A: Free 10m resolution with **SWIR bands (B12)** needed for NBR. Global coverage with 5-day revisit via Google Earth Engine.

> **Q: Why mask water bodies?**
> A: Water has very low NBR → looks like "burned" in dNBR. Dynamic World's land cover labels remove this false positive.

> **Q: What is NASA FIRMS?**
> A: Fire Information for Resource Management System. NASA distributes fire detection data from 5 satellites (MODIS on Aqua/Terra + VIIRS on Suomi-NPP/NOAA-20/NOAA-21). MODIS detects at 1km resolution, VIIRS at 375m. We loaded 17M+ detections covering all of India (2001-2025).

> **Q: Why KD-Tree for spatial indexing?**
> A: With 17M rows, a brute-force bounding box search on every query would be O(n) — too slow. KD-Tree provides O(log n) spatial queries. We use SciPy's `cKDTree` which is implemented in C for performance.

> **Q: How does the Random Forest risk model work?**
> A: We divide India into 0.1° grid cells (~11km). For each cell, we compute 12 features from historical FIRMS data (fire count, recurrence, intensity, trend, etc.). The model learns: "cells with high fire_density + high recurrence_rate + increasing recent_trend = high risk". During prediction, we create a finer grid (0.01°, ~1km) over the user's AOI and predict risk scores.

> **Q: What is the Herfindahl Index for seasonal concentration?**
> A: It measures whether fires are spread evenly across months or concentrated in 1-2 months. Formula: sum of squared monthly proportions. Value close to 1 = fires only happen in one month (highly seasonal). Close to 1/12 = fires happen uniformly throughout the year.

> **Q: What is neighbor_fire_density (spatial autocorrelation)?**
> A: Fire risk is spatially correlated — if your neighboring cells have many fires, your cell is also likely at risk. We compute the average fire count of the 8 surrounding cells (3×3 kernel). This captures **Tobler's First Law of Geography**: "Everything is related to everything else, but near things are more related."

> **Q: Can this model predict WHEN fires will occur?**
> A: Currently it predicts **WHERE** (spatial risk). For temporal prediction, we would need weather data (temperature, humidity, wind) integrated with the model — that's a future enhancement.

> **Q: What's the difference between dNBR vs FIRMS vs ML Risk?**
> A: 
> - **dNBR** = Looks at **past burn scars** (post-fire damage assessment using Sentinel-2 spectral change)
> - **FIRMS** = Shows **historical fire detections** from thermal satellite sensors (where fires actually occurred)
> - **ML Risk** = **Predicts future fire probability** based on historical patterns (where fires are likely to occur)
> All three complement each other — detection, history, and prediction.

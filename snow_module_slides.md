# ❄️ Snow & Ice Cover Module — Slides

````carousel
## ❄️ Slide 1: Snow Module — Explanation

### 📁 2 Files Involved
```
1. backend/controllers/snow.py          → API Route — frontend se request aati hai
2. backend/services/analysis/snow_cover.py → Core Logic — NDSI calculation + snow detection
```

---

### 🔬 Core Concept: NDSI (Normalized Difference Snow Index)

**Formula:**
```
NDSI = (Green − SWIR1) / (Green + SWIR1)
```
- Snow **strongly reflects** Green light but **absorbs** SWIR (Short-Wave Infrared)
- Toh snow pixels ka NDSI value **high** hota hai (close to +1)
- Non-snow pixels ka NDSI **low** ya negative hota hai
- **Threshold: NDSI > 0.4 → Snow hai** ✅ (Standard scientific threshold)

**Analogy:** Jaise litmus paper acid/base batata hai color change se — waise NDSI value se snow ya non-snow identify hota hai.

---

### 🛰️ Data Source: Landsat 8 + Landsat 9

| Detail | Value |
|--------|-------|
| Satellite | Landsat 8 (2013+) & Landsat 9 (2021+) |
| Resolution | 30 meters per pixel |
| Collection | `LANDSAT/LC08/C02/T1_L2` + `LC09` |
| Bands Used | B3 (Green), B6 (SWIR1) |
| Cloud Masking | QA_PIXEL bitwise flags |

**Kyun Landsat?** Sentinel-2 mein SWIR1 band 20m hai, Landsat mein consistently 30m — aur **2014 se data available** hai for long-term trend analysis.

---

### ⚙️ Step-by-Step Pipeline

**Step 1 — Cloud Masking:**
```
QA_PIXEL band se 4 cheezein remove:
  → Dilated clouds, Cirrus, Cloud, Cloud Shadow
Result: Clean, cloud-free composite image
```

**Step 2 — Yearly Composite:**
```
Landsat 8 + 9 merge → Cloud mask apply → Median composite
(Median = reduces noise, ek stable representative image banti hai)
```

**Step 3 — NDSI Calculate:**
```
NDSI = (B3 − B6) / (B3 + B6)
Har pixel ko ek score milta hai: -1 se +1 tak
```

**Step 4 — Snow Mask (Thresholding):**
```
NDSI > 0.4 → Snow = 1 (Yes)
NDSI ≤ 0.4 → Snow = 0 (No)
Binary mask ban gayi — har pixel: snow ya non-snow
```

**Step 5 — Area Calculation:**
```
Snow Area = Count of snow pixels × pixel area (in km²)
Total Area = ROI ka total area
Coverage % = (Snow Area / Total Area) × 100
```

**Step 6 — 3 Map Layers Generated:**

| Layer | Kya dikhata hai? |
|-------|-----------------|
| **RGB Tiles** | Normal satellite photo (True Color) |
| **NDSI Heatmap** | Brown→White→Blue gradient (low→high NDSI) |
| **Snow Mask** | Cyan overlay sirf snow pixels pe |

**Step 7 — Multi-Year Trend (2014–2025):**
```
Har saal ke liye Step 1-5 repeat → Snow area per year
Result: Array of {year, area_km²} → Frontend pe line chart banta hai
```

---

### 🎯 Viva Mein Bolna Hai:

> *"Snow module Landsat 8/9 satellite imagery use karta hai Google Earth Engine se.
> NDSI (Normalized Difference Snow Index) calculate karta hai — jo Green aur SWIR1 bands ka ratio hai.
> NDSI > 0.4 threshold se snow pixels identify hote hai.
> Area calculation ke baad 3 map layers generate hoti hai — RGB, NDSI heatmap, aur snow binary mask.
> Multi-year trend analysis 2014 se 2025 tak snow retreat/advance track karti hai."*

<!-- slide -->
## ❄️ Slide 2: Snow Module — Workflow Diagram

![Snow & Ice Cover Detection Module — Complete Processing Pipeline](C:\Users\AkashK\.gemini\antigravity\brain\1872321f-0f1e-4985-bb15-5e442a46c321\snow_workflow_diagram_1774968960763.png)

### 📋 Quick Reference — Key Technical Points

| Component | Detail |
|-----------|--------|
| **API Endpoint** | `POST /api/snow` |
| **Index Used** | NDSI (Normalized Difference Snow Index) |
| **Formula** | `(Green − SWIR1) / (Green + SWIR1)` |
| **Threshold** | NDSI > 0.4 = Snow ✅ |
| **Satellite** | Landsat 8 + 9 (30m resolution) |
| **Cloud Masking** | QA_PIXEL bitwise flags (4 conditions) |
| **Composite Method** | Yearly median composite |
| **Output Layers** | RGB, NDSI Heatmap, Snow Binary Mask |
| **Trend Range** | 2014–2025 (12 years) |
| **Async Processing** | Snow analysis + Trend run in parallel |

````

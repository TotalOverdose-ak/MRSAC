# 🏔️ Landslide Susceptibility Module — Slides

````carousel
## 🏔️ Slide 1: Landslide Module — Explanation

### 📁 4 Files Involved
```
1. backend/controllers/landslide.py              → API Routes (3 endpoints)
2. backend/services/analysis/landslide.py        → Engine 1: GEE Random Forest
3. backend/services/analysis/dl_landslide.py     → Engine 2: Deep Learning U-Net (Landslide4Sense)
4. ml_training/train_custom_landslide.py         → Training Script (offline batch training)
```

---

### 🔬 Core Concept: Landslide Susceptibility Mapping

**Kya hai?** Kisi bhi area ka "kitna khatre mein hai" woh estimate karna — **landslide hone se pehle** — terrain features ke basis pe.

**Analogy:** Jaise doctor risk factors dekh ke bolta hai "heart attack ka chance high hai" (BP, cholesterol, age dekh ke) — waise hum terrain factors dekh ke bolte hai "landslide ka chance high hai" (slope, elevation, rainfall dekh ke).

---

### 🎛️ 3 API Endpoints

| URL | Kab chalta hai? | Kya karta hai? |
|-----|-----------------|----------------|
| `POST /api/landslide` | User "Analyze" click kare | Susceptibility map generate (RF ya U-Net) |
| `POST /api/landslide/train` | User galti correct kare | Active Learning — U-Net fine-tune |
| `POST /api/landslide/distill` | User "Auto-Label" click kare | Knowledge Distillation — RF Teacher → U-Net Student |

### Engine Selection:
```
Request mein "engine" field aata hai:
    → engine = "deep_learning" → U-Net CNN chalega
    → engine = "gee" (default)  → GEE Random Forest chalega
```

---

## ⚙️ ENGINE 1: GEE Random Forest (landslide.py)

### Step 1 — Terrain Stack Build (10 Bands):

| # | Variable | Source | Kyun Important? |
|---|----------|--------|-----------------|
| 1 | **Elevation** | NASA DEM (30m) | Zyada height = zyada risk |
| 2 | **Slope** | DEM se derive | **#1 Factor** — steep slope = landslide prone |
| 3 | **Aspect** | DEM se derive | Kaunsi direction face karta hai (sun exposure) |
| 4 | **Hillshade** | DEM se derive | Shadow pattern — terrain roughness indicator |
| 5 | **Flow Accumulation** | MERIT Hydro | Paani kahan collect hota hai (saturation point) |
| 6 | **HAND** | Global HAND 30m | Height Above Nearest Drainage — paani se kitna upar |
| 7 | **TPI** | DEM se derive | Topographic Position Index — ridge ya valley? |
| 8 | **Distance to Drainage** | MERIT Hydro | River se kitna door — river erosion affect karta hai |
| 9 | **NDVI** | Sentinel-2 | Vegetation cover — roots hold soil, kam NDVI = weak soil |
| 10 | **Precipitation** | CHIRPS rainfall | Zyada baarish = zyada landslide trigger |

**Analogy:** 10 terrain features = 10 medical test results. Sab milake "patient (area) ka health report" banta hai.

### Step 2 — Slope Units (HydroSHEDS Catchments):

```
Normal approach: Random pixels sample karo  ❌ (noisy, context nahi milta)
Our approach:    HydroSHEDS watersheds use karo ✅ (natural geographic units)
```

**Kya hai?** HydroSHEDS Level-12 basins = chhoti-chhoti valleys/catchments jo naturally terrain divide karti hai. Har catchment ke andar 5 variables ka **average** nikala (elevation, slope, aspect, precipitation, NDVI).

**Kyun?** Landslide ek pixel mein nahi hota — poori slope unit mein hota hai. Toh slope unit level pe analyze karna geographically correct hai.

### Step 3 — Training Labels (Proxy-based):

```
Since we don't have actual landslide occurrence data:
    → Steepest 50% catchments = "High Risk" (class 1)  ← Proxy label
    → Flattest 50% catchments = "Low Risk" (class 0)   ← Proxy label
```

**Kyun?** Steep slopes statistically landslide-prone hote hai. Yeh perfect nahi hai but reasonable proxy hai jab actual landslide inventory nahi hai.

### Step 4 — Random Forest Classifier:

```
50 Decision Trees → Majority voting → Probability output (0 to 1)
80% catchments se train, 20% se test
Output: har pixel ko probability score milta hai
```

### Step 5 — 4 Risk Classes:

| Probability | Risk Class | Color |
|-------------|-----------|-------|
| < 0.25 | 🟢 Low Risk | Green |
| 0.25 – 0.50 | 🟡 Moderate Risk | Yellow |
| 0.50 – 0.65 | 🟠 High Risk | Orange |
| ≥ 0.65 | 🔴 Very High Risk | Red |

### Step 6 — 7 Map Layers Generated:

| Layer | Kya dikhata hai? |
|-------|-----------------|
| **Risk Class Map** | 4-color risk zones (with catchment polygon borders) |
| **Probability Heatmap** | Smooth gradient — green to red |
| **Slope Map** | Steep vs flat terrain visualization |
| **Elevation Map** | Height contours |
| **HAND Map** | Proximity to water bodies |
| **Precipitation Map** | Annual rainfall overlay |
| **Temperature Map** | MODIS Land Surface Temperature |

---

## ⚙️ ENGINE 2: Deep Learning U-Net (dl_landslide.py)

### Kya hai?
**Landslide4Sense** research paper ka U-Net model — jo satellite image ke har pixel ko "Landslide" ya "Safe" classify karta hai — **image segmentation** ke through.

### Step-by-step:

**Step 1 — 14-Band Composite Build:**
```
Sentinel-2 → 12 optical bands (B1-B12)
ALOS PALSAR → 1 Slope band + 1 DEM band
Total: 14 bands per pixel
```

**Step 2 — Download as 128×128 GeoTIFF:**
```
GEE se 128×128 pixel ka image download hota hai
Har pixel ke paas 14 values hai
```

**Step 3 — Feature Preprocessing (Landslide4Sense formula):**
```
14 bands → 6 channels extract:
  RED, GREEN, BLUE, NDVI, SLOPE, ELEVATION

Normalization formula:  1 - (Value / (Max / 2))
(Titti et al. research paper ka exact method)
```

**Step 4 — U-Net Forward Pass:**
```
Input:  (1, 128, 128, 6) → 6-channel image tensor
Model:  U-Net architecture (encoder-decoder with skip connections)
Output: (1, 128, 128, 2) → per-pixel probability [Safe, Landslide]
```

**What is U-Net?** 
- **Encoder** = image ko compress karta hai (important features extract)
- **Decoder** = wapas expand karta hai (pixel-level prediction)
- **Skip Connections** = encoder ki detail decoder ko directly bhejti hai (sharp boundaries)
- **Analogy:** Jaise summarize karo, phir summary se full answer likho — but original notes bhi saath rakhna (skip connections)

**Step 5 — Probability Heatmap + Dynamic Contrast Stretch:**
```
Raw probabilities → Stretched to 0.1–0.95 range (better visualization)
Custom Colormap: Green → Yellow → Orange → Red
Rendered as transparent PNG → Base64 encoded → Frontend pe map overlay
```

---

## 🔄 Continuous Improvement

### Active Learning (POST /api/landslide/train):
```
1. User dekhta hai model ne "Safe" bola but actually "Landslide zone" hai
2. User polygon draw + correct class (0 or 1) select karta hai
3. Backend: 14-band composite download → 128×128 patch extract
4. U-Net model on this ONE patch: 3 epochs fine-tune
5. Updated weights save → Next analysis reflects the learning
```

### Knowledge Distillation (POST /api/landslide/distill):
```
1. User area select + "Auto-Label" click
2. GEE Random Forest (Teacher) runs → binary risk mask generate karta hai
3. This mask = ground truth label for U-Net training
4. 14-band composite + mask download → U-Net (Student) trains 3 epochs
5. Result: U-Net locally adapted without any manual labeling! 🎯
```

---

### 🎯 Viva Mein Bolna Hai:

> *"Landslide module dual-engine architecture use karta hai. Engine 1 mein GEE Random Forest classifier hai jo 10 terrain variables (slope, elevation, NDVI, rainfall etc.) pe train hota hai — HydroSHEDS catchment basins ko slope units ke roop mein use karta hai. Engine 2 mein Landslide4Sense research ka U-Net deep learning model hai jo 14-band satellite imagery se pixel-level landslide segmentation karta hai. Dono engines Active Learning (user corrections) aur Knowledge Distillation (RF Teacher → U-Net Student) support karte hai for continuous improvement."*

<!-- slide -->
## 🏔️ Slide 2: Landslide Module — Workflow Diagram

![Landslide Susceptibility Module — Dual Engine Processing Pipeline](C:\Users\AkashK\.gemini\antigravity\brain\1872321f-0f1e-4985-bb15-5e442a46c321\landslide_workflow_diagram_1774969182846.png)

### 📋 Quick Reference — Key Technical Points

| Component | Engine 1: GEE Random Forest | Engine 2: Deep Learning U-Net |
|-----------|---------------------------|-------------------------------|
| **API** | `POST /api/landslide` (engine="gee") | `POST /api/landslide` (engine="deep_learning") |
| **Data Source** | NASA DEM, MERIT Hydro, Sentinel-2, CHIRPS | Sentinel-2 (12 bands) + ALOS DEM + Slope |
| **Resolution** | 90m sampling, 500m area calc | 128×128 pixel patches |
| **Model** | Random Forest (50 trees) | U-Net (Landslide4Sense) |
| **Training** | On-the-fly (GEE cloud) | Pre-trained + fine-tunable |
| **Slope Units** | HydroSHEDS Level-12 Catchments | Pixel-level segmentation |
| **Risk Classes** | 4 levels (Low → Very High) | Continuous probability heatmap |
| **Output** | 7 map tile layers + stats + importance | Base64 PNG overlay + stats |
| **Active Learning** | ❌ (runs fresh each time) | ✅ Fine-tunes on user corrections |
| **Distillation** | Acts as Teacher 🧑‍🏫 | Acts as Student 🎓 |

### 🔑 Key Terrain Variables & Their Role

| Variable | Landslide Relevance |
|----------|-------------------|
| **Slope** | #1 factor — steeper = more prone |
| **Elevation** | Higher altitude = more gravitational potential |
| **NDVI** | Low vegetation = weak root binding = loose soil |
| **Precipitation** | Heavy rain = soil saturation = trigger |
| **HAND** | Low HAND = near drainage = erosion risk |
| **TPI** | Valley floor vs ridge — position matters |
| **Aspect** | South-facing slopes dry faster (different moisture) |
| **Flow Accumulation** | Water concentration points |

````

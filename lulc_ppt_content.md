# 🌍 LULC Module — PPT Content (3 Slides)

---

## Slide 1 — LULC: Near Real-Time Land Cover Mapping (EXISTING — minor updates)

### What is LULC?
- Classifying every pixel of a satellite image into a **land cover type** (Water, Trees, Crops, Built Area, etc.)
- Our platform classifies land into **9 classes** at **10-meter resolution** using Sentinel-2 satellite imagery

### 9 Land Cover Classes

| # | Class Name          | Color Code |
|---|---------------------|------------|
| 0 | Water               | 🔵 Blue    |
| 1 | Trees               | 🟢 Dark Green |
| 2 | Grass               | 🟩 Light Green |
| 3 | Flooded Vegetation  | 🟣 Purple  |
| 4 | Crops               | 🟠 Orange  |
| 5 | Shrub & Scrub       | 🟡 Olive   |
| 6 | Built Area          | 🔴 Red     |
| 7 | Bare Ground         | ⚪ Grey    |
| 8 | Snow & Ice          | 🟣 Light Purple |

### Dual-Engine Architecture
Our LULC module has **two modes** the user can switch between:

1. **Google Dynamic World (GEE Engine)**
   - Uses Google's pre-trained Deep Learning model hosted on Google Earth Engine
   - Near real-time classification — no local training needed
   - Acts as the **baseline / teacher** model

2. **Custom 1D-CNN (Our Model)**
   - A locally trained 1D Convolutional Neural Network built from scratch
   - Trained on **~12,000+ pixel samples** collected via knowledge distillation
   - Designed using the **EuroSAT methodology** (spectral band classification)
   - **Test Accuracy: 82.11%**

---

## Slide 2 — LULC Workflow: Architecture, Training & Active Learning (EXISTING — no changes)

### Input Features (10-Band Pixel Vector)
Each pixel is described by **10 features** extracted from Sentinel-2:

| # | Feature | Type | Description |
|---|---------|------|-------------|
| 1 | B2 | Band | Blue |
| 2 | B3 | Band | Green |
| 3 | B4 | Band | Red |
| 4 | B8 | Band | NIR (Near Infrared) |
| 5 | B11 | Band | SWIR-1 (Short Wave Infrared) |
| 6 | B12 | Band | SWIR-2 |
| 7 | NDVI | Index | Vegetation Index = (NIR − Red) / (NIR + Red) |
| 8 | NDBI | Index | Built-up Index = (SWIR1 − NIR) / (SWIR1 + NIR) |
| 9 | MNDWI | Index | Water Index = (Green − SWIR1) / (Green + SWIR1) |
| 10 | NDSLI | Index | Soil/Land Index = (SWIR1 − Red) / (SWIR1 + Red) |

### 1D-CNN Model Architecture

```
Input Shape: (10, 1)  — 10 features, 1 channel
        ↓
Conv1D (32 filters, kernel=2, ReLU)
        ↓
MaxPooling1D (pool=2)
        ↓
Conv1D (64 filters, kernel=2, ReLU)
        ↓
MaxPooling1D (pool=2)
        ↓
Flatten
        ↓
Dense (128 neurons, ReLU)
        ↓
Dropout (0.3)
        ↓
Dense (64 neurons, ReLU)
        ↓
Dense (9 neurons, Softmax)  → Output: One of 9 classes
```

### Training Details

| Parameter | Value |
|-----------|-------|
| Framework | TensorFlow / Keras |
| Architecture | 1D-CNN (inspired by EuroSAT) |
| Input | 10-band Sentinel-2 pixel vector |
| Output | 9-class land cover label |
| Training Samples | ~12,000 pixels |
| Train/Test Split | 80% / 20% |
| Epochs | 50 |
| Batch Size | 32 |
| Optimizer | Adam |
| Loss Function | Categorical Cross-Entropy |
| **Final Test Accuracy** | **82.11%** |

### Active Learning Loop (Human-in-the-Loop)
The model **continuously improves** through a feedback loop:

```
User draws polygon on map
        ↓
Selects correct land cover class
        ↓
Backend extracts 10-band features from GEE
        ↓
New labeled sample appended to CSV dataset
        ↓
Model automatically re-trains on expanded dataset
        ↓
Updated model used for next prediction
```

### Knowledge Distillation (Auto-Labeling)
- The **Dynamic World (teacher)** model provides high-confidence labels
- These labels are paired with **Sentinel-2 spectral features** and stored locally
- The **Custom 1D-CNN (student)** is trained on this distilled data
- This allows **scaling the dataset without manual labeling**

---

## Slide 3 — ★ NEW ★ LULC: Analytical Outputs & Multi-Year Analysis

### Title: LULC — Analytical Report, Map Layers & Temporal Analysis

---

### Left Column — "Output Capabilities"

**8 Interactive Map Layers Generated:**

| # | Layer | What It Shows |
|---|-------|---------------|
| 1 | **LULC Classification** | 9-class land cover map (Dynamic World palette) |
| 2 | **RGB Composite** | True-color Sentinel-2 satellite view |
| 3 | **NDVI Heatmap** | Vegetation health — Green = healthy, Red = barren |
| 4 | **NDBI Heatmap** | Built-up density — Red = urban, Green = natural |
| 5 | **MNDWI Heatmap** | Water presence — Blue = water, Brown = dry |
| 6 | **Built Area Probability** | Per-pixel probability of being "Built Area" |
| 7 | **Trees Probability** | Per-pixel probability of being "Trees" |
| 8 | **Crops Probability** | Per-pixel probability of being "Crops" |

> User can switch between any layer on the interactive map

**Seasonal Composites (5 modes):**

| Season | Months | Use Case |
|--------|--------|----------|
| Annual | Jan-Dec | Full year overview |
| Kharif | Jul-Oct | Monsoon / paddy season |
| Rabi | Nov-Mar | Winter crop season |
| Dry | Oct-Dec | Post-monsoon |
| Wet | Jun-Sep | Peak monsoon |

> Why seasons matter: Same area shows "Crops" in Kharif but "Bare Ground" in summer.

---

### Right Column — "Analytical Report & Multi-Year Comparison"

**Glassmorphism Analytical Report:**
- **Interactive SVG Donut Chart** — class distribution with hover tooltips
- **Animated Bar Chart** — area distribution per class (in km²)
- **Summary Statistics** — total area, dominant class, year, resolution, images used
- **DW Color Legend** — all 9 classes with official colors
- **One-Click PDF Export** — high-fidelity A4 report with unique tracking ID

**Multi-Year Temporal Comparison:**
- User selects **2-4 years** (2017 to 2025) for comparison
- System runs separate LULC analysis for each year
- **Multi-Year Bar Chart** — side-by-side area comparison per class
- **Change Detection Cards** — shows % increase / decrease per class

> Example: "Trees ↓ -12.3%", "Built Area ↑ +8.7%" over 5 years → quantified urbanization

**PDF Report Features:**
- **Technology:** html-to-image + jsPDF (browser-native rendering)
- **Unique Report ID:** EW-LULC-{timestamp}-{random} for tracking
- **Format:** A4 portrait, glassmorphism dark design, multi-page support

---

### Bottom Strip

**Salt Pan Fix:** Dynamic World misclassifies bright salt pans (Rann of Kutch) as "Snow & Ice" — our system remaps Class 8 → Class 7 (Bare Ground) for accurate Indian landscape mapping.

---

## Key Talking Points for Viva / Q&A

> **Q: Why 1D-CNN and not 2D-CNN for LULC?**
> A: Because we classify each pixel independently based on its **spectral signature** (10 bands), not based on spatial neighborhood. 1D-CNN treats the 10 features as a 1-dimensional sequence — this is the standard EuroSAT approach for pixel-wise classification.

> **Q: Why not just use Dynamic World directly?**
> A: Dynamic World is Google's global model — it's good but not region-specific. Our custom 1D-CNN can be fine-tuned for specific Indian landscapes (salt pans, Gujarat, Western Ghats, etc.) using active learning. Example: Dynamic World misclassifies salt pans as Snow — our model can learn the correction.

> **Q: What is the accuracy?**
> A: The final **Test Accuracy is 82.11%** (evaluated on 20% held-out test set after training on ~12,000 pixel samples).

> **Q: How does the Multi-Year comparison work?**
> A: User selects 2-4 years, system calls the LULC API for each year independently, collects class-wise area (km²), and computes percentage change between first and last year for each class. This quantifies land cover change (urbanization, deforestation etc.) over time.

> **Q: Why 8 map layers?**
> A: 5 standard layers (LULC, RGB, NDVI, NDBI, MNDWI) for classification + analysis. Plus 3 probability heatmaps (Built, Trees, Crops) that show the **model's confidence** — not just the final classification. This helps identify areas where the model is uncertain.

> **Q: What is the PDF report for?**
> A: For stakeholders and decision-makers. Field officers and district authorities need a downloadable report they can print, not a web dashboard. Each report has a unique ID for traceability.

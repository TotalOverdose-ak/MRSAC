# 🌍 LULC Module — PPT Content (1–2 Slides)

---

## Slide 1 — LULC: Land Use Land Cover Classification

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

## Slide 2 — Custom 1D-CNN: Architecture, Training & Active Learning

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

### What Each Band/Index Means (PPT-Ready Explanation)

**6 Raw Spectral Bands** — what the satellite sensor captures at different wavelengths:

| Band | What It Captures |
|------|-----------------|
| **B2 (Blue)** | Reflects strongly from water — helps detect water bodies |
| **B3 (Green)** | Healthy vegetation reflects green light — helps separate green areas |
| **B4 (Red)** | Plants absorb red light for photosynthesis — low red = healthy vegetation |
| **B8 (NIR)** | Invisible to human eyes. Healthy plants strongly reflect NIR — most important band for vegetation mapping |
| **B11 (SWIR-1)** | Sensitive to soil moisture and vegetation water content |
| **B12 (SWIR-2)** | Detects dry vs wet surfaces and burned areas |

**4 Computed Indices** — mathematical ratios calculated from the raw bands to highlight specific land types:

| Index | Formula | What It Detects |
|-------|---------|-----------------|
| **NDVI** | (NIR − Red) / (NIR + Red) | Vegetation density & health. High = dense green, Low = bare/urban |
| **NDBI** | (SWIR − NIR) / (SWIR + NIR) | Built-up / urban areas. Concrete & buildings reflect more SWIR than NIR |
| **MNDWI** | (Green − SWIR) / (Green + SWIR) | Water bodies. Water reflects green but absorbs SWIR |
| **NDSLI** | (SWIR − Red) / (SWIR + Red) | Bare soil vs vegetated land |

> **Why these 10?** — 6 raw bands capture what the satellite "sees" at different wavelengths (visible + infrared). 4 indices are mathematical combinations that **amplify the contrast** between specific land types (vegetation, water, buildings, soil). Together, they give the 1D-CNN model enough information to distinguish all 9 land cover classes.

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

## Key Talking Points for Viva / Q&A

> **Q: Why 1D-CNN and not 2D-CNN for LULC?**
> A: Because we classify each pixel independently based on its **spectral signature** (10 bands), not based on spatial neighborhood. 1D-CNN treats the 10 features as a 1-dimensional sequence — this is the standard EuroSAT approach for pixel-wise classification.

> **Q: Why not just use Dynamic World directly?**
> A: Dynamic World is Google's global model — it's good but not region-specific. Our custom 1D-CNN can be fine-tuned for specific Indian landscapes (salt pans, Gujarat, Western Ghats, etc.) using active learning. Example: Dynamic World misclassifies salt pans as Snow — our model can learn the correction.

> **Q: What is the accuracy?**
> A: The final **Test Accuracy is 82.11%** (evaluated on 20% held-out test set after training on ~12,000 pixel samples).

> **Q: How does Active Learning work?**
> A: The user draws a polygon on the map, selects the correct class, and the system extracts the spectral features, adds them to the training CSV, and re-trains the model automatically. This is **Human-in-the-Loop (HITL)** learning.

> **Q: What is Knowledge Distillation here?**
> A: We use Dynamic World as a "teacher" to auto-label pixels. The 1D-CNN "student" is trained on these teacher-given labels + real satellite data. This scales the dataset without manual effort.

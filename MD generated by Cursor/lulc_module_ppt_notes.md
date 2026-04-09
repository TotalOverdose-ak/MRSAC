# Earth Watch: LULC Module (Deep Dive)
*(Presentation Notes for Land Use Land Cover)*

The **LULC (Land Use Land Cover)** module is incredibly powerful because it features a dual-engine architecture: it uses Google's massive global model for fast analysis, and a custom built 1D-CNN model that features "Active Learning". 

Here is exactly how everything works under the hood so you can explain it flawlessly!

---

## 1. The Dual-Engine Architecture
When a user draws a polygon and selects LULC, they choose between two engines:

### Engine A: Google Dynamic World (The Default)
*   **What it is:** Google built an incredible deep learning dataset called **Dynamic World (V1)**. It classifies every 10-meter pixel on Earth into 9 distinct land cover classes (Water, Trees, Grass, Flooded Vegetation, Crops, Shrub, Built Area, Bare Ground, Snow & Ice).
*   **The Backend Logic:** 
    1.  The backend ([lulc.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/showcase_lulc.py)) asks Earth Engine to fetch Sentinel-2 imagery and Dynamic World data over the user's polygon.
    2.  It strictly filters for images with `< 20% Cloud Cover` (`CLOUD_THRESH = 20`).
    3.  It calculates the "Mode" (the most frequent class assignment over the year) to ensure extreme accuracy.
*   **The Bug Fix (Crucial talking point!):** Google's AI often mistakenly classifies massive bright salt flats as "Snow & Ice" because they look identical from space. Our backend explicitly features a remapping code block: `dw_label.remap([8], [7])` to fix this bug and accurately map salt pans as "Bare Ground".

### Engine B: The Custom 1D-CNN (Our Proprietary AI)
*   **What it is:** A custom-trained 1-Dimensional Convolutional Neural Network built with TensorFlow/Keras.
*   **Input Features (The "X" variables):** We feed the AI 10 specific data points per pixel:
    *   **6 Optical Bands:** Blue, Green, Red, Near-Infrared, SWIR1, and SWIR2.
    *   **4 Spectral Indices:** NDVI (Vegetation), NDBI (Built-up), MNDWI (Water), NDSLI.
*   **Parameters:** The 1D-CNN features 32 and 64-filter convolutional layers with extremely fast MaxPooling and Dropout (0.3) to prevent overfitting. It trains over 50 epochs with a batch size of 32. 

---

## 2. Advanced Feature: Active Learning (HITL)
If your judges ask what makes your project unique, talk about **Human-in-the-Loop (HITL)** Active Learning.

*   **The Concept:** Standard AI models are static (they never learn after they are trained). Our system evolves dynamically.
*   **How it works:** A user can draw a polygon on the map, look at it, and tell the system: *"This is a Crop field."*
*   **The Backend Reaction (`/api/lulc/train`):** The FastAPI backend instantly grabs the 10 Sentinel-2 features for that exact spot, appends it to our local training database ([lulc_samples.csv](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/lulc_samples.csv)), and immediately triggers a background neural network re-training session. The AI instantly gets smarter.

---

## 3. Advanced Feature: Auto-Distillation (Knowledge Transfer)
*   **The Concept:** Teaching a small, fast AI by having it copy a massive, slow AI.
*   **How it works (`/api/lulc/distill`):** 
    1.  A user selects an area.
    2.  The backend randomly selects exactly **250 pixels** inside that area.
    3.  For every pixel, it grabs the label from Google Dynamic World (the "Teacher") and the spectral satellite features (the "Textbook").
    4.  It dumps these 250 data points into our training CSV and fine-tunes our custom 1D-CNN (the "Student").
*   **Why this is amazing:** This allows the platform to automatically bootstrap a powerful local AI model anywhere in the world without human labeling effort!

---

## 4. The Visual Return (WebGL & Base64)
*   **Dynamic World Output:** Generates map tiles seamlessly using Earth Engine and maps the 9 classes to distinct Hex colors (Water is `#419BDF`, Trees are `#397D49`).
*   **Custom CNN Output:** The backend takes the 512x512 matrix of numerical classes outputted by our AI, converts them into a beautiful transparent image using Matplotlib, encodes it into a single **Base64** string, and sends it to the Next.js frontend to instantly overlay perfectly over the map boundaries. 

*Use this flow to explain that the LULC platform isn't just an API caller—it is a self-learning, distilling AI architecture.*

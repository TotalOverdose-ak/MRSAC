# Earth Watch: Forest Fire Module (A-Z Deep Dive)
*(Presentation Notes for Burn Severity Mapping)*

If you are asked how the Forest Fire module works, you need to explain that it does not use a Neural Network. A neural network would be overkill and inaccurate here. Instead, it uses **pure Remote Sensing Mathematics and Geospatial Physics.**

Here is the A-to-Z breakdown of exactly how [forest_fire.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/backend/services/analysis/forest_fire.py) calculates precisely how many hectares of forest burned.

---

## 1. The Inputs & Image Fetching
To measure a fire, you need to know what the forest looked like *before* it burned.
1.  **The Parameters:** The user draws an Area of Interest (AOI) and inputs two date ranges: a `Pre-Fire` date range and a `Post-Fire` date range.
2.  **Sentinel-2 Harmonized Data:** The backend connects to Google Earth Engine and downloads all Sentinel-2 satellite images over the area for both time ranges. 
3.  **The Median Composite:** It filters out images with >20% cloud cover and mathematically stacks all the remaining images together, taking the `median` value of every pixel. This creates one, perfectly clear "Pre-Fire" master image and one "Post-Fire" master image.

---

## 2. Advanced Pre-Processing (Cloud & Water Masking)
Before doing any math, the backend cleans the data to prevent critical scientific errors.
1.  **QA60 Cloud Masking:** Clouds are bright white and can interfere with the math. The backend targets the Sentinel-2 `QA60` band, using **Bitwise Operations** (Bit 10 for thick clouds, Bit 11 for cirrus clouds) to literally cut the clouds out of the image entirely.
2.  **Dynamic World Water Masking:** If a lake dries up in the summer between the Pre-Fire and Post-Fire dates, the resulting dry dirt looks mathematically identical to an ash scar. The backend actively asks the Google Dynamic World AI for the location of permanent water bodies and cleanly masks them out of the equation so they don't corrupt the fire data.

---

## 3. The Core Mathematics (NBR & dNBR)
This is the scientific heart of the module.

*   **The Physics:** Healthy green trees strongly reflect Near-Infrared (NIR) light, but absorb Shortwave Infrared (SWIR) light. But when a forest burns down to black ash, the physics invert—the ash absorbs NIR and strongly reflects SWIR light.
*   **Step 1: Calculate NBR (Normalized Burn Ratio)**
    *   The backend calculates the NBR for *both* the Pre-fire and Post-fire images separately.
    *   Formula: [(Band 8 [NIR] - Band 12 [SWIR2]) / (Band 8 [NIR] + Band 12 [SWIR2])](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py#392-530)
*   **Step 2: Calculate dNBR (delta NBR)**
    *   To find exactly what changed, the backend subtracts the two images from each other.
    *   Formula: `dNBR = Pre_NBR - Post_NBR`
    *   The resulting image is a massive matrix of decimals. A high positive decimal means the area suffered catastrophic burning.

---

## 4. The Output: USGS Classification & Maps
The backend doesn't just show colors; it classifies the mathematical damage according to strict **USGS (United States Geological Survey) Standards**.

*   **The Thresholds:**
    1.  `-0.50 to  0.10`: Unburned / Regrowth (Colored Green `#1a9850`)
    2.  ` 0.10 to  0.27`: Low Severity Burn (Colored Yellow `#fee08b`)
    3.  ` 0.27 to  0.66`: Moderate Severity (Colored Orange `#fc8d59`)
    4.  ` 0.66 to  1.30`: High Catastrophic Severity (Colored Red `#d73027`)

*   **Area Calculation:** The backend uses `ee.Image.pixelArea()` to calculate the exact square area of every single pixel in the damaged zones, perfectly converting pixel counts into **Hectares (ha) Burned**.

*   **The 4 Map Generations:** Finally, instead of returning just one image, the Earth Engine backend generates 4 entirely separate global map layers and sends their tile URLs straight to the Next.js frontend:
    1. `Pre-Fire True Color Map` (To see the green forest)
    2. `Post-Fire True Color Map` (To see the black scars)
    3. `dNBR Severity Heatmap` (The colorful USGS gradient)
    4. `Solid Burned Mask` (A pure, solid red overlay of the burned zone)

*Use this to explain that your platform doesn't just guess; it relies on established physics, multi-spectral band math, and USGS standards to generate enterprise-grade burn reports.*

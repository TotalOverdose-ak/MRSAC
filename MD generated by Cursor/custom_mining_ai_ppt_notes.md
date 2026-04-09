# Earth Watch: The Deep Learning Mining Model (A to Z)
*(The Architecture of the Illegal Mine Detection PyTorch Model)*

If your audience asks, *"Exactly what kind of Neural Network did you build to detect these mines from space?"* you will blow them away with this explanation. We did not use a basic "out-of-the-box" AI. We designed a highly advanced **Dual-Head ResNet34 + U-Net Semantic Segmentation Model** using PyTorch.

Here is the A-to-Z breakdown of everything happening inside [mine_detection.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py) and the `best_model.pt` weights.

---

## A. The Inputs (What the AI "Sees")
Before the AI does anything, we feed it data. Standard AI (like FaceID) uses 3 channels of light (Red, Green, Blue). **Our Mining AI uses 11 Channels of Light.**

*   **The 11 Sentinel-2 Bands:** We feed the AI a massive raw tensor containing bands `B2, B3, B4` (Visible Light), `B5, B6, B7, B8, B8A` (Near-Infrared / Vegetation Red Edge), `B9` (Water Vapor), and `B11, B12` (Shortwave Infrared).
*   **Why 11 bands?** Illegal mines often strip away vegetation and expose highly specific deep-soil minerals that cannot be seen with human eyes, but glow brightly in the Shortwave Infrared spectrum.
*   **The Tensor Shape:** [(Batch, 11, 512, 512)](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py#395-396) -> The AI processes 11 layers of 512x512 pixel satellite grids simultaneously.

---

## B. The Architecture (Dual-Head U-Net)
Our architecture is split into three core parts: An **Encoder** (to understand *what* a mine looks like), and **Two "Heads"** (to make the final decisions).

### 1. The Encoder (ResNet34)
We swapped the standard, weak U-Net encoder out and replaced it with **ResNet34** (Residual Networks).
*   **The Why:** As satellite images get compressed deep into a neural network, the AI often "forgets" tiny details (like narrow dirt tracks leading to a mine). ResNet uses *Skip Connections*, a mathematical shortcut that instantly bypasses layers to pass the original high-resolution image details straight into the deepest parts of the brain.
*   **The Output of the Encoder:** It compresses the 512x512 image down into a tiny, dense, 512-channel geometric mathematical map representing the "Concept" of a mine.

### 2. The Decoder & Attention (scSE)
As the network expands back out to 512x512 to draw the mask, we attached an extremely advanced Attention Mechanism called **`scSE` (Spatial and Channel Squeeze & Excitation)**.
*   **The Why:** Normal networks treat every pixel equally. `scSE` forces the AI to dynamically "pay attention" only to the specific pixels and light frequencies that look suspicious, while completely ignoring boring things like empty oceans or thick clouds.

---

## C. The Dual-Head Execution (The Brilliant Optimization)
Most models only have one Head. We built two independent mathematical heads to make the platform blazing fast.

### Head 1: The Classification Head (The "Fast Guesser")
Instead of doing heavy math on all 262,000 pixels at once, we tap into the deepest, smallest part of the ResNet34 Encoder (`f[-1]`).
*   **The Logic:**
    1.  `AdaptiveAvgPool2d(1)` compresses the image into a single 1x1 dot.
    2.  `Flatten()` straightens it into a 1D line.
    3.  `Dense (256)` -> `GELU` -> `Dropout (0.3)`
    4.  `Dense (64)` -> `GELU` -> `Dropout (0.2)`
    5.  `Dense (1)`
*   **The Result:** It instantly outputs a single number: **The Mine Probability Score** (e.g., 99%). If this fast guesser says "There is a 0% chance a mine is here", the system instantly skips the heavy math and moves to the next map tile, saving millions of calculations! We use **GELU** (Gaussian Error Linear Unit) activations here because they are mathematically smoother and faster than standard ReLU.

### Head 2: The Segmentation Head (The "Sniper")
If Head 1 says, *"Yes, there is a mine!"* (Probability > 50%), then Head 2 activates.
*   **The Logic:** It uses the `scSE` decoder to look at the image pixel by pixel.
*   **The Result:** It outputs a complete 512x512 matrix. We pass this matrix through a **Sigmoid** activation function, which forces every single pixel to choose a value between 0 (Not a Mine) and 1 (Mine). 
*   **The Cutoff (`SEG_THRESHOLD = 0.50`):** Any pixel scoring higher than 0.50 is painted bright red.

---

## D. The Final Post-Processing
AI architectures only spit out matrices of 1s and 0s. The user can't read that.

*   **Rasterio & Shapely Geometry:** Our Python backend takes that pixel matrix and runs an algorithm to physically trace the edge of the 1s, mathematically converting the raw pixels into a perfect, smooth 2D Vector Polygon (GeoJSON). 
*   These exact spatial coordinates are then fired into our PostGIS database to check if the mine crosses any legal boundaries (Intersection over Union).

*Use this script to demonstrate that you didn't just use a drag-and-drop AI tool; you specifically engineered the PyTorch Neural Network architecture to handle the sheer scale and complexity of geospatial satellite data!*

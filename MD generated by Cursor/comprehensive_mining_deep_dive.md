# Earth Watch: Comprehensive Mining Module Deep Dive
*(The Ultimate Presentation Guide)*

If you need to explain the **Illegal Mining Detection Module** from start to finish, including the exact backend parameters that control the AI, use this unified master guide. This traces the journey of a single user request through the entire system.

---

## Stage 1: The Trigger (Frontend & API)
**The Action:** The user, interacting with the Next.js `react-map-gl` interface, draws a GeoJSON polygon around a suspected mining area and clicks "Detect".
**The Backend:** The Next.js app sends this polygon to the FastAPI Python backend at `POST /api/detect` via Axios.

---

## Stage 2: Data Acquisition (Google Earth Engine)
**The Goal:** Get high-quality satellite imagery of the requested area.
**The Logic:** You cannot feed an entire state into an AI model at once. Our backend ([mine_detection.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py)) chops the user's large polygon into a mathematical grid.

*   **`TILE_KM = 5.0`**: The backend grid consists of exactly **5x5 kilometer** squares. This gives the AI the perfect amount of geographical context.
*   **The GEE Call:** The backend asks Google Earth Engine (GEE) for Sentinel-2 Harmonized imagery. But what if it's raining or cloudy that day?
*   **`CLOUD_THRESH = 20`**: GEE is told to immediately reject any satellite pass that has more than 20% cloud cover.
*   **`COMP_MONTHS = 6`**: To guarantee a perfect image, GEE looks back chronologically over the last **6 months**. It selects only the absolute clearest, cloud-free pixels and stitches them together into one flawless "median composite" image.
*   **`SCALE = 10`**: The backend requests the final image at exactly **10 meters per pixel** optical resolution. 

---

## Stage 3: The Brain (AI Inference & PyTorch)
**The Goal:** Find the mines inside those images.
**The Logic:** The imagery tiles are downloaded to a local cache folder and processed.

*   **`TARGET_SIZE = 512`**: Before the AI touches the image, the backend mathematically forces the tile into a **512x512 pixel** tensor. Our neural network was strictly programmed for these dimensions.
*   **The AI Model (`ResNet34 + U-Net`):** The image is fed into our custom Dual-Head PyTorch model.
    1.  **The Classifier Head:** Looks at the image and guesses the probability that a mine exists.
    2.  **The Segmentation Head:** Uses the U-Net architecture to draw a pixel-perfect mask outlining the physical dirt tracks of the mine.
*   **`MINE_THRESHOLD = 0.50`**: The system requires the AI to be at least **50% confident** that the pixels represent a mine before it triggers an alert. We use 0.50 to perfectly balance catching hidden mines vs catching false positives (like bare mountains).

---

## Stage 4: Vectorization & Duplicates
**The Goal:** Turn blocky pixels into a smooth map shape.
**The Logic:** The AI outputs raw pixel masks. We use the `rasterio` and `shapely` python libraries to convert these pixels into geometric vectors (smooth polygons).

*   **`IOU_MERGE_THRESH = 0.15`**: Because we chopped the map into 5km tiles, a giant mine might be cut in half across two tiles. If the AI detects two polygons that overlap by at least **15%**, the backend intelligently merges them into one single massive, continuous shape.

---

## Stage 5: Legality Checking (PostGIS Database)
**The Goal:** Determine if the detected mine is illegal or operated by a registered corporation.
**The Logic:** We use Supabase running **PostgreSQL** with the **PostGIS** spatial extension. We loaded a massive global database (Maus et al.) containing the geometric boundaries of every legal mine on earth into our `legal_mines` table.

*   **`CENTROID_SEARCH_KM = 5.0`**: The database draws a massive 5km circle around our newly detected mine to see if any legal polygons are nearby. If yes, it runs the heavily mathematical "Intersection over Union" (IoU) spatial check.
*   **`IOU_LEGAL_THRESH = 0.30`**: If our detected mine shape overlaps the legal boundary by at least **30%**, the AI flags it as **LEGAL**. (We permit a 70% flexibility because legal mines naturally expand their digging areas over years).
*   **`IOU_SUSPECT_THRESH = 0.10`**: If the overlap is only between **10% and 30%**, the system flags it as **SUSPECT**. This detects when a legal mining corporation is illegally destroying the environment outside of their permitted zone.
*   **The Verdict:** If the overlap is **0% to 9%**, the system confidently flags it as **ILLEGAL**.

---

## Stage 6: The Return
**The Goal:** Show the results beautifully to the user.
**The Logic:** Once the PostGIS check is complete, the backend calculates the Square Kilometers (`area_km2`) of the destruction. It generates tiny thumbnail preview images (Base64) wrapping the illegal spot in a red box. All of this JSON data is sent back to the Next.js frontend, where the 2D map immediately zooms in and paints the final red/green risk shapes directly onto the user's screen!

# Earth Watch: The Illegal Mining Module (Deep Dive)

If your presentation focuses heavily on the **Illegal Mine Detection Module**, here is the exact step-by-step workflow of how the system operates from the moment the user clicks "Scan".

---

## The 6-Step Technical Pipeline 

### Step 1: User Input (The Frontend Trigger)
*   **What happens:** The user navigates to the Earth Watch map dashboard. They use the Mapbox drawing tools to highlight an Area of Interest (AOI) anywhere on the globe and click "Detect Mines".
*   **Data Sent:** The Next.js frontend sends a precise mathematical [GeoJSON](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/backend/routers/detect.py#29-31) polygon containing the coordinates to our FastAPI backend.

### Step 2: Data Acquisition (Google Earth Engine)
*   **What happens:** The backend script ([mine_detection.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py)) receives the coordinates and calculates a mathematical grid over the area, breaking it down into 5x5 kilometer "tiles".
*   **The Satellite Call:** The system talks to Google Earth Engine and asks for **Sentinel-2 Harmonized Satellite Imagery**. It specifically requests a cloud-free median composite from the last few months to ensure the image isn't blocked by weather.
*   **The Output:** Earth Engine sends back raw GeoTIFF image tiles, which the backend aggressively caches and resizes to 512x512 pixels so the AI can process them.

### Step 3: Deep Learning Inference (The AI Brain)
*   **What happens:** The resized tiles are instantly fed into our custom-trained **Dual-Head ResNet34 + U-Net** PyTorch model.
*   **The Dual-Head Approach:**
    1.  **Classification Head:** Looks at the tile and guesses an overall probability (e.g., "There is a 96% chance a mine exists in this image").
    2.  **Segmentation Head:** Goes pixel-by-pixel to draw an exact mask around the shape of the mine.

### Step 4: Vectorization & Deduplication (Smoothing the Data)
*   **What happens:** AI outputs are just pixel blocks. We use libraries like `rasterio` and `shapely` to convert these pixel masks into real, smooth geometric polygons (Vector geometry).
*   **Deduplication:** Because tiles overlap, the AI might detect the same giant mine twice on the edge of two tiles. Our system intelligently merges overlapping shapes using intersection algorithms to give one clean, massive polygon.

### Step 5: Legality Classification (The PostGIS Check)
*   **What happens:** We have a massive Supabase SQL database loaded with the boundaries of every known, legal mine on the planet (from the Maus et al. Global Mining Polygons dataset).
*   **The Check:** The backend executes a complex spatial database query (using PostGIS). It asks the database: *"Does this newly detected shape intersect with any legal shape in our records?"*
*   **The Logic:** It calculates the IoU (Intersection over Union). 
    *   **LEGAL:** The detected mine perfectly overlaps a known legal mine.
    *   **SUSPECT:** The mine overlaps the boundary by a tiny percentage (meaning a legal mine is illegally expanding its territory).
    *   **ILLEGAL:** The detected mine is located in the middle of nowhere and has 0% overlap with any legal database.

### Step 6: Visual Return (The Output)
*   **What happens:** The backend packages the results. It generates tiny thumbnail images (Base64) of only the illegal spots and sends all the coordinates back to the frontend.
*   **The Result:** The user's screen instantly updates. The map zooms in, drawing a bright red polygon over the illegal mine and displaying the exact area size (in square kilometers) alongside a high-resolution snapshot!

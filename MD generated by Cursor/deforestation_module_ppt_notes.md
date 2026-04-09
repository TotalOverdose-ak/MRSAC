# Earth Watch: Deforestation Module (A-Z Deep Dive)
*(Presentation Notes for Global Forest Loss Tracking)*

Your Deforestation module is incredibly powerful because it operates purely on the absolute global standard for forestry data. If anyone asks how you verified deforestation without AI, tell them you directly integrated **The Hansen Global Forest Change Dataset (University of Maryland)**.

Here is exactly how the module mathematically calculates the damage ([deforestation.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/backend/routers/deforestation.py)):

---

## 1. The Core Dataset Integration
You intentionally did not use a custom AI for this because tracking 20 years of planetary trees requires globally verified historical truth.
*   **The Integration:** The Python backend connects to Google Earth Engine and taps directly into `UMD/hansen/global_forest_change_2024_v1_12`. 
*   This is a 30-meter resolution global map that tracked the life and death of every tree on Earth from the year 2000 up to 2024.

---

## 2. Setting the Baseline (The `min_canopy` Rule)
Before the system calculates what was cut down, it first has to mathematically define what a "Forest" actually is.
*   **The Rule:** A user passes a `min_canopy` parameter (Default: 20%). 
*   **The Math:** The backend filters the `treecover2000` data band of the Hansen dataset. It tells Earth Engine: *"If a pixel did not have at least 20% dense tree canopy cover in the year 2000, ignore it."* 
*   **Why?** This prevents the system from accidentally counting the removal of a singular isolated bush in a desert as a "Deforestation Event". It strictly tracks dense baseline forests.

---

## 3. The Mathematics of Loss (Deforestation Calculation)
When a user wants to track illegal logging or deforestation between a specific time (e.g., 2010 to 2020), the backend runs a precise 3-step Intersection algorithm.

1.  **The Timeframe Filter:** It looks at the dataset's `lossyear` band (which labels the exact year a tree died, from 1-23). It mathematically aligns the user's start/end dates to these bands.
2.  **The Event Filter:** It ensures the `loss` band explicitly equals `1` (Confirmed complete canopy destruction).
3.  **The Final Intersection Mask:** A pixel is ultimately painted red by your backend ONLY IF all three are True: [(Was it a dense forest in 2000?) AND (Was it destroyed in the user's timeframe?) AND (Is the destruction confirmed?)](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py#395-396)

---

## 4. Hectares & Rendering (The Output)
Just counting pixels isn't very scientific. The backend translates the raw matrix data into physical measurements.

*   **Geospatial Sizing:** The Earth Engine backend runs `ee.Image.pixelArea().divide(10000)`. Because the earth is curved, pixel sizes stretch near the poles. This formula dynamically calculates the absolute physical square meters of the missing trees and converts the destruction into **Hectares (ha)**. 
*   **The Returns:** It calculates the Base Forest (ha), the Destroyed Forest (ha), and the precise Percentage rate of destruction. 

**The Map Render:**
Instead of returning a static JPEG picture, the Earth Engine servers color the remaining forest Dark Green (`#2d6a2d`) and the destroyed forest Bright Red (`#FF2222`), turning the matrix into perfectly transparent XYZ Map Tiles. It streams these live tiles directly onto your 3D Next.js Mapbox globe for seamless, stutter-free visualization!

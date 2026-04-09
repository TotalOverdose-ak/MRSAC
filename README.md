# Earth Watch — Illegal Mine Detection System

AI-powered geospatial system for detecting illegal mines using Sentinel-2 satellite imagery, a ResNet34+UNet dual-head model, and PostGIS legal classification.

---

## Project Structure

```
Earth_watch/
├── api.py                          ← FastAPI entry point
├── requirements.txt
├── .env                            ← Your secrets (gitignored)
├── .env.example                    ← Template to copy
│
├── backend/
│   ├── config.py                   ← All settings (reads .env)
│   ├── controllers/                ← MVC API Controllers (detect, verify, lulc, building, etc.)
│   ├── ml_models/                  ← Machine learning weights (*.h5, *.npy, *.pt)
│   ├── services/
│   │   └── analysis/               ← Core AI inference and GEE logic
│   └── utils/                      ← Database and formatting utilities
│
├── data/                           ← Global Geopackages and sample CSV/GeoJSONs
│   └── training_data/              ← Offline GEE tile buffers for ML training
│
├── frontend/                       ← Next.js dynamic dashboard
│
├── ml_training/                    ← Standalone AI training scripts
│
└── scripts/                        ← Developer testing scripts & scratchpads
```

---

## Setup

### 1. Clone and enter directory
```bash
cd Earth_watch
```

### 2. Create virtual environment (recommended)
```bash
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows
```

### 3. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Now open `.env` and fill in the following keys:

| Variable | Description |
|----------|-------------|
| `PGDATABASE` | Your Supabase database name |
| `PGUSER` | Supabase pooler username |
| `PGPASSWORD` | Supabase database password |
| `PGHOST` | Supabase pooler host |
| `PGPORT` | Supabase pooler port (default: `6543`) |
| `DB_DIRECT_USER` | Supabase direct connection user |
| `DB_DIRECT_PASSWORD` | Supabase direct connection password |
| `DB_DIRECT_HOST` | Supabase direct connection host |
| `DB_DIRECT_PORT` | Supabase direct connection port (default: `5432`) |
| `GEE_PROJECT` | Your Google Earth Engine project ID (see below) |
| `MODEL_PATH` | Path to your `.pt` model weights file |

---

### 5. Get a Google Earth Engine Project ID (Non-Commercial Access)

Google Earth Engine is free for non-commercial and research use. Follow these steps to register and get your project ID:

**Step 1 — Sign up for GEE access**
1. Go to [https://earthengine.google.com](https://earthengine.google.com) and click **Sign Up**.
2. Sign in with a Google account.
3. Fill in the registration form. Under **Use Case**, select **Research / Non-Commercial**.
4. Submit and wait for approval — this usually takes a few minutes to a few hours.

**Step 2 — Create a Cloud Project for GEE**
1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Click **Select a project** → **New Project**.
3. Give your project a name (e.g., `earth-watch-gee`) and click **Create**.
4. Once created, note the **Project ID** shown under the project name (e.g., `earth-watch-gee-123456`). This is your `GEE_PROJECT` value.
5. In the Cloud Console, go to **APIs & Services → Library**, search for **Earth Engine API**, and click **Enable**.

**Step 3 — Register your project with Earth Engine**
1. Go to [https://code.earthengine.google.com](https://code.earthengine.google.com).
2. In the top-right, click your avatar → **Register a new cloud project**.
3. Select the Cloud project you just created and register it for **Non-Commercial / Research** use.

**Step 4 — Add your Project ID to `.env`**
```
GEE_PROJECT=your-project-id-here
```

---

### 6. Authenticate Google Earth Engine

Run this once to authorize your machine:

```bash
earthengine authenticate
```

This will open a browser window asking you to log in with the Google account linked to your GEE project. After approving, a credentials token is saved locally and used automatically by the app.

> **Note:** If you're running on a remote server (no browser), use:
> ```bash
> earthengine authenticate --quiet
> ```
> and follow the link printed in the terminal.

---

### 7. Set up the legal mines database

Run this once to load the Maus et al. 2022 global mining polygons into your Supabase PostGIS table:

```bash
python setup_legal_mines.py
```

This will create the `legal_mines` table, insert all mining polygons, and build a spatial index for fast detection queries.

### 8. Place your trained models
```
backend/ml_models/best_model.pt
backend/ml_models/custom_building_best.h5
...
```

---

## Running the Backend

```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

API will be available at `http://localhost:8000`  
Swagger docs: `http://localhost:8000/docs`

---

## Running the Frontend

```bash
cd frontend
npm install          # First time only
npm run dev
```

Frontend runs at `http://localhost:3000`

---

## API Endpoints

| Method | Endpoint         | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | `/`             | Health check                             |
| GET    | `/ping`         | Ping                                     |
| POST   | `/api/detect`   | Run mine detection on a GeoJSON polygon  |
| GET    | `/api/verified` | List all officer-verified mines          |
| POST   | `/api/verify`   | Mark a mine as verified (USER_LEGAL)     |
| POST   | `/api/lulc`     | Land Use Land Cover analysis             |
| POST   | `/api/building` | Built-up area analysis                   |
| POST   | `/api/landslide`| Landslide susceptibility analysis        |

### POST /api/detect — Request body
```json
{
  "geojson": {
    "type": "Feature",
    "properties": {},
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[lon, lat], ...]]
    }
  }
}
```

---

## Errors Fixed

| Error | Cause | Fix |
|-------|-------|-----|
| `data-fill layer does not exist` | `queryRenderedFeatures` called before layer is added to map | Wrapped in `if (geoData && !loading)` guard |
| `Axios 500 on /api/detect` | Hardcoded DB credentials, monolithic api.py | Moved all config to `.env` + `backend/config.py` |
| `THREE.Clock deprecated` | Old Three.js API in EarthGlobe.tsx | Cosmetic warning only — use `THREE.Timer` if you update that component |
| Hardcoded `window.location.hostname:8000` | Not portable across environments | Replaced with `NEXT_PUBLIC_API_URL` env var |

---

## Environment Variables Reference

| Variable | Used by | Description |
|----------|---------|-------------|
| `PGDATABASE` | FastAPI | Supabase DB name |
| `PGUSER` | FastAPI | Supabase pooler user |
| `PGPASSWORD` | FastAPI | Supabase password |
| `PGHOST` | FastAPI | Supabase pooler host |
| `PGPORT` | FastAPI | Supabase pooler port (6543) |
| `DB_DIRECT_USER` | mine_detection | Direct DB user |
| `DB_DIRECT_PASSWORD` | mine_detection | Direct DB password |
| `DB_DIRECT_HOST` | mine_detection | Direct DB host |
| `DB_DIRECT_PORT` | mine_detection | Direct DB port (5432) |
| `GEE_PROJECT` | mine_detection | GEE project ID |
| `MODEL_PATH` | mine_detection | Path to .pt weights file |
| `API_HOST` | uvicorn | Bind host (default 0.0.0.0) |
| `API_PORT` | uvicorn | Bind port (default 8000) |
| `NEXT_PUBLIC_API_URL` | Next.js | Backend URL for frontend |
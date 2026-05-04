"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Map, { Source, Layer, NavigationControl, MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowLeft, Loader2, MapIcon, Layers, ChevronDown, Square, Hexagon, Trash2,
  TreePine, Flame, Snowflake, Mountain, Globe2, Trees, Building2,
  Satellite, BarChart3, MapPinned, Leaf, Factory, Droplets, Home, Wheat,
  Cloud, Cpu, Calendar, Sun, CloudRain, CloudSun, Waves, Sprout,
  Target, ShieldAlert, ShieldCheck, Zap, ScanSearch, BrainCircuit, Box
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import LulcReport from "@/components/LulcReport";
import FireReport from "@/components/FireReport";
import DeforestationReport from "@/components/DeforestationReport";
import BuildingReport from "@/components/BuildingReport";
import LandslideReport from "@/components/LandslideReport";
import SnowReport from "@/components/SnowReport";
import CustomSelect from "@/components/CustomSelect";

import MapboxDraw from "@mapbox/mapbox-gl-draw";
// @ts-ignore
import DrawRectangle from "mapbox-gl-draw-rectangle-mode";
import { useControl } from "react-map-gl/maplibre";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

// ── Draw Setup ───────────────────────────────────────────────
const modes = MapboxDraw.modes as any;
modes.draw_rectangle = DrawRectangle;

const DRAW_STYLES = [
  { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'fill-color': '#00d4aa', 'fill-outline-color': '#00d4aa', 'fill-opacity': 0.15 } },
  { id: 'gl-draw-polygon-fill-active',   type: 'fill', filter: ['all', ['==', 'active', 'true'],  ['==', '$type', 'Polygon']],  paint: { 'fill-color': '#00d4aa', 'fill-outline-color': '#00d4aa', 'fill-opacity': 0.25 } },
  { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00d4aa', 'line-width': 2, 'line-dasharray': [2, 2] } },
  { id: 'gl-draw-polygon-stroke-active',   type: 'line', filter: ['all', ['==', 'active', 'true'],  ['==', '$type', 'Polygon']],  layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00d4aa', 'line-dasharray': [0.2, 2], 'line-width': 3 } },
  { id: 'gl-draw-polygon-and-line-vertex-stroke-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], paint: { 'circle-radius': 5, 'circle-color': '#fff' } },
  { id: 'gl-draw-polygon-and-line-vertex-inactive',        type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], paint: { 'circle-radius': 3, 'circle-color': '#00d4aa' } },
  { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#fff' } },
];

function DrawControl(props: ConstructorParameters<typeof MapboxDraw>[0] & {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onCreate?: (e: any) => void;
  onUpdate?: (e: any) => void;
  onDelete?: (e: any) => void;
  onInit?: (draw: MapboxDraw) => void;
}) {
  const draw = useControl<any>(
    () => new MapboxDraw(props),
    ({ map }: { map: any }) => { map.on("draw.create", props.onCreate); map.on("draw.update", props.onUpdate); map.on("draw.delete", props.onDelete); },
    ({ map }: { map: any }) => { map.off("draw.create", props.onCreate); map.off("draw.update", props.onUpdate); map.off("draw.delete", props.onDelete); },
    { position: props.position || "top-left" }
  );
  useEffect(() => { 
    if (draw && props.onInit) {
      props.onInit(draw); 
    }
  }, [draw]); // Only run when 'draw' instance changes
  return null;
}

// ── Map Style ────────────────────────────────────────────────
const MAP_STYLE = {
  version: 8 as const,
  sources: {
    "esri-imagery": { type: "raster" as const, tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "© Esri" },
  },
  layers: [{ id: "esri-imagery-layer", type: "raster" as const, source: "esri-imagery", minzoom: 0, maxzoom: 19 }],
};

// ── Tab definitions ──────────────────────────────────────────
const TABS = [
  { id: "lulc",          label: "LULC",            icon: Globe2,    color: "#00d4aa" },
  { id: "deforestation", label: "Deforestation",    icon: TreePine,  color: "#22c55e" },
  { id: "fire",          label: "Forest Fire",      icon: Flame,     color: "#f97316" },
  { id: "snow",          label: "Snow & Ice",       icon: Snowflake, color: "#38bdf8" },
  { id: "landslide",     label: "Landslide",        icon: Mountain,  color: "#ef4444" },
  { id: "building",      label: "Buildings",        icon: Building2, color: "#a855f7" },
];

// ── Color palette for DW classes ─────────────────────────────
const DW_COLORS: Record<string, string> = {
  Water: '#419BDF', Trees: '#397D49', Grass: '#88B053', 'Flooded Vegetation': '#7A87C6',
  Crops: '#E49635', 'Shrub & Scrub': '#DFC35A', 'Built Area': '#C4281B', 'Bare Ground': '#A59B8F',
};

// ── Bhuvan LULC 250K year → WMS layer mapping ───────────────
const BHUVAN_LAYERS: Record<number, string> = {
  2004: 'LULC250K_0405', 2005: 'LULC250K_0506', 2006: 'LULC250K_0607',
  2007: 'LULC250K_0708', 2008: 'LULC250K_0809', 2009: 'LULC250K_0910',
  2010: 'LULC250K_1011', 2011: 'LULC250K_1112', 2012: 'LULC250K_1213',
  2013: 'LULC250K_1314', 2014: 'LULC250K_1415', 2015: 'LULC250K_1516',
  2016: 'LULC250K_1617', 2017: 'LULC250K_1718', 2018: 'LULC250K_1819',
  2020: 'LULC250K_2021', 2021: 'LULC250K_2122', 2022: 'LULC250K_2223',
  2023: 'LULC250K_2324', 2024: 'LULC250K_2425',
};
const BHUVAN_WMS_BASE = 'https://bhuvan-ras2.nrsc.gov.in/cgi-bin/LULC250K.exe';

function TerrainGuardianInner() {
  const mapRef = useRef<MapRef | null>(null);
  const [viewState, setViewState] = useState({ longitude: 78.9, latitude: 22.5, zoom: 5, pitch: 0, bearing: 0 });



  // Draw state
  const [drawInstance, setDrawInstance] = useState<MapboxDraw | null>(null);
  const [activeMode, setActiveMode] = useState<string>("draw_rectangle");
  const [selectedPolygon, setSelectedPolygon] = useState<any>(null);
  const [geoJsonText, setGeoJsonText] = useState("");
  const [showGeoJson, setShowGeoJson] = useState(false);

  // Analysis state
  // Read tab from URL query param (e.g. /terrain?tab=fire)
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const isDirectNav = !!urlTab && TABS.some(t => t.id === urlTab); // Came from /launch with specific feature
  const [activeTab, setActiveTab] = useState(
    isDirectNav ? urlTab! : "lulc"
  );
  const currentTabInfo = TABS.find(t => t.id === activeTab);
  const [loading, setLoading] = useState(false);
  const [overlayTiles, setOverlayTiles] = useState<string | null>(null);
  const [overlayName, setOverlayName] = useState("");
  const [localOverlay, setLocalOverlay] = useState<{ b64: string; coordinates: any } | null>(null);

  // LULC state
  const [lulcYear, setLulcYear] = useState(new Date().getFullYear() - 1);
  const [lulcSeason, setLulcSeason] = useState("annual");
  const [lulcModel, setLulcModel] = useState("dynamic_world");
  const [lulcResult, setLulcResult] = useState<any>(null);
  const [showLulcReport, setShowLulcReport] = useState(false);

  // HITL Active Learning State
  const [hitlClass, setHitlClass] = useState("1");
  const [isTraining, setIsTraining] = useState(false);

  // Deforestation State
  const [defStartYear, setDefStartYear] = useState(2001);
  const [defEndYear, setDefEndYear] = useState(new Date().getFullYear() - 1);
  const [defMinCanopy, setDefMinCanopy] = useState(20);
  const [deforestResult, setDeforestResult] = useState<any>(null);
  const [showDeforestReport, setShowDeforestReport] = useState(false);
  const [defIncludeNdvi, setDefIncludeNdvi] = useState(false);
  const [defNdviBefore, setDefNdviBefore] = useState(2018);
  const [defNdviAfter, setDefNdviAfter] = useState(new Date().getFullYear());
  const [defNdviThreshold, setDefNdviThreshold] = useState(0.4);
  const [defSeason, setDefSeason] = useState("annual");
  
  // Fire State
  const [fireEngine, setFireEngine] = useState("gee_dnbr");
  const [firePreStart, setFirePreStart] = useState("2023-01-01");
  const [firePreEnd, setFirePreEnd] = useState("2023-05-01");
  const [firePostStart, setFirePostStart] = useState("2023-05-02");
  const [firePostEnd, setFirePostEnd] = useState("2023-09-01");
  const [firmsStartDate, setFirmsStartDate] = useState("2000-11-01");
  const [firmsEndDate, setFirmsEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [firmsConfidence, setFirmsConfidence] = useState(30);
  const [fireResult, setFireResult] = useState<any>(null);
  const [firmsResult, setFirmsResult] = useState<any>(null);
  const [fireRiskResult, setFireRiskResult] = useState<any>(null);
  const [showFireReport, setShowFireReport] = useState(false);
  
  // Snow State
  const [snowYear, setSnowYear] = useState(new Date().getFullYear() - 1);
  const [snowIncludeTrend, setSnowIncludeTrend] = useState(true);
  const [snowIncludeSeasonal, setSnowIncludeSeasonal] = useState(false);
  const [snowIncludePersistence, setSnowIncludePersistence] = useState(false);
  const [snowInclude8day, setSnowInclude8day] = useState(false);
  const [snowIncludeLst, setSnowIncludeLst] = useState(false);
  const [snowIncludeSwe, setSnowIncludeSwe] = useState(false);
  const [snowIncludeS2, setSnowIncludeS2] = useState(false);
  const [snowResult, setSnowResult] = useState<any>(null);
  const [showSnowReport, setShowSnowReport] = useState(false);
  
  // Landslide State
  const [landslideEngine, setLandslideEngine] = useState("gee");
  const [landslideResult, setLandslideResult] = useState<any>(null);
  const [landslideTrainClass, setLandslideTrainClass] = useState("1");
  const [isLandslideTraining, setIsLandslideTraining] = useState(false);

  // Building State
  const [buildingEngine, setBuildingEngine] = useState("gee");
  const [buildingResult, setBuildingResult] = useState<any>(null);
  const [buildingTrainClass, setBuildingTrainClass] = useState("1");
  const [isBuildingTraining, setIsBuildingTraining] = useState(false);
  const [showBuildingReport, setShowBuildingReport] = useState(false);
  const [showLandslideReport, setShowLandslideReport] = useState(false);

  // ── Draw handlers ──────────────────────────────────────────
  const onUpdateDraw = useCallback((e: any) => {
    if (e.features?.length > 0) {
      setSelectedPolygon(e.features[0]);
      setGeoJsonText(JSON.stringify(e.features[0].geometry, null, 2));
      setActiveMode("simple_select");
    }
  }, []);

  const onDeleteDraw = useCallback(() => { setSelectedPolygon(null); setGeoJsonText(""); }, []);

  useEffect(() => {
    try {
      if (geoJsonText && drawInstance) {
        const parsed = JSON.parse(geoJsonText);

        // Normalize any input format into an array of GeoJSON Feature objects
        let features: any[] = [];

        if (Array.isArray(parsed)) {
          // Array of objects: [{name, type, coordinates}, ...] or [{type:"Feature", geometry:{...}}, ...]
          features = parsed.map((item: any) => {
            if (item.type === "Feature" && item.geometry) return item;
            if (item.coordinates) {
              return { type: "Feature" as const, properties: { name: item.name || "" }, geometry: { type: item.type || "Polygon", coordinates: item.coordinates } };
            }
            return null;
          }).filter(Boolean);
        } else if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
          features = parsed.features;
        } else if (parsed.type === "Feature" && parsed.geometry) {
          features = [parsed];
        } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
          features = [{ type: "Feature" as const, properties: {}, geometry: parsed }];
        }

        if (features.length > 0) {
          // Use only the first polygon for analysis
          setSelectedPolygon(features[0]);

          // Draw all polygons on the map
          drawInstance.deleteAll();
          features.forEach((f: any) => drawInstance.add(f));

          // Compute bounding box across ALL features for auto-zoom
          if (mapRef.current) {
            let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
            features.forEach((f: any) => {
              const geom = f.geometry;
              const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
              rings.forEach((ring: any) => {
                (Array.isArray(ring[0]) ? ring : [ring]).forEach((pt: any) => {
                  if (typeof pt[0] === "number") { minLon = Math.min(minLon, pt[0]); maxLon = Math.max(maxLon, pt[0]); minLat = Math.min(minLat, pt[1]); maxLat = Math.max(maxLat, pt[1]); }
                });
              });
            });
            if (minLon <= maxLon && minLat <= maxLat) {
              mapRef.current.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80, duration: 1500, maxZoom: 14 });
            }
          }
        }
      }
    } catch { /* ignore parse errors while user is typing */ }
  }, [geoJsonText, drawInstance]);

  const handleModeChange = (mode: string) => {
    if (drawInstance) { 
      try {
        // Clear existing shapes before switching mode
        drawInstance.deleteAll();
        setSelectedPolygon(null);
        setOverlayTiles(null);
        setOverlayName("");
        setLocalOverlay(null);
        drawInstance.changeMode(mode); 
        setActiveMode(mode); 
      } catch(e) {
        console.warn("MapboxDraw mode change failed", e);
      }
    }
  };

  const handleClear = () => {
    if (drawInstance) {
      try {
        // Delete all drawn features from the map
        const allFeatures = drawInstance.getAll();
        if (allFeatures?.features?.length > 0) {
          const ids = allFeatures.features.map((f: any) => f.id);
          drawInstance.delete(ids);
        }
        drawInstance.deleteAll();
        // Reset mode to drawing
        drawInstance.changeMode("draw_rectangle");
        setActiveMode("draw_rectangle");
      } catch(e) {
        console.warn("MapboxDraw clear failed:", e);
      }
    }
    setSelectedPolygon(null);
    setGeoJsonText("");
    setOverlayTiles(null);
    setOverlayName("");
    setLocalOverlay(null);
    setLulcResult(null);
    setFireResult(null);
    setFirmsResult(null);
    setFireRiskResult(null);
    setSnowResult(null);
    setLandslideResult(null);
    setDeforestResult(null);
    setBuildingResult(null);
    setLoading(false);
  };

  // ── Geometry helper ────────────────────────────────────────
  const getGeometry = () => {
    if (selectedPolygon) return selectedPolygon.geometry || selectedPolygon;
    try { return JSON.parse(geoJsonText); } catch { return null; }
  };

  // ── LULC Analysis ──────────────────────────────────────────
  const runLulc = async () => {
    // Bhuvan 250K — full India WMS tiles
    if (lulcModel === 'bhuvan_250k') {
      setLoading(true);
      try {
        const availableYears = Object.keys(BHUVAN_LAYERS).map(Number).sort((a, b) => a - b);
        let bestYear = availableYears[availableYears.length - 1];
        for (const y of availableYears) {
          if (y <= lulcYear) bestYear = y;
        }
        const layerName = BHUVAN_LAYERS[bestYear];
        setOverlayTiles(`bhuvan_wms:${layerName}`);
        setOverlayName(`Bhuvan LULC 250K (${bestYear}-${String(bestYear + 1).slice(-2)})`);
        setLulcResult({
          status: 'success', bhuvan: true,
          stats: {
            source: `ISRO Bhuvan NRC LULC 250K (${bestYear}-${String(bestYear + 1).slice(-2)})`,
            resolution: '250K scale',
            year: bestYear, season: 'annual',
            total_area_km2: 'All India', dominant_class: 'Visual Only (WMS)',
            images_used: 'Pre-computed ISRO Dataset', class_areas_km2: {}, class_percentages: {},
          },
        });
      } catch (err: any) {
        alert(`Bhuvan LULC failed: ${err.message}`);
      }
      setLoading(false);
      return;
    }

    const geom = getGeometry();
    if (!geom) return;

    // Check size limit for Custom 1D-CNN (Target: < 100 km²)
    if (lulcModel === "custom_1dcnn") {
      let coords = geom.type === "Feature" ? geom.geometry?.coordinates[0] : geom.coordinates[0];
      if (coords && coords.length > 0) {
        let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
        for (const pt of coords) {
          minLon = Math.min(minLon, pt[0]); maxLon = Math.max(maxLon, pt[0]);
          minLat = Math.min(minLat, pt[1]); maxLat = Math.max(maxLat, pt[1]);
        }
        const avgLat = (minLat + maxLat) / 2;
        const heightKm = (maxLat - minLat) * 111.32;
        const widthKm = (maxLon - minLon) * 111.32 * Math.cos(avgLat * (Math.PI / 180));
        const areaKm2 = widthKm * heightKm;

        if (areaKm2 > 150) {
          alert(`Error: Area Selection Too Large for Local Model!\n\nLimit: ~150 km²\nYour Selection: ~${areaKm2.toFixed(1)} km²\n\nPlease draw a smaller region (like a single town) to execute the Neural Network on your laptop, or switch back to "Google Dynamic World".`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/lulc`, {
        geojson: geom,
        year: lulcYear,
        season: lulcSeason,
        model: lulcModel,
      });
      setLulcResult(res.data);
      
      if (res.data.custom_image_b64) {
        setLocalOverlay({ b64: res.data.custom_image_b64, coordinates: res.data.coordinates });
        setOverlayTiles("local_overlay"); // Using overlayTiles var state trigger
        setOverlayName("Custom 1D-CNN Output");
      } else if (res.data.lulc_tiles) {
        setOverlayTiles(res.data.lulc_tiles);
        setOverlayName("LULC Classification");
      }
    } catch (err: any) {
      alert(`LULC analysis failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  const runHitlTraining = async () => {
    const geom = getGeometry();
    if (!geom) {
      alert("Please draw an area on the map to submit as training data.");
      return;
    }
    setIsTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/lulc/train`, {
        geojson: geom,
        class_label: parseInt(hitlClass)
      });
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Active Learning failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsTraining(false);
  };

  const runAutoDistillTraining = async () => {
    const geom = getGeometry();
    if (!geom) {
      alert("Please draw an area on the map to auto-label.");
      return;
    }
    setIsTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/lulc/distill`, {
        geojson: geom
      });
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Auto-Distill failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsTraining(false);
  };

  // ── Forest Fire Analysis ───────────────────────────────────
  const runFire = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/fire`, {
        geojson: geom,
        pre_start: firePreStart,
        pre_end: firePreEnd,
        post_start: firePostStart,
        post_end: firePostEnd,
      });
      setFireResult(res.data);
      if (res.data.severity_tiles) {
        setOverlayTiles(res.data.severity_tiles);
        setOverlayName("Burn Severity (dNBR)");
      }
    } catch (err: any) {
      alert(`Fire analysis failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  // ── FIRMS Hotspot Query ────────────────────────────────────
  const runFireHotspots = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/fire/hotspots`, {
        geojson: geom,
        start_date: firmsStartDate,
        end_date: firmsEndDate,
        confidence_min: firmsConfidence,
        max_points: 15000,
      });
      setFirmsResult(res.data);
      if (res.data.geojson) {
        setOverlayTiles("firms_hotspots");
        setOverlayName(`FIRMS Hotspots (${res.data.total_points} fires)`);
      }
    } catch (err: any) {
      alert(`FIRMS query failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  // ── Fire Risk Prediction (ML) ──────────────────────────────
  const runFireRiskPrediction = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/fire/risk`, {
        geojson: geom,
        cell_size: 0.01,
      });
      setFireRiskResult(res.data);
      setOverlayTiles("fire_risk_grid");
      setOverlayName(`Fire Risk Prediction (${res.data.risk_summary?.total_cells || 0} cells)`);
    } catch (err: any) {
      alert(`Fire risk prediction failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  // ── Snow Cover Analysis ────────────────────────────────────
  const runSnow = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/snow`, {
        geojson: geom,
        year: snowYear,
        include_trend: snowIncludeTrend,
        include_seasonal: snowIncludeSeasonal,
        include_persistence: snowIncludePersistence,
        include_8day: snowInclude8day,
        include_lst: snowIncludeLst,
        include_swe: snowIncludeSwe,
        include_s2: snowIncludeS2,
        trend_start_year: 2014,
        trend_end_year: new Date().getFullYear(),
      });
      setSnowResult(res.data);
      if (res.data.snow_tiles) {
        setOverlayTiles(res.data.snow_tiles);
        setOverlayName("Snow Cover Extent");
      }
    } catch (err: any) {
      alert(`Snow analysis failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  // ── Landslide Analysis ─────────────────────────────────────
  const runLandslide = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/landslide`, {
        geojson: geom,
        engine: landslideEngine,
      });
      setLandslideResult(res.data);
      if (res.data.custom_image_b64) {
        setLocalOverlay({ b64: res.data.custom_image_b64, coordinates: res.data.coordinates });
        setOverlayTiles("local_overlay");
        setOverlayName("Deep Learning Susceptibility");
      } else if (res.data.class_tiles) {
        setOverlayTiles(res.data.class_tiles);
        setOverlayName(landslideEngine === "xgboost" ? "XGBoost Risk Classes" : "Landslide Risk Classes");
      }
    } catch (err: any) {
      alert(`Landslide analysis failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  const runLandslideTraining = async () => {
    const geom = getGeometry();
    if (!geom) {
      alert("Please draw an area on the map to submit as training data.");
      return;
    }
    setIsLandslideTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/landslide/train`, {
        geojson: geom,
        class_label: parseInt(landslideTrainClass)
      });
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Active Learning failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsLandslideTraining(false);
  };

  const runLandslideDistill = async () => {
    const geom = getGeometry();
    if (!geom) {
      alert("Please draw an area on the map to auto-label.");
      return;
    }
    setIsLandslideTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/landslide/distill`, {
        geojson: geom
      });
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Auto-Distill failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsLandslideTraining(false);
  };

  const runLandslideAutoCollect = async () => {
    setIsLandslideTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/landslide/autocollect`);
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Auto-Collect failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsLandslideTraining(false);
  };

  // ── Building Analysis ──────────────────────────────────
  const runBuilding = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/building`, {
        geojson: geom,
        engine: buildingEngine,
      });
      setBuildingResult(res.data.data);
      if (res.data.data.custom_image_b64) {
        setLocalOverlay({ b64: res.data.data.custom_image_b64, coordinates: res.data.data.coordinates });
        setOverlayTiles("local_overlay");
        setOverlayName("Deep Learning Buildings");
      } else if (res.data.data.tile_url) {
        setOverlayTiles(res.data.data.tile_url);
        setOverlayName("GEE Open Buildings");
      }
    } catch (err: any) {
      alert(`Building analysis failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  const runBuildingTraining = async () => {
    const geom = getGeometry();
    if (!geom) {
      alert("Please draw an area on the map to submit as training data.");
      return;
    }
    setIsBuildingTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/building/train`, {
        geojson: geom,
        class_label: parseInt(buildingTrainClass)
      });
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Active Learning failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsBuildingTraining(false);
  };

  const runBuildingDistill = async () => {
    const geom = getGeometry();
    if (!geom) {
      alert("Please draw an area on the map to auto-label.");
      return;
    }
    setIsBuildingTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/building/distill`, {
        geojson: geom
      });
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Auto-Distill failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsBuildingTraining(false);
  };

  const runBuildingAutoCollect = async () => {
    setIsBuildingTraining(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/building/autocollect`);
      alert(`✅ ${res.data.message}`);
    } catch (err: any) {
      alert(`❌ Auto-Collect failed: ${err?.response?.data?.detail || err.message}`);
    }
    setIsBuildingTraining(false);
  };

  // ── Deforestation Analysis ──────────────────────────────────
  const runDeforestation = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setLoading(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const seasonMonths: Record<string, [number, number]> = {
        annual: [1, 12], kharif: [6, 10], rabi: [11, 3], winter: [12, 2], summer: [3, 5],
      };
      const [sStart, sEnd] = seasonMonths[defSeason] || [1, 12];
      const res = await axios.post(`${serverUrl}/api/deforestation`, {
        geojson: geom,
        start_year: defStartYear,
        end_year: defEndYear,
        min_canopy: defMinCanopy,
        include_ndvi: defIncludeNdvi,
        ndvi_before_year: defNdviBefore,
        ndvi_after_year: defNdviAfter,
        ndvi_threshold: defNdviThreshold,
        season_start_month: sStart,
        season_end_month: sEnd,
      });
      setDeforestResult(res.data);
      if (res.data.combined_tiles) {
        setOverlayTiles(res.data.combined_tiles);
        setOverlayName("Forest Loss Map");
      }
    } catch (err: any) {
      alert(`Deforestation analysis failed: ${err?.response?.data?.detail || err.message}`);
    }
    setLoading(false);
  };

  // ── Overlay switch helper ──────────────────────────────────
  const switchLayer = (tiles: string | null | undefined, name: string) => {
    if (tiles) { setOverlayTiles(tiles); setOverlayName(name); }
  };

  // ── Map style with overlay ─────────────────────────────────
  let mapStyle: any = MAP_STYLE;
  
  if (overlayTiles === "local_overlay" && localOverlay?.b64) {
    mapStyle = {
      ...MAP_STYLE,
      sources: {
        ...MAP_STYLE.sources,
        "custom-overlay": {
          type: "image",
          url: `data:image/png;base64,${localOverlay.b64}`,
          coordinates: localOverlay.coordinates
        }
      },
      layers: [
        ...MAP_STYLE.layers,
        { id: "custom-overlay-layer", type: "raster", source: "custom-overlay", paint: { "raster-opacity": 0.85 } }
      ]
    };
  } else if (overlayTiles === "geojson_buildings" && buildingResult?.geojson) {
    mapStyle = {
      ...MAP_STYLE,
      sources: {
        ...MAP_STYLE.sources,
        "gee-buildings-3d": { type: "geojson", data: buildingResult.geojson },
      },
      layers: [
        ...MAP_STYLE.layers,
        {
          id: "gee-buildings-3d-layer",
          type: "fill-extrusion",
          source: "gee-buildings-3d",
          paint: {
            "fill-extrusion-color": [
              "interpolate", ["linear"], ["get", "confidence"],
              0.5, "#5b21b6",   // Low confidence → deep purple
              0.65, "#7c3aed",  // Medium-low → vibrant purple
              0.75, "#a78bfa",  // Medium → lavender
              0.85, "#06b6d4",  // Medium-high → cyan
              0.95, "#22d3ee",  // High → bright cyan
            ],
            "fill-extrusion-height": ["+", 6, ["*", ["get", "confidence"], 18]],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.9
          }
        }
      ]
    };
  } else if (overlayTiles === "fire_risk_grid" && fireRiskResult?.features) {
    // ML Fire Risk Prediction — GeoJSON grid cells colored by risk_score
    const riskGeoJson = {
      type: "FeatureCollection",
      features: fireRiskResult.features,
    };
    mapStyle = {
      ...MAP_STYLE,
      sources: {
        ...MAP_STYLE.sources,
        "fire-risk-grid": { type: "geojson", data: riskGeoJson },
      },
      layers: [
        ...MAP_STYLE.layers,
        {
          id: "fire-risk-grid-fill",
          type: "fill",
          source: "fire-risk-grid",
          paint: {
            "fill-color": [
              "interpolate", ["linear"], ["get", "risk_score"],
              0,  "#064e3b",   // very low → deep emerald
              20, "#059669",   // low → emerald
              40, "#fbbf24",   // moderate → amber
              60, "#f97316",   // elevated → orange
              75, "#ef4444",   // high → red
              90, "#991b1b",   // very high → dark red
              100,"#7f1d1d",   // extreme → deepest red
            ],
            "fill-opacity": 0.65,
          },
        },
        {
          id: "fire-risk-grid-outline",
          type: "line",
          source: "fire-risk-grid",
          paint: {
            "line-color": "rgba(255,255,255,0.12)",
            "line-width": 0.5,
          },
        },
      ],
    };
  } else if (overlayTiles === "firms_hotspots" && firmsResult?.geojson) {
    mapStyle = {
      ...MAP_STYLE,
      sources: {
        ...MAP_STYLE.sources,
        "firms-hotspots": { type: "geojson", data: firmsResult.geojson },
      },
      layers: [
        ...MAP_STYLE.layers,
        {
          id: "firms-hotspots-heat",
          type: "circle",
          source: "firms-hotspots",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 3, 50, 8, 200, 14],
            "circle-color": ["interpolate", ["linear"], ["get", "brightness"], 300, "#fbbf24", 340, "#f97316", 380, "#ef4444", 420, "#991b1b"],
            "circle-opacity": 0.7,
            "circle-stroke-width": 0.5,
            "circle-stroke-color": "#fff",
            "circle-stroke-opacity": 0.3,
          },
        },
      ],
    };
  } else if (overlayTiles?.startsWith('bhuvan_wms:')) {
    // Bhuvan WMS tiles — proxied through backend to avoid CORS
    const layerName = overlayTiles.replace('bhuvan_wms:', '');
    const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wmsUrl = `${serverUrl}/api/bhuvan/wms?LAYERS=${layerName}&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png`;
    mapStyle = {
      ...MAP_STYLE,
      sources: {
        ...MAP_STYLE.sources,
        "bhuvan-wms": { type: "raster" as const, tiles: [wmsUrl], tileSize: 256, attribution: "© ISRO/NRSC Bhuvan" },
      },
      layers: [
        ...MAP_STYLE.layers,
        { id: "bhuvan-wms-layer", type: "raster" as const, source: "bhuvan-wms", minzoom: 0, maxzoom: 16, paint: { "raster-opacity": 0.85 } },
      ],
    };
  } else if (overlayTiles) {
    mapStyle = {
      ...MAP_STYLE,
      sources: {
        ...MAP_STYLE.sources,
        "gee-overlay": { type: "raster", tiles: [overlayTiles], tileSize: 256, attribution: "GEE" },
      },
      layers: [
        ...MAP_STYLE.layers,
        { id: "gee-overlay-layer", type: "raster", source: "gee-overlay", minzoom: 0, maxzoom: 19, paint: { "raster-opacity": 0.75 } },
      ],
    };
  }

  const hasGeom = !!selectedPolygon || !!geoJsonText;

  return (
    <div className="h-screen w-full bg-[#030712] text-slate-200 overflow-hidden font-sans relative">

      {/* ═══ LEFT SIDEBAR ═══ */}
      <aside className="absolute left-6 top-6 bottom-6 w-[380px] bg-[#030712]/50 backdrop-blur-3xl border border-white/10 rounded-3xl flex flex-col z-20 shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto">
        <div className="absolute top-0 left-0 w-full h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between relative z-10">
          <Link href="/launch" className="group flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10">
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
          </Link>
          <div className="flex items-center gap-2">
            {currentTabInfo && (() => { const TabIcon = currentTabInfo.icon; return <TabIcon className="w-4 h-4" style={{ color: currentTabInfo.color }} />; })()}
            <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase">
              {isDirectNav && currentTabInfo ? currentTabInfo.label : 'EARTHWATCH'}
            </span>
          </div>
          {isDirectNav ? (
            <div className="w-10" /> /* spacer for balance */
          ) : (
            <Link href="/dashboard" className="text-[10px] text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20 hover:bg-emerald-400/20 transition-colors tracking-wider font-bold">
              MINES
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 relative z-10 custom-scrollbar">

          {/* AOI Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <MapIcon className="w-4 h-4" />
              <h3 className="text-xs uppercase tracking-[0.15em] font-semibold">Area of Interest</h3>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use <span className="text-white font-medium">Square</span> or <span className="text-white font-medium">Polygon</span> tools on the map to select your AOI.
            </p>
          </div>


          {/* GeoJSON Toggle */}
          <div className="flex flex-col gap-2">
            <button onClick={() => setShowGeoJson(!showGeoJson)} className="flex items-center justify-between w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-slate-300 font-mono transition-colors">
              <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Raw GeoJSON Input</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showGeoJson ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showGeoJson && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <textarea value={geoJsonText} onChange={(e) => setGeoJsonText(e.target.value)}
                    className="w-full bg-[#030712]/50 border border-white/10 rounded-lg p-3 text-emerald-300 font-mono text-[11px] h-28 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner mt-1"
                    placeholder='{"type":"Polygon","coordinates":[...]}' spellCheck="false" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ═══ TAB BAR — hidden when navigating from /launch ═══ */}
          {!isDirectNav && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all border ${
                      isActive
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                    style={isActive ? { color: tab.color } : {}}
                  >
                    <Icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ═══ TAB CONTENT ═══ */}

          {/* LULC */}
          {activeTab === "lulc" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
              <div className="text-[10px] text-slate-500 font-mono tracking-wider border-l-2 border-emerald-500/30 pl-3">
                {lulcModel === 'bhuvan_250k' ? 'ISRO Bhuvan NRC — 250K Scale India LULC (2004–2025)' :
                 lulcModel === 'custom_1dcnn' ? 'Custom 1D-CNN — Local TensorFlow Neural Network' :
                 'Google Dynamic World — 10m Near Real-Time LULC'}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Year</label>
                  <input type="number" min={lulcModel === 'bhuvan_250k' ? 2004 : 2017} max={new Date().getFullYear()} value={lulcYear} onChange={(e) => setLulcYear(parseInt(e.target.value))}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-emerald-300 font-mono text-sm focus:border-emerald-500/50 focus:outline-none transition-colors" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Season</label>
                  <CustomSelect
                    value={lulcSeason}
                    onChange={setLulcSeason}
                    accentColor="#00d4aa"
                    disabled={lulcModel === 'bhuvan_250k'}
                    options={[
                      { value: "annual", label: "Annual", icon: <Calendar className="w-3 h-3" /> },
                      { value: "kharif", label: "Kharif", icon: <CloudRain className="w-3 h-3" /> },
                      { value: "rabi", label: "Rabi", icon: <Sprout className="w-3 h-3" /> },
                      { value: "dry", label: "Dry", icon: <Sun className="w-3 h-3" /> },
                      { value: "wet", label: "Wet", icon: <Waves className="w-3 h-3" /> },
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1 col-span-2 mt-1">
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Model Engine</label>
                  <CustomSelect
                    value={lulcModel}
                    onChange={setLulcModel}
                    accentColor="#00d4aa"
                    options={[
                      { value: "dynamic_world", label: "Google Dynamic World (Cloud API)", icon: <Cloud className="w-3 h-3" />, description: "10m near real-time classification" },
                      { value: "bhuvan_250k", label: "ISRO Bhuvan LULC 250K", icon: <Satellite className="w-3 h-3" />, description: "India-only • 2004–2025 • AOI clipped" },
                      { value: "custom_1dcnn", label: "Custom 1D-CNN (Local TensorFlow)", icon: <Cpu className="w-3 h-3" />, description: "Neural network on local device" },
                    ]}
                  />
                </div>
              </div>
              
              <AnimatePresence>
                {lulcModel === "custom_1dcnn" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-start gap-2.5">
                    <Cpu className="w-3.5 h-3.5 text-amber-400/70 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Local neural network inference — exports PNG overlay instead of dynamic tiling. Best for areas under 150 km².
                    </p>
                  </motion.div>
                )}
                {lulcModel === "bhuvan_250k" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-start gap-2.5">
                    <Satellite className="w-3.5 h-3.5 text-sky-400/70 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      ISRO Bhuvan NRC — Full India WMS coverage (2004–2025). No AOI required. Season filter is not available.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Run Button */}
              <button onClick={runLulc} disabled={loading || (!hasGeom && lulcModel !== 'bhuvan_250k') || isTraining}
                className={`relative group overflow-hidden flex items-center justify-center gap-3 w-full py-3.5 rounded-full font-semibold tracking-wide transition-all duration-300 text-sm ${
                  loading || (!hasGeom && lulcModel !== 'bhuvan_250k') || isTraining
                    ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10'
                    : 'bg-emerald-500 text-black shadow-[0_0_30px_rgba(0,212,170,0.2)] hover:shadow-[0_0_40px_rgba(0,212,170,0.4)] hover:bg-emerald-400'
                }`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
                {loading ? "Classifying..." : "Classify Land Use"}
              </button>

              <button onClick={handleClear} disabled={(!hasGeom && !lulcResult) || isTraining}
                className="w-full bg-transparent border border-white/10 hover:border-white/30 hover:bg-white/5 text-slate-400 hover:text-white text-xs font-medium tracking-wide py-2.5 rounded-full transition-all disabled:opacity-30">
                Clear All
              </button>

              {/* Active Learning Form (Only visible under Custom 1D CNN) */}
              {lulcModel === "custom_1dcnn" && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4 mt-1">
                  <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Teach Model (Active Learning)</h3>
                  <p className="text-[10px] text-slate-500 leading-relaxed -mt-2">
                    Draw a polygon, select its true class, and retrain the 1D-CNN locally.
                  </p>
                  <CustomSelect
                    value={hitlClass}
                    onChange={setHitlClass}
                    disabled={isTraining}
                    accentColor="#00d4aa"
                    options={[
                      { value: "1", label: "Water", icon: <Droplets className="w-3 h-3" /> },
                      { value: "2", label: "Trees", icon: <Trees className="w-3 h-3" /> },
                      { value: "3", label: "Grass", icon: <Sprout className="w-3 h-3" /> },
                      { value: "4", label: "Flooded Vegetation", icon: <Waves className="w-3 h-3" /> },
                      { value: "5", label: "Crops", icon: <Wheat className="w-3 h-3" /> },
                      { value: "6", label: "Shrub & Scrub", icon: <Leaf className="w-3 h-3" /> },
                      { value: "7", label: "Built Area", icon: <Building2 className="w-3 h-3" /> },
                      { value: "8", label: "Bare Ground", icon: <Mountain className="w-3 h-3" /> },
                    ]}
                  />
                  <button onClick={runHitlTraining} disabled={isTraining || !hasGeom}
                    className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                      isTraining || !hasGeom
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                        : 'bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {isTraining ? "Finetuning Local CNN..." : "Submit as Training Data"}
                  </button>

                  <div className="flex items-center gap-2">
                    <div className="h-px bg-white/10 flex-1"></div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">OR</span>
                    <div className="h-px bg-white/10 flex-1"></div>
                  </div>

                  <button onClick={runAutoDistillTraining} disabled={isTraining || !hasGeom}
                    className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                      isTraining || !hasGeom
                        ? 'bg-transparent text-slate-500 cursor-not-allowed border border-white/5'
                        : 'bg-transparent text-slate-300 border border-white/10 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    Auto-Train via Google Dynamic World
                  </button>
                </div>
              )}

              {/* LULC Results */}
              <AnimatePresence>
                {lulcResult && lulcResult.stats && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                    className="flex flex-col gap-4 pt-3 border-t border-white/10"
                  >
                    {/* Class area cards — or Bhuvan WMS info */}
                    {lulcResult.bhuvan ? (
                      <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 flex flex-col gap-2">
                        <span className="text-[10px] text-sky-400 uppercase tracking-widest font-bold">ISRO Bhuvan WMS Layer Active</span>
                        <span className="text-[11px] text-slate-300">Pre-computed LULC 250K tiles from ISRO/NRC are displayed on the map. Per-class statistics are not available for this source — use the map legend for visual interpretation.</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(lulcResult.stats.class_areas_km2 || {}).map(([cls, area]) => {
                          const pct = lulcResult.stats.class_percentages?.[cls] || 0;
                          const color = DW_COLORS[cls] || '#00d4aa';
                          return (
                            <div key={cls} className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
                              <span className="font-mono text-base font-bold" style={{ color }}>{String(area)} km²</span>
                              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{cls} ({String(pct)}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Info card */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Analysis Details</h3>
                      <div className="space-y-2.5 font-mono text-[11px]">
                      {[
                        ['SOURCE', lulcResult.stats.source],
                        ['RESOLUTION', lulcResult.stats.resolution],
                        ['YEAR', lulcResult.stats.year],
                        ['SEASON', lulcResult.stats.season?.toUpperCase()],
                        ['IMAGES USED', lulcResult.stats.images_used],
                        ['DOMINANT CLASS', lulcResult.stats.dominant_class],
                        ['TOTAL AREA', `${lulcResult.stats.total_area_km2} km²`],
                      ].map(([label, val]) => (
                        <div key={String(label)} className="flex justify-between items-center">
                          <span className="text-slate-500">{String(label)}</span>
                          <span className="text-slate-300">{String(val)}</span>
                        </div>
                      ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 p-3 border border-white/5 rounded-xl">
                      {Object.entries(DW_COLORS).map(([cls, color]) => (
                        <div key={cls} className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          {cls}
                        </div>
                      ))}
                    </div>

                    {/* Layer Switches */}
                    {lulcModel !== "custom_1dcnn" && !lulcResult.bhuvan && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Map Layers</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { key: 'lulc_tiles', label: 'LULC', Icon: MapPinned },
                            { key: 'rgb_tiles', label: 'RGB', Icon: Satellite },
                            { key: 'ndvi_tiles', label: 'NDVI', Icon: Leaf },
                            { key: 'ndbi_tiles', label: 'NDBI', Icon: Factory },
                            { key: 'mndwi_tiles', label: 'MNDWI', Icon: Droplets },
                          ].map((l) => (
                            <button key={l.key} onClick={() => switchLayer(lulcResult[l.key], l.label)}
                              className={`text-[10px] px-2 py-2 rounded-lg border font-bold tracking-wider transition-all ${
                                overlayName === l.label
                                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <l.Icon className="w-3 h-3" /> {l.label}
                            </button>
                          ))}
                        </div>

                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mt-2">Probability Heatmaps</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { key: 'built_prob_tiles', label: 'Built Area', Icon: Home },
                            { key: 'trees_prob_tiles', label: 'Trees', Icon: Trees },
                            { key: 'crops_prob_tiles', label: 'Crops', Icon: Wheat },
                          ].map((l) => (
                            <button key={l.key} onClick={() => switchLayer(lulcResult[l.key], l.label)}
                              className={`text-[10px] px-2 py-2 rounded-lg border font-bold tracking-wider transition-all ${
                                overlayName === l.label
                                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <l.Icon className="w-3 h-3" /> {l.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generate Report Button */}
                    <button
                      onClick={() => setShowLulcReport(true)}
                      className="w-full py-3 rounded-xl text-xs font-semibold tracking-wide bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 text-emerald-300 hover:from-emerald-500/30 hover:to-cyan-500/30 hover:text-white transition-all flex items-center justify-center gap-2 mt-2"
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> Generate Report
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* FIRE TAB */}
          {activeTab === "fire" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Engine</h3>
                <CustomSelect
                  value={fireEngine}
                  onChange={setFireEngine}
                  accentColor="#f97316"
                  options={[
                    { value: "gee_dnbr", label: "GEE Burn Severity (Sentinel-2 dNBR)", icon: <Satellite className="w-3 h-3" />, description: "Pre/Post fire comparison" },
                    { value: "firms", label: "NASA FIRMS Hotspots (MODIS + VIIRS)", icon: <Flame className="w-3 h-3" />, description: "Active fire detections" },
                  ]}
                />
              </div>

              {/* GEE dNBR Mode */}
              {fireEngine === "gee_dnbr" && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                  <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">dNBR Parameters</h3>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Pre-Fire Period</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={firePreStart} onChange={(e) => setFirePreStart(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                      <input type="date" value={firePreEnd} onChange={(e) => setFirePreEnd(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Post-Fire Period</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={firePostStart} onChange={(e) => setFirePostStart(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                      <input type="date" value={firePostEnd} onChange={(e) => setFirePostEnd(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                    </div>
                  </div>
                  <button onClick={runFire} disabled={!selectedPolygon || loading}
                    className={`relative group overflow-hidden flex items-center justify-center gap-3 w-full py-3.5 rounded-full font-semibold tracking-wide transition-all duration-300 text-sm mt-2 ${
                      !selectedPolygon || loading
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10'
                        : 'bg-orange-500 text-black shadow-[0_0_30px_rgba(249,115,22,0.2)] hover:shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:bg-orange-400'
                    }`}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
                    {loading ? "Analyzing..." : "Run Burn Severity Analysis"}
                  </button>
                </div>
              )}

              {/* FIRMS Mode */}
              {fireEngine === "firms" && (
                <div className="bg-white/[0.02] border border-orange-500/10 rounded-xl p-5 flex flex-col gap-4">
                  <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">FIRMS Query Parameters</h3>
                  <p className="text-[10px] text-slate-500 -mt-2">Query NASA FIRMS satellite fire detections (2000–2026, India).</p>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Date Range</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={firmsStartDate} onChange={(e) => setFirmsStartDate(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                      <input type="date" value={firmsEndDate} onChange={(e) => setFirmsEndDate(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Min Confidence: {firmsConfidence}%</label>
                    <input type="range" min={0} max={90} step={10} value={firmsConfidence}
                      onChange={(e) => setFirmsConfidence(parseInt(e.target.value))}
                      className="w-full accent-orange-500" />
                  </div>
                  <button onClick={runFireHotspots} disabled={!hasGeom || loading}
                    className={`relative group overflow-hidden flex items-center justify-center gap-3 w-full py-3.5 rounded-full font-semibold tracking-wide transition-all duration-300 text-sm mt-2 ${
                      !hasGeom || loading
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10'
                        : 'bg-orange-500 text-black shadow-[0_0_30px_rgba(249,115,22,0.2)] hover:shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:bg-orange-400'
                    }`}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                    {loading ? "Querying FIRMS..." : "Find Fire Hotspots"}
                  </button>

                  {/* ML Risk Prediction Button */}
                  <button onClick={runFireRiskPrediction} disabled={!hasGeom || loading}
                    className={`relative group overflow-hidden flex items-center justify-center gap-3 w-full py-3.5 rounded-full font-semibold tracking-wide transition-all duration-300 text-sm ${
                      !hasGeom || loading
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10'
                        : 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.2)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]'
                    }`}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                    {loading ? "Predicting Risk..." : "Predict Fire Risk (ML Model)"}
                  </button>
                </div>
              )}

              {/* FIRMS Result Stats */}
              <AnimatePresence>
                {firmsResult && firmsResult.total_points > 0 && fireEngine === "firms" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] backdrop-blur-sm border border-orange-500/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <span className="text-xs font-semibold text-white/80">Fire Detections Found</span>
                      <span className="font-mono text-sm font-bold text-orange-400">{firmsResult.total_points.toLocaleString()}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ML Fire Risk Prediction Result */}
              <AnimatePresence>
                {fireRiskResult && fireEngine === "firms" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="bg-white/[0.03] backdrop-blur-sm border border-red-500/[0.12] rounded-xl p-5 flex flex-col gap-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                      <BrainCircuit className="w-3.5 h-3.5 text-red-400" /> ML Fire Risk Prediction
                    </h3>

                    {/* Risk Distribution */}
                    {fireRiskResult.risk_summary && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-red-500/[0.08] border border-red-500/20 rounded-lg p-3 text-center">
                          <div className="text-lg font-bold font-mono text-red-400">{fireRiskResult.risk_summary.high_risk_cells}</div>
                          <div className="text-[9px] text-red-300/70 uppercase tracking-wider font-bold">High Risk</div>
                        </div>
                        <div className="bg-yellow-500/[0.08] border border-yellow-500/20 rounded-lg p-3 text-center">
                          <div className="text-lg font-bold font-mono text-yellow-400">{fireRiskResult.risk_summary.medium_risk_cells}</div>
                          <div className="text-[9px] text-yellow-300/70 uppercase tracking-wider font-bold">Medium</div>
                        </div>
                        <div className="bg-green-500/[0.08] border border-green-500/20 rounded-lg p-3 text-center">
                          <div className="text-lg font-bold font-mono text-green-400">{fireRiskResult.risk_summary.low_risk_cells}</div>
                          <div className="text-[9px] text-green-300/70 uppercase tracking-wider font-bold">Low Risk</div>
                        </div>
                      </div>
                    )}

                    {/* Model Metrics */}
                    {fireRiskResult.model_metrics && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Model R² Score</span>
                          <span className="font-mono font-bold text-emerald-400">{fireRiskResult.model_metrics.r2_score}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Grid Resolution</span>
                          <span className="font-mono text-slate-300">{fireRiskResult.grid_cell_size_km} km</span>
                        </div>
                      </div>
                    )}

                    {/* Feature Importances */}
                    {fireRiskResult.model_metrics?.feature_importances && (
                      <div className="space-y-1.5">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Top Features</div>
                        {Object.entries(fireRiskResult.model_metrics.feature_importances)
                          .slice(0, 5)
                          .map(([name, imp]: [string, any]) => (
                            <div key={name} className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] text-slate-300">{name.replace(/_/g, ' ')}</span>
                                  <span className="text-[10px] font-mono text-slate-400">{(imp * 100).toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                                    style={{ width: `${Math.min(imp * 300, 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* dNBR Results */}
              <AnimatePresence>
                {fireResult && fireEngine === "gee_dnbr" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-4 overflow-visible">
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Data Layers</h3>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: fireResult.severity_tiles, name: "Burn Severity (dNBR)", color: "border-orange-500", text: "text-orange-400" },
                          { id: fireResult.burned_mask_tiles, name: "Burned Area Mask", color: "border-red-500", text: "text-red-400" },
                          { id: fireResult.pre_rgb_tiles, name: "Pre-Fire True Color", color: "border-sky-500", text: "text-sky-400" },
                          { id: fireResult.post_rgb_tiles, name: "Post-Fire True Color", color: "border-sky-500", text: "text-sky-400" },
                        ].map((layer, i) => (
                          <button key={i} onClick={() => switchLayer(layer.id, layer.name)}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-xs transition-all ${
                              overlayTiles === layer.id
                                ? `bg-white/10 ${layer.color} ${layer.text} shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5'
                            }`}>
                            <Layers className="w-4 h-4" />
                            <span className="flex-1 text-left font-medium">{layer.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Severity Statistics</h3>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                        <span className="text-xs font-semibold text-red-200">Total Burned Area</span>
                        <span className="font-mono text-sm font-bold text-red-400">{fireResult.stats.total_burned_ha} <span className="text-xs text-red-500/70">ha</span></span>
                      </div>
                      <div className="space-y-3">
                        {Object.entries(fireResult.severity_classes).map(([key, cls]: [string, any]) => {
                          const area = fireResult.stats[`${key}_severity_ha`] || 0;
                          if (key === 'unburned' || area === 0) return null;
                          return (
                            <div key={key} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-sm shadow-sm" style={{ backgroundColor: cls.color }} />
                                <span className="text-slate-300 font-medium">{cls.label}</span>
                              </div>
                              <span className="font-mono text-slate-400">{area} ha</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generate Report Button */}
              {(fireResult || (firmsResult && firmsResult.total_points > 0) || fireRiskResult) && (
                <button onClick={() => setShowFireReport(true)}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide bg-gradient-to-r from-orange-500/20 to-red-500/20 backdrop-blur-sm border border-orange-500/20 text-orange-300 shadow-[0_0_30px_rgba(249,115,22,0.1)] hover:from-orange-500/30 hover:to-red-500/30 hover:text-white hover:shadow-[0_0_40px_rgba(249,115,22,0.2)] transition-all flex items-center justify-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Generate Fire Report
                </button>
              )}
            </motion.div>
          )}

          {/* SNOW TAB */}
          {activeTab === "snow" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Parameters</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Analysis Year</label>
                    <input type="number" min="2014" max={new Date().getFullYear()} value={snowYear} onChange={(e) => setSnowYear(parseInt(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer pb-2 hover:opacity-80 transition-opacity">
                      <input type="checkbox" checked={snowIncludeTrend} onChange={(e) => setSnowIncludeTrend(e.target.checked)} className="accent-cyan-500 w-3.5 h-3.5" />
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Include 10yr Trend</span>
                    </label>
                  </div>
                </div>

                {/* Advanced toggles */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Seasonal Breakdown</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">Winter / Spring / Summer / Autumn</p>
                    </div>
                    <button onClick={() => setSnowIncludeSeasonal(!snowIncludeSeasonal)}
                      className={`w-10 h-5 rounded-full transition-all duration-300 ${snowIncludeSeasonal ? 'bg-cyan-500' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${snowIncludeSeasonal ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Snow Persistence (MODIS)</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">Days/year with snow cover (500m daily)</p>
                    </div>
                    <button onClick={() => setSnowIncludePersistence(!snowIncludePersistence)}
                      className={`w-10 h-5 rounded-full transition-all duration-300 ${snowIncludePersistence ? 'bg-purple-500' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${snowIncludePersistence ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Surface Temperature (LST)</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">MODIS MOD11A1 · 1km daily · °C</p>
                    </div>
                    <button onClick={() => setSnowIncludeLst(!snowIncludeLst)}
                      className={`w-10 h-5 rounded-full transition-all duration-300 ${snowIncludeLst ? 'bg-orange-500' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${snowIncludeLst ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">8-Day Max Extent (MOD10A2)</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">Maximum snow over 8-day windows</p>
                    </div>
                    <button onClick={() => setSnowInclude8day(!snowInclude8day)}
                      className={`w-10 h-5 rounded-full transition-all duration-300 ${snowInclude8day ? 'bg-sky-500' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${snowInclude8day ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Snow Water Equivalent (ERA5)</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">ERA5-Land reanalysis · ~9km · SWE mm</p>
                    </div>
                    <button onClick={() => setSnowIncludeSwe(!snowIncludeSwe)}
                      className={`w-10 h-5 rounded-full transition-all duration-300 ${snowIncludeSwe ? 'bg-blue-500' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${snowIncludeSwe ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Sentinel-2 High-Res (10m)</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">3x sharper snow boundaries vs Landsat</p>
                    </div>
                    <button onClick={() => setSnowIncludeS2(!snowIncludeS2)}
                      className={`w-10 h-5 rounded-full transition-all duration-300 ${snowIncludeS2 ? 'bg-emerald-500' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${snowIncludeS2 ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={runSnow}
                  disabled={!selectedPolygon || loading}
                  className="w-full mt-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-cyan-900/20 disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Snowflake className="w-4 h-4" />}
                  {loading ? "Analyzing Geometry..." : "Run Snow Cover Analysis"}
                </button>
              </div>

              <AnimatePresence>
                {snowResult && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-4 overflow-visible">
                    
                    {/* Layer controls */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Data Layers</h3>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: snowResult.snow_tiles, name: "Snow Cover Extent", color: "border-cyan-500", text: "text-cyan-400" },
                          { id: snowResult.fsc_tiles, name: "Fractional Snow Cover", color: "border-sky-500", text: "text-sky-400" },
                          { id: snowResult.ndsi_tiles, name: "NDSI Heatmap", color: "border-indigo-500", text: "text-indigo-400" },
                          { id: snowResult.rgb_tiles, name: "True Color (Landsat)", color: "border-slate-500", text: "text-slate-400" },
                          snowResult.persistence?.snow_days_tiles && { id: snowResult.persistence.snow_days_tiles, name: "Snow Persistence (Days)", color: "border-purple-500", text: "text-purple-400" },
                          snowResult.lst?.lst_tiles && { id: snowResult.lst.lst_tiles, name: "Surface Temperature (°C)", color: "border-orange-500", text: "text-orange-400" },
                          snowResult.snow_8day?.snow_8day_tiles && { id: snowResult.snow_8day.snow_8day_tiles, name: "8-Day Max Extent (MOD10A2)", color: "border-sky-500", text: "text-sky-400" },
                          snowResult.era5_swe?.swe_tiles && { id: snowResult.era5_swe.swe_tiles, name: "Snow Water Equivalent (ERA5)", color: "border-blue-500", text: "text-blue-400" },
                          snowResult.sentinel2?.s2_snow_tiles && { id: snowResult.sentinel2.s2_snow_tiles, name: "Sentinel-2 Snow (10m)", color: "border-emerald-500", text: "text-emerald-400" },
                          snowResult.sentinel2?.s2_rgb_tiles && { id: snowResult.sentinel2.s2_rgb_tiles, name: "Sentinel-2 RGB (10m)", color: "border-green-500", text: "text-green-400" },
                        ].filter(Boolean).map((layer: any, i) => (
                          <button key={i} onClick={() => switchLayer(layer.id, layer.name)}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-xs transition-all ${
                              overlayTiles === layer.id
                                ? `bg-white/10 ${layer.color} ${layer.text} shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5'
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                            <span className="flex-1 text-left font-medium">{layer.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Snow Statistics ({snowResult.stats?.year})</h3>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                         <div className="bg-black/20 border border-cyan-500/20 rounded-lg p-3">
                           <div className="text-[10px] uppercase tracking-wider text-cyan-500/70 mb-1">Snow Cover</div>
                           <div className="text-lg font-mono font-bold text-cyan-400">{snowResult.stats?.snow_coverage_pct}%</div>
                         </div>
                         <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                           <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Snow Area</div>
                           <div className="text-lg font-mono text-slate-300">{snowResult.stats?.snow_area_km2} <span className="text-xs text-slate-500">km²</span></div>
                         </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[11px] px-2">
                           <span className="text-slate-500">Mean NDSI:</span>
                           <span className="font-mono text-slate-300">{snowResult.stats?.ndsi_mean} ± {snowResult.stats?.ndsi_std}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] px-2">
                           <span className="text-slate-500">Fractional Snow Cover:</span>
                           <span className="font-mono text-sky-400">{snowResult.stats?.mean_fractional_snow_cover_pct}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Snow Line Altitude */}
                    {snowResult.snow_line?.snow_line_altitude_m && (
                      <div className="bg-white/[0.02] border border-cyan-500/10 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase flex items-center gap-2">
                          <Mountain className="w-3.5 h-3.5 text-cyan-400" /> Snow Line Altitude
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-cyan-500/70 uppercase tracking-wider font-bold mb-1">SLA</div>
                            <div className="text-lg font-bold font-mono text-cyan-300">{snowResult.snow_line.snow_line_altitude_m}<span className="text-xs text-cyan-500/50 ml-0.5">m</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Median</div>
                            <div className="text-base font-mono text-slate-300">{snowResult.snow_line.median_snow_elevation_m || '—'}<span className="text-xs text-slate-500 ml-0.5">m</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Peak</div>
                            <div className="text-base font-mono text-slate-300">{snowResult.snow_line.highest_snow_m || '—'}<span className="text-xs text-slate-500 ml-0.5">m</span></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Elevation Zone Breakdown */}
                    {snowResult.elevation_zones?.length > 0 && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Snow by Elevation Zone</h3>
                        <div className="space-y-2">
                          {snowResult.elevation_zones.map((zone: any) => {
                            const maxPct = Math.max(...snowResult.elevation_zones.map((z: any) => z.snow_coverage_pct), 1);
                            const barWidth = (zone.snow_coverage_pct / maxPct) * 100;
                            return (
                              <div key={zone.label} className="group">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                                    {zone.label}
                                  </span>
                                  <span className="text-[10px] font-mono text-cyan-400">{zone.snow_coverage_pct}%</span>
                                </div>
                                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barWidth}%`, backgroundColor: zone.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Trend Chart */}
                    {snowResult.trend && snowResult.trend.length > 0 && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">10-Year Snow Trend</h3>
                        <div className="flex items-end justify-between h-28 gap-1 pt-4">
                          {snowResult.trend.map((t: any) => {
                            const maxArea = Math.max(...snowResult.trend.map((d: any) => d.area_km2));
                            const heightPct = maxArea > 0 ? (t.area_km2 / maxArea) * 100 : 0;
                            return (
                              <div key={t.year} className="flex flex-col items-center gap-1 group flex-1">
                                <span className="text-[9px] text-white/0 group-hover:text-cyan-300 font-mono transition-colors absolute -mt-5">{t.area_km2}</span>
                                <div className="w-full max-w-[12px] bg-cyan-500/30 rounded-t-sm group-hover:bg-cyan-400 transition-colors relative" style={{ height: `${Math.max(4, heightPct)}%` }} />
                                <span className="text-[8px] text-slate-500 font-mono -rotate-45 origin-top-left mt-3">{t.year}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Seasonal Breakdown */}
                    {snowResult.seasonal && snowResult.seasonal.length > 0 && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Seasonal Snow Coverage ({snowResult.stats?.year})</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {snowResult.seasonal.map((s: any) => {
                            const colors: any = { winter: '#38bdf8', spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316' };
                            return (
                              <div key={s.season} className="bg-black/20 border border-white/5 rounded-lg p-3">
                                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">{s.label}</div>
                                <div className="text-base font-bold font-mono" style={{ color: colors[s.season] || '#38bdf8' }}>{s.snow_coverage_pct}%</div>
                                <div className="text-[9px] text-slate-500 font-mono">{s.snow_area_km2} km²</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Snow Persistence (MODIS) */}
                    {snowResult.persistence?.stats?.mean_snow_days > 0 && (
                      <div className="bg-white/[0.02] border border-purple-500/10 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Snow Persistence — MODIS Daily ({snowResult.persistence.stats.year})</h3>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {[
                            { label: 'Mean Days', value: snowResult.persistence.stats.mean_snow_days, color: 'text-purple-400' },
                            { label: 'Median', value: snowResult.persistence.stats.median_snow_days, color: 'text-purple-300' },
                            { label: 'P90 Days', value: snowResult.persistence.stats.p90_snow_days, color: 'text-fuchsia-400' },
                            { label: 'Max Days', value: snowResult.persistence.stats.max_snow_days, color: 'text-pink-400' },
                          ].map(s => (
                            <div key={s.label} className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-center">
                              <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">{s.label}</div>
                              <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-[10px] px-1 text-slate-500">
                          <span>Source: MODIS MOD10A1F CGF (500m daily)</span>
                          <span className="font-mono">{snowResult.persistence.stats.total_images} images</span>
                        </div>
                      </div>
                    )}

                    {/* Surface Temperature (LST) */}
                    {snowResult.lst?.stats?.snow_mean_lst_c != null && (
                      <div className="bg-white/[0.02] border border-orange-500/10 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase flex items-center gap-2">
                          <Sun className="w-3.5 h-3.5 text-orange-400" /> Snow Surface Temperature ({snowResult.lst.stats.year})
                        </h3>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-blue-500/70 uppercase tracking-wider font-bold mb-1">Mean</div>
                            <div className="text-lg font-bold font-mono text-blue-300">{snowResult.lst.stats.snow_mean_lst_c}<span className="text-xs text-blue-500/50 ml-0.5">°C</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Min</div>
                            <div className="text-base font-mono text-cyan-300">{snowResult.lst.stats.snow_min_lst_c}<span className="text-xs text-slate-500 ml-0.5">°C</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Max</div>
                            <div className="text-base font-mono text-orange-300">{snowResult.lst.stats.snow_max_lst_c}<span className="text-xs text-slate-500 ml-0.5">°C</span></div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] px-1">
                            <span className="text-slate-500">AOI Mean Temp:</span>
                            <span className="font-mono text-slate-300">{snowResult.lst.stats.aoi_mean_lst_c}°C</span>
                          </div>
                          <div className="flex justify-between text-[10px] px-1">
                            <span className="text-slate-500">Snow vs AOI Δ:</span>
                            <span className="font-mono text-cyan-400">{(snowResult.lst.stats.snow_mean_lst_c - snowResult.lst.stats.aoi_mean_lst_c).toFixed(1)}°C</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 8-Day Max Snow Extent (MOD10A2) */}
                    {snowResult.snow_8day?.stats?.composites > 0 && (
                      <div className="bg-white/[0.02] border border-sky-500/10 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase">8-Day Max Snow Extent — MOD10A2 ({snowResult.snow_8day.stats.year})</h3>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-sky-500/70 uppercase tracking-wider font-bold mb-1">Max Extent</div>
                            <div className="text-lg font-bold font-mono text-sky-300">{snowResult.snow_8day.stats.max_extent_pct}<span className="text-xs text-sky-500/50 ml-0.5">%</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Area</div>
                            <div className="text-base font-mono text-slate-300">{snowResult.snow_8day.stats.max_extent_area_km2}<span className="text-xs text-slate-500 ml-0.5">km²</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Frequency</div>
                            <div className="text-base font-mono text-slate-300">{(snowResult.snow_8day.stats.mean_snow_frequency * 100).toFixed(1)}<span className="text-xs text-slate-500 ml-0.5">%</span></div>
                          </div>
                        </div>
                        <div className="flex justify-between text-[10px] px-1 text-slate-500">
                          <span>Source: MODIS MOD10A2 (500m, 8-day)</span>
                          <span className="font-mono">{snowResult.snow_8day.stats.composites} composites</span>
                        </div>
                      </div>
                    )}

                    {/* ERA5 Snow Water Equivalent */}
                    {snowResult.era5_swe?.stats?.mean_swe_mm > 0 && (
                      <div className="bg-white/[0.02] border border-blue-500/10 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Snow Water Equivalent — ERA5-Land ({snowResult.era5_swe.stats.year})</h3>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {[
                            { label: 'Mean SWE', value: `${snowResult.era5_swe.stats.mean_swe_mm}`, unit: 'mm', color: 'text-blue-400' },
                            { label: 'Max SWE', value: `${snowResult.era5_swe.stats.max_swe_mm}`, unit: 'mm', color: 'text-blue-300' },
                            { label: 'Peak Month', value: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][snowResult.era5_swe.stats.peak_month - 1]}`, unit: '', color: 'text-cyan-400' },
                            { label: 'Peak SWE', value: `${snowResult.era5_swe.stats.peak_swe_mm}`, unit: 'mm', color: 'text-cyan-300' },
                          ].map(s => (
                            <div key={s.label} className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-center">
                              <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">{s.label}</div>
                              <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}<span className="text-[9px] text-slate-500 ml-0.5">{s.unit}</span></div>
                            </div>
                          ))}
                        </div>
                        {/* Monthly SWE mini bar chart */}
                        {snowResult.era5_swe.monthly_swe && (
                          <div className="flex items-end gap-0.5 h-12 mt-2">
                            {snowResult.era5_swe.monthly_swe.map((m: any) => {
                              const maxM = Math.max(...snowResult.era5_swe.monthly_swe.map((x: any) => x.swe_mm), 1);
                              const h = (m.swe_mm / maxM) * 100;
                              return (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5 group">
                                  <div className="w-full bg-blue-500/30 rounded-t-sm group-hover:bg-blue-400 transition-colors" style={{ height: `${Math.max(2, h)}%` }} />
                                  <span className="text-[7px] text-slate-500 font-mono">{['J','F','M','A','M','J','J','A','S','O','N','D'][m.month-1]}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex justify-between text-[10px] px-1 text-slate-500 mt-2">
                          <span>Source: ERA5-Land (~9km daily)</span>
                          <span className="font-mono">{snowResult.era5_swe.stats.total_images} images</span>
                        </div>
                      </div>
                    )}

                    {/* Sentinel-2 High-Res Snow */}
                    {snowResult.sentinel2?.stats?.total_images > 0 && (
                      <div className="bg-white/[0.02] border border-emerald-500/10 rounded-xl p-5 mt-2">
                        <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Sentinel-2 Snow (10m) — {snowResult.sentinel2.stats.year}</h3>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-emerald-500/70 uppercase tracking-wider font-bold mb-1">Coverage</div>
                            <div className="text-lg font-bold font-mono text-emerald-300">{snowResult.sentinel2.stats.snow_coverage_pct}<span className="text-xs text-emerald-500/50 ml-0.5">%</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Snow Area</div>
                            <div className="text-base font-mono text-slate-300">{snowResult.sentinel2.stats.snow_area_km2}<span className="text-xs text-slate-500 ml-0.5">km²</span></div>
                          </div>
                          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">NDSI</div>
                            <div className="text-base font-mono text-slate-300">{snowResult.sentinel2.stats.ndsi_mean}</div>
                          </div>
                        </div>
                        <div className="flex justify-between text-[10px] px-1 text-slate-500">
                          <span>Source: Sentinel-2 SR (10m)</span>
                          <span className="font-mono">{snowResult.sentinel2.stats.total_images} images</span>
                        </div>
                      </div>
                    )}

                    {/* Generate Report Button */}
                    <button
                      onClick={() => setShowSnowReport(true)}
                      className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide bg-gradient-to-r from-cyan-500/20 to-blue-500/20 backdrop-blur-sm border border-cyan-500/20 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.1)] hover:from-cyan-500/30 hover:to-blue-500/30 hover:text-white hover:shadow-[0_0_40px_rgba(34,211,238,0.2)] transition-all flex items-center justify-center gap-2 mt-2"
                    >
                      <BarChart3 className="w-4 h-4" /> Generate Snow Report
                    </button>

                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* LANDSLIDE TAB */}
          {activeTab === "landslide" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Parameters</h3>
                
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Analysis Engine</label>
                  <CustomSelect
                    value={landslideEngine}
                    onChange={setLandslideEngine}
                    accentColor="#ef4444"
                    options={[
                      { value: "gee", label: "Heuristic / GEE (Random Forest)", icon: <ScanSearch className="w-3 h-3" />, description: "Slope, aspect & drainage analysis" },
                      { value: "xgboost", label: "XGBoost / GEE (Gradient Boosting)", icon: <Zap className="w-3 h-3" />, description: "GEE-native gradient tree boost classifier" },
                      { value: "deep_learning", label: "Landslide4Sense U-Net (Deep Learning)", icon: <BrainCircuit className="w-3 h-3" />, description: "6-channel feature segmentation" },
                    ]}
                  />
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {landslideEngine === "gee" 
                    ? "Calculates landslide susceptibility using a Random Forest model trained on variables including elevation, slope, aspect, and proximity to drainage."
                    : landslideEngine === "xgboost"
                    ? "Uses GEE-native Gradient Tree Boost (XGBoost) classifier on 9 terrain + spectral features including NDVI, NDWI, BSI, Slope, Elevation, HAND, and Precipitation."
                    : "Uses a Landslide4Sense U-Net Deep Learning model trained on a 6-channel feature set (RED/GREEN/BLUE/NDVI + SLOPE + ELEVATION)."}
                </p>

                <button
                  onClick={runLandslide}
                  disabled={!selectedPolygon || loading || isLandslideTraining}
                  className="w-full mt-2 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-rose-900/20 disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mountain className="w-4 h-4" />}
                  {loading ? "Analyzing Terrain..." : "Run Susceptibility Analysis"}
                </button>
              </div>

              <AnimatePresence>
                {landslideEngine === "deep_learning" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                    <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Teach Model (Active Learning)</h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed -mt-2">
                      Draw a polygon, select its true class, and submit it to instantly fine-tune the custom Deep Learning U-Net.
                    </p>
                    <CustomSelect
                      value={landslideTrainClass}
                      onChange={setLandslideTrainClass}
                      disabled={isLandslideTraining}
                      accentColor="#ef4444"
                      options={[
                        { value: "1", label: "Landslide / Susceptible Area", icon: <ShieldAlert className="w-3 h-3" /> },
                        { value: "0", label: "Safe / Non-Landslide Area", icon: <ShieldCheck className="w-3 h-3" /> },
                      ]}
                    />
                    <button onClick={runLandslideTraining} disabled={isLandslideTraining || !hasGeom}
                      className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                        isLandslideTraining || !hasGeom
                          ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                          : 'bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {isLandslideTraining ? "Finetuning Local U-Net..." : "Submit as Training Data"}
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="h-px bg-white/10 flex-1"></div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">OR</span>
                      <div className="h-px bg-white/10 flex-1"></div>
                    </div>

                    <button onClick={runLandslideDistill} disabled={isLandslideTraining || !hasGeom}
                      className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                        isLandslideTraining || !hasGeom
                          ? 'bg-transparent text-slate-500 cursor-not-allowed border border-white/5'
                          : 'bg-transparent text-slate-300 border border-white/10 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      Auto-Train via GEE Pipeline
                    </button>


                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {landslideResult && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-4 overflow-visible">
                    
                    {/* Layer controls */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Data Layers</h3>
                      <div className="flex flex-col gap-2">
                        {[
                          landslideResult.custom_image_b64 
                            ? { id: "local_overlay", name: "Deep Learning Prediction", color: "border-rose-500", text: "text-rose-400" }
                            : { id: landslideResult.class_tiles, name: "Risk Classification", color: "border-rose-500", text: "text-rose-400" },
                          landslideResult.probability_tiles && { id: landslideResult.probability_tiles, name: "Continuous Probability", color: "border-orange-500", text: "text-orange-400" },
                          landslideResult.slope_tiles && { id: landslideResult.slope_tiles, name: "Terrain Slope (Degrees)", color: "border-slate-500", text: "text-slate-400" },
                          landslideResult.elevation_tiles && { id: landslideResult.elevation_tiles, name: "Elevation (NASADEM)", color: "border-emerald-500", text: "text-emerald-400" },
                          landslideResult.hand_tiles && { id: landslideResult.hand_tiles, name: "Height Above Nearest Drainage", color: "border-blue-500", text: "text-blue-400" },
                          landslideResult.precip_tiles && { id: landslideResult.precip_tiles, name: "Annual Precipitation (CHIRPS)", color: "border-teal-500", text: "text-teal-400" },
                          landslideResult.temp_tiles && { id: landslideResult.temp_tiles, name: "Land Surface Temperature", color: "border-amber-500", text: "text-amber-400" },
                        ].filter(Boolean).map((layer: any, i) => (
                          <button key={i} onClick={() => switchLayer(layer.id, layer.name)}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-xs transition-all ${
                              overlayTiles === layer.id
                                ? `bg-white/10 ${layer.color} ${layer.text} shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5'
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                            <span className="flex-1 text-left font-medium">{layer.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Risk Breakdown</h3>
                      
                      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 mb-4">
                        <span className="text-xs font-semibold text-slate-300">Total Analyzed Area</span>
                        <span className="font-mono text-sm font-bold text-white">{landslideResult.stats?.total_km2} <span className="text-xs text-slate-500">km²</span></span>
                      </div>

                      <div className="space-y-3">
                        {[
                          { label: 'Very High Risk', key: 'very_high_risk_km2', color: '#ff3d5a' },
                          { label: 'High Risk', key: 'high_risk_km2', color: '#f5a623' },
                          { label: 'Moderate Risk', key: 'moderate_risk_km2', color: '#f5d623' },
                          { label: 'Low Risk', key: 'low_risk_km2', color: '#00c48c' },
                        ].map(risk => {
                          const area = landslideResult.stats?.[risk.key] || 0;
                          const pct = landslideResult.stats?.total_km2 ? (area / landslideResult.stats.total_km2) * 100 : 0;
                          return (
                            <div key={risk.key} className="flex flex-col gap-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-300 flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: risk.color }}></div>
                                  {risk.label}
                                </span>
                                <span className="font-mono text-slate-400">{area} km² ({pct.toFixed(1)}%)</span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: risk.color }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="mt-5 pt-4 border-t border-white/10 flex justify-between items-center text-[11px] text-slate-500">
                         <span>Model Accuracy ({landslideEngine === 'gee' ? 'RF' : landslideEngine === 'xgboost' ? 'XGBoost' : 'U-Net DL'}):</span>
                         <span className="font-mono text-emerald-400">{landslideResult.stats?.accuracy}%</span>
                      </div>

                      {/* Generate Report Button */}
                      <button
                        onClick={() => setShowLandslideReport(true)}
                        className="mt-3 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 flex items-center justify-center gap-2"
                      >
                        <BarChart3 className="w-3.5 h-3.5" /> Generate Report
                      </button>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* DEFORESTATION TAB */}
          {activeTab === "deforestation" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Parameters</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Start Year (2001+)</label>
                    <input type="number" min="2001" max={new Date().getFullYear() - 1} value={defStartYear} onChange={(e) => setDefStartYear(parseInt(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-green-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">End Year (≤{new Date().getFullYear() - 1})</label>
                    <input type="number" min="2001" max={new Date().getFullYear() - 1} value={defEndYear} onChange={(e) => setDefEndYear(parseInt(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-green-500/50" />
                  </div>
                </div>

                <div className="space-y-2 mt-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Min Canopy Density (%)</label>
                    <span className="text-xs font-mono text-green-400">{defMinCanopy}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={defMinCanopy} onChange={(e) => setDefMinCanopy(parseInt(e.target.value))}
                    className="w-full accent-green-500" />
                </div>

                {/* NDVI Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                  <div>
                    <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Sentinel-2 NDVI Analysis</span>
                    <p className="text-[9px] text-slate-500 mt-0.5">10m resolution temporal change detection</p>
                  </div>
                  <button onClick={() => setDefIncludeNdvi(!defIncludeNdvi)}
                    className={`w-10 h-5 rounded-full transition-all duration-300 ${defIncludeNdvi ? 'bg-green-500' : 'bg-white/10'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${defIncludeNdvi ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <AnimatePresence>
                  {defIncludeNdvi && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-3 overflow-hidden">
                      <div className="text-[10px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 font-mono">
                        ⚠️ Adds ~60s processing. Hansen is limited to 2024, but NDVI uses live Sentinel-2 data — supports up to {new Date().getFullYear()}.
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Before Year</label>
                          <input type="number" min="2017" max={new Date().getFullYear()} value={defNdviBefore} onChange={(e) => setDefNdviBefore(parseInt(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-green-500/50" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">After Year</label>
                          <input type="number" min="2017" max={new Date().getFullYear()} value={defNdviAfter} onChange={(e) => setDefNdviAfter(parseInt(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-green-500/50" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">NDVI Tree Threshold</label>
                          <span className="text-[10px] font-mono text-green-400">{defNdviThreshold}</span>
                        </div>
                        <input type="range" min="0.2" max="0.7" step="0.05" value={defNdviThreshold} onChange={(e) => setDefNdviThreshold(parseFloat(e.target.value))}
                          className="w-full accent-green-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Season Filter</label>
                        <CustomSelect
                          value={defSeason}
                          onChange={setDefSeason}
                          accentColor="#22c55e"
                          options={[
                            { value: "annual", label: "Annual (Jan–Dec)", icon: <Calendar className="w-3 h-3" /> },
                            { value: "kharif", label: "Kharif (Jun–Oct)", icon: <CloudRain className="w-3 h-3" /> },
                            { value: "rabi", label: "Rabi (Nov–Mar)", icon: <Sprout className="w-3 h-3" /> },
                            { value: "summer", label: "Summer (Mar–May)", icon: <Sun className="w-3 h-3" /> },
                            { value: "winter", label: "Winter (Dec–Feb)", icon: <Snowflake className="w-3 h-3" /> },
                          ]}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={runDeforestation}
                  disabled={!selectedPolygon || loading}
                  className="w-full mt-2 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-green-900/20 disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trees className="w-4 h-4" />}
                  {loading ? "Analyzing Geometry..." : "Run Deforestation Analysis"}
                </button>
              </div>

              <AnimatePresence>
                {deforestResult && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-4 overflow-visible">
                    
                    {/* Layer controls */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Hansen Layers</h3>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: deforestResult.combined_tiles, name: "Forest Loss + Gain (Combined)", color: "border-green-500", text: "text-green-400" },
                          { id: deforestResult.forest_loss_tiles, name: "Loss Extent Only", color: "border-red-500", text: "text-red-400" },
                          { id: deforestResult.base_forest_tiles, name: "Base Forest Extent (2000)", color: "border-emerald-700", text: "text-emerald-500" },
                          { id: deforestResult.gain_tiles, name: "Forest Gain", color: "border-cyan-500", text: "text-cyan-400" },
                        ].map((layer, i) => (
                          <button key={i} onClick={() => switchLayer(layer.id, layer.name)}
                            disabled={!layer.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-xs transition-all ${!layer.id ? 'opacity-50 cursor-not-allowed' : ''} ${
                              overlayTiles === layer.id
                                ? `bg-white/10 ${layer.color} ${layer.text} shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5'
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                            <span className="flex-1 text-left font-medium">{layer.name} {!layer.id && "(No coverage)"}</span>
                          </button>
                        ))}
                      </div>

                      {/* NDVI Layers (only if NDVI analysis was run) */}
                      {deforestResult.ndvi && (
                        <>
                          <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-3 mt-5 uppercase">Sentinel-2 NDVI Layers</h3>
                          <div className="flex flex-col gap-2">
                            {[
                              { id: deforestResult.ndvi.ndvi_before_tiles, name: `NDVI Before (${deforestResult.ndvi.before_year})`, color: "border-green-500", text: "text-green-400" },
                              { id: deforestResult.ndvi.ndvi_after_tiles, name: `NDVI After (${deforestResult.ndvi.after_year})`, color: "border-yellow-500", text: "text-yellow-400" },
                              { id: deforestResult.ndvi.ndvi_delta_tiles, name: "NDVI Change (Delta)", color: "border-orange-500", text: "text-orange-400" },
                            ].map((layer, i) => (
                              <button key={`ndvi-${i}`} onClick={() => switchLayer(layer.id, layer.name)}
                                disabled={!layer.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-xs transition-all ${!layer.id ? 'opacity-50 cursor-not-allowed' : ''} ${
                                  overlayTiles === layer.id
                                    ? `bg-white/10 ${layer.color} ${layer.text} shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                                    : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5'
                                }`}
                              >
                                <Layers className="w-4 h-4" />
                                <span className="flex-1 text-left font-medium">{layer.name}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Deforestation Statistics</h3>
                      
                      <div className="grid grid-cols-3 gap-2 mb-4">
                         <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                           <div className="text-[9px] uppercase tracking-wider text-red-500/70 mb-1">Loss</div>
                           <div className="text-base font-mono font-bold text-red-400 text-center">{deforestResult.stats?.loss_area_ha} <span className="text-[9px] text-red-500/50">ha</span></div>
                         </div>
                         <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                           <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Base</div>
                           <div className="text-base font-mono text-slate-300 text-center">{deforestResult.stats?.base_forest_area_ha} <span className="text-[9px] text-slate-500">ha</span></div>
                         </div>
                         <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                           <div className="text-[9px] uppercase tracking-wider text-emerald-500/70 mb-1">Gain</div>
                           <div className="text-base font-mono font-bold text-emerald-400 text-center">{deforestResult.stats?.gain_area_ha} <span className="text-[9px] text-emerald-500/50">ha</span></div>
                         </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                        <span className="text-xs text-slate-400">Total Loss Proportion</span>
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, deforestResult.stats?.loss_percentage)}%` }} />
                          </div>
                          <span className="font-mono text-xs font-bold text-red-400">{deforestResult.stats?.loss_percentage}%</span>
                        </div>
                      </div>

                      {deforestResult.stats?.peak_loss_year && (
                        <div className="flex items-center justify-between p-3 mt-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
                          <span className="text-xs text-slate-400">Peak Loss Year</span>
                          <span className="font-mono text-xs font-bold text-yellow-400">{deforestResult.stats.peak_loss_year} ({deforestResult.stats.avg_annual_loss_ha} ha/yr avg)</span>
                        </div>
                      )}
                      
                      <div className="mx-2 mt-4 text-[10px] text-slate-500 text-center">
                        Source: {deforestResult.stats?.source}
                      </div>
                    </div>

                    {/* Generate Report Button */}
                    <button onClick={() => setShowDeforestReport(true)}
                      className="w-full py-3.5 rounded-full text-sm font-semibold tracking-wide bg-green-500 text-black shadow-[0_0_30px_rgba(34,197,94,0.2)] hover:shadow-[0_0_40px_rgba(34,197,94,0.4)] hover:bg-green-400 transition-all flex items-center justify-center gap-2">
                      <BarChart3 className="w-4 h-4" /> Generate Deforestation Report
                    </button>

                    {/* Clear Cache Button */}
                    <button onClick={async () => {
                      try {
                        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                        await axios.delete(`${serverUrl}/api/deforestation/cache`);
                        setDeforestResult(null);
                        setOverlayTiles(null);
                        setOverlayName("");
                        alert("Cache cleared! Next analysis will fetch fresh data from GEE.");
                      } catch { alert("Failed to clear cache."); }
                    }}
                      className="group w-full py-2.5 rounded-xl text-[11px] font-semibold tracking-wider uppercase bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all duration-300 flex items-center justify-center gap-2">
                      <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-300" />
                      Clear Cached Results
                    </button>

                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* BUILDING TAB */}
          {activeTab === "building" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Parameters</h3>
                
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Analysis Engine</label>
                  <CustomSelect
                    value={buildingEngine}
                    onChange={setBuildingEngine}
                    accentColor="#a855f7"
                    options={[
                      { value: "gee", label: "Google Open Buildings V3", icon: <Globe2 className="w-3 h-3" />, description: "Pre-computed building footprints" },
                      { value: "deep_learning", label: "Custom ResU-Net (Deep Learning)", icon: <BrainCircuit className="w-3 h-3" />, description: "Local RGB segmentation model" },
                    ]}
                  />
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {buildingEngine === "gee" 
                    ? "Fetches pre-computed, highly accurate building footprints natively from Google Earth Engine's V3 Open Buildings dataset."
                    : "Uses a local Residual U-Net Deep Learning model trained to segment structures from 3-channel RGB high-resolution imagery."}
                </p>

                <button
                  onClick={runBuilding}
                  disabled={!selectedPolygon || loading || isBuildingTraining}
                  className="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-purple-900/20 disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                  {loading ? "Analyzing Infrastructure..." : "Run Building Detection"}
                </button>
              </div>

              <AnimatePresence>
                {buildingEngine === "deep_learning" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                    <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Teach Model (Active Learning)</h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed -mt-2">
                      Draw a polygon, select its true class, and submit it to instantly fine-tune the Custom U-Net.
                    </p>
                    <CustomSelect
                      value={buildingTrainClass}
                      onChange={setBuildingTrainClass}
                      disabled={isBuildingTraining}
                      accentColor="#a855f7"
                      options={[
                        { value: "1", label: "Building / Urban Area", icon: <Building2 className="w-3 h-3" /> },
                        { value: "0", label: "Empty / Bare Land", icon: <Mountain className="w-3 h-3" /> },
                      ]}
                    />
                    <button onClick={runBuildingTraining} disabled={isBuildingTraining || !hasGeom}
                      className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                        isBuildingTraining || !hasGeom
                          ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                          : 'bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {isBuildingTraining ? "Finetuning Local U-Net..." : "Submit as Training Data"}
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="h-px bg-white/10 flex-1"></div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">OR</span>
                      <div className="h-px bg-white/10 flex-1"></div>
                    </div>

                    <button onClick={runBuildingDistill} disabled={isBuildingTraining || !hasGeom}
                      className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                        isBuildingTraining || !hasGeom
                          ? 'bg-transparent text-slate-500 cursor-not-allowed border border-white/5'
                          : 'bg-transparent text-slate-300 border border-white/10 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      Auto-Train via GEE Pipeline
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="h-px bg-white/10 flex-1"></div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">OR</span>
                      <div className="h-px bg-white/10 flex-1"></div>
                    </div>

                    <button onClick={runBuildingAutoCollect} disabled={isBuildingTraining}
                      className={`w-full py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                        isBuildingTraining
                          ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                          : 'bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {isBuildingTraining ? "Collecting..." : "Auto-Collect Training Data (5 Indian Cities)"}
                    </button>
                    <p className="text-[9px] text-slate-600 text-center -mt-2">
                      Downloads imagery from Mumbai, Delhi, Pune etc. and trains automatically
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {buildingResult && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-4 overflow-visible">
                    
                    {/* Layer controls */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Data Layers</h3>
                      <div className="flex flex-col gap-2">
                        {[
                          buildingResult.custom_image_b64 
                            ? { id: "local_overlay", name: "Deep Learning Prediction", color: "border-purple-500", text: "text-purple-400" }
                            : null,
                          buildingResult.geojson 
                            ? { id: "geojson_buildings", name: "3D Buildings (Confidence Gradient)", color: "border-cyan-500", text: "text-cyan-400" }
                            : (buildingResult.tile_url ? { id: buildingResult.tile_url, name: "Building Heatmap (Confidence)", color: "border-purple-500", text: "text-purple-400" } : null),
                        ].filter(Boolean).map((layer: any, i) => (
                          <button key={i} onClick={() => switchLayer(layer.id, layer.name)}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-xs transition-all ${
                              overlayTiles === layer.id
                                ? `bg-white/10 ${layer.color} ${layer.text} shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5'
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                            <span className="flex-1 text-left font-medium">{layer.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Key Stats Cards */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gradient-to-br from-purple-500/10 to-purple-900/5 border border-purple-500/20 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-purple-300/70 uppercase tracking-widest font-bold">Buildings</p>
                        <p className="text-lg font-bold font-mono text-purple-300 mt-1">
                          {buildingResult.building_count > 0 ? buildingResult.building_count.toLocaleString() : (buildingResult.stats?.[2]?.value || 'N/A')}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-900/5 border border-cyan-500/20 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-cyan-300/70 uppercase tracking-widest font-bold">Density</p>
                        <p className="text-lg font-bold font-mono text-cyan-300 mt-1">
                          {buildingResult.density_pct ? `${buildingResult.density_pct.toFixed(1)}%` : (buildingResult.stats?.[3]?.value || 'N/A')}
                        </p>
                      </div>
                    </div>

                    {/* Density Classification Badge */}
                    {buildingResult.density_class && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center text-sm">
                          {buildingResult.density_class.includes('Ultra') ? '🏙️' : 
                           buildingResult.density_class.includes('High') ? '🏢' :
                           buildingResult.density_class.includes('Medium') ? '🏘️' :
                           buildingResult.density_class.includes('Low') ? '🏡' : '🌾'}
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Classification</p>
                          <p className="text-xs font-semibold text-white">{buildingResult.density_class}</p>
                        </div>
                      </div>
                    )}

                    {/* Confidence Mini-Bars */}
                    {buildingResult.confidence_breakdown && Object.keys(buildingResult.confidence_breakdown).length > 0 && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                        <h3 className="text-[10px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Confidence</h3>
                        <div className="flex flex-col gap-2">
                          {[['high', '#22d3ee', '≥0.8'], ['medium', '#a78bfa', '0.6-0.8'], ['low', '#64748b', '<0.6']]
                            .filter(([key]) => buildingResult.confidence_breakdown[key as string]?.count > 0)
                            .map(([key, color, range]) => {
                              const b = buildingResult.confidence_breakdown[key as string];
                              return (
                                <div key={key as string} className="flex items-center gap-2">
                                  <span className="text-[9px] text-slate-500 w-10 shrink-0 capitalize">{key as string}</span>
                                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${b.pct}%`, backgroundColor: color as string }} />
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-mono w-10 text-right">{b.pct}%</span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Detailed Stats */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                      <h3 className="text-[10px] font-mono tracking-widest text-slate-400 mb-3 uppercase">Statistics</h3>
                      <div className="flex flex-col gap-1">
                        {buildingResult.stats?.slice(0, 6).map((stat: any, index: number) => (
                          <div key={index} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                            <span className="text-[10px] text-slate-400">{stat.name}</span>
                            <span className="font-mono text-[10px] font-semibold text-white">{stat.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* View Full Report Button */}
                    <button
                      onClick={() => setShowBuildingReport(true)}
                      className="w-full py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all bg-gradient-to-r from-purple-600/20 to-cyan-600/20 border border-purple-500/30 text-purple-300 hover:from-purple-600/30 hover:to-cyan-600/30 hover:text-white flex items-center justify-center gap-2"
                    >
                      <BarChart3 className="w-4 h-4" />
                      View Full Analytical Report
                    </button>

                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* OTHER TABS — Placeholder */}
          {!["lulc", "fire", "snow", "landslide", "deforestation", "building"].includes(activeTab) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center gap-3 py-12 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                {(() => { const t = TABS.find(t => t.id === activeTab); return t ? <t.icon className="w-5 h-5 text-slate-500" /> : null; })()}
              </div>
              <span className="text-sm text-slate-400 font-medium">{TABS.find(t => t.id === activeTab)?.label}</span>
              <span className="text-[11px] text-slate-600 max-w-[200px]">This module will be available soon. Implementation in progress.</span>
            </motion.div>
          )}
        </div>
      </aside>

      {/* ═══ MAP ═══ */}
      <main className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapStyle={mapStyle as any}
          cursor="crosshair"
          maxPitch={60}
        >
          <style dangerouslySetInnerHTML={{ __html: `.mapboxgl-ctrl-group.mapboxgl-ctrl { display: none !important; }` }} />
          <NavigationControl position="bottom-right" />
          <DrawControl
            modes={modes as any} styles={DRAW_STYLES as any}
            displayControlsDefault={false} defaultMode="draw_rectangle"
            onInit={setDrawInstance} onCreate={onUpdateDraw} onUpdate={onUpdateDraw} onDelete={onDeleteDraw}
          />
        </Map>

        {/* Drawing Toolbar */}
        <div className="absolute top-6 right-6 flex flex-col gap-2 z-10 pointer-events-auto">
          <button onClick={() => handleModeChange('draw_rectangle')} title="Draw Rectangle"
            className={`p-3 rounded-full border backdrop-blur-md transition-all shadow-lg ${activeMode === 'draw_rectangle' ? 'bg-white border-white text-black scale-105' : 'bg-[#030712]/80 border-white/10 text-white hover:bg-white/10'}`}>
            <Square className="w-5 h-5" />
          </button>
          <button onClick={() => handleModeChange('draw_polygon')} title="Draw Polygon"
            className={`p-3 rounded-full border backdrop-blur-md transition-all shadow-lg ${activeMode === 'draw_polygon' ? 'bg-white border-white text-black scale-105' : 'bg-[#030712]/80 border-white/10 text-white hover:bg-white/10'}`}>
            <Hexagon className="w-5 h-5" />
          </button>

          <button onClick={handleClear} title="Clear Map"
            className="p-3 rounded-full border border-white/10 bg-[#030712]/80 backdrop-blur-md text-red-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all shadow-lg mt-2 group">
            <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Overlay Label */}
        <AnimatePresence>
          {overlayName && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-8 left-[430px] bg-[#030712]/60 backdrop-blur-3xl border border-white/10 px-6 py-3 rounded-full flex items-center gap-3 text-[11px] font-bold tracking-wider text-emerald-300 shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10 pointer-events-auto">
              <Layers className="w-3.5 h-3.5" />
              {overlayName.toUpperCase()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-4 pointer-events-auto">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                <Globe2 className="w-8 h-8 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Processing via Google Earth Engine</p>
                <p className="text-[11px] text-slate-400 mt-1">This may take 1–3 minutes for large AOIs...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* LULC Report Modal */}
      <LulcReport
        isOpen={showLulcReport}
        onClose={() => setShowLulcReport(false)}
        lulcResult={lulcResult}
        lulcYear={lulcYear}
        lulcSeason={lulcSeason}
        lulcModel={lulcModel}
        getGeometry={getGeometry}
      />

      {/* Fire Report Modal */}
      <FireReport
        isOpen={showFireReport}
        onClose={() => setShowFireReport(false)}
        fireResult={fireResult}
        fireRiskResult={fireRiskResult}
        getGeometry={getGeometry}
      />

      {/* Deforestation Report Modal */}
      <DeforestationReport
        isOpen={showDeforestReport}
        onClose={() => setShowDeforestReport(false)}
        deforestResult={deforestResult}
        getGeometry={getGeometry}
      />

      {/* Building Report Modal */}
      <BuildingReport
        isOpen={showBuildingReport}
        onClose={() => setShowBuildingReport(false)}
        buildingResult={buildingResult}
      />

      {/* Landslide Report Modal */}
      <LandslideReport
        isOpen={showLandslideReport}
        onClose={() => setShowLandslideReport(false)}
        landslideResult={landslideResult}
        engine={landslideEngine}
      />

      {/* Snow Report Modal */}
      <SnowReport
        isOpen={showSnowReport}
        onClose={() => setShowSnowReport(false)}
        snowResult={snowResult}
      />
    </div>
  );
}

export default function TerrainGuardian() {
  return (
    <Suspense fallback={
      <div className="h-screen w-full bg-[#030712] flex items-center justify-center">
        <div className="text-white/50 text-sm tracking-widest font-mono animate-pulse">LOADING MODULE...</div>
      </div>
    }>
      <TerrainGuardianInner />
    </Suspense>
  );
}

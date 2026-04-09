"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Map, { Source, Layer, NavigationControl, MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowLeft, Loader2, MapIcon, Layers, ChevronDown, Square, Hexagon, Trash2,
  TreePine, Flame, Snowflake, Mountain, Globe2, Trees, Building2
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";

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
  Crops: '#E49635', 'Shrub & Scrub': '#DFC35A', 'Built Area': '#C4281B', 'Bare Ground': '#A59B8F', 'Snow & Ice': '#B39FE1',
};

export default function TerrainGuardian() {
  const mapRef = useRef<MapRef | null>(null);
  const [viewState, setViewState] = useState({ longitude: 78.9, latitude: 22.5, zoom: 5 });

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
  const [lulcYear, setLulcYear] = useState(2024);
  const [lulcSeason, setLulcSeason] = useState("annual");
  const [lulcModel, setLulcModel] = useState("dynamic_world");
  const [lulcResult, setLulcResult] = useState<any>(null);

  // HITL Active Learning State
  const [hitlClass, setHitlClass] = useState("1");
  const [isTraining, setIsTraining] = useState(false);

  // Deforestation State
  const [defStartYear, setDefStartYear] = useState(2001);
  const [defEndYear, setDefEndYear] = useState(2023);
  const [defMinCanopy, setDefMinCanopy] = useState(20);
  const [deforestResult, setDeforestResult] = useState<any>(null);
  
  // Fire State
  const [firePreStart, setFirePreStart] = useState("2023-01-01");
  const [firePreEnd, setFirePreEnd] = useState("2023-05-01");
  const [firePostStart, setFirePostStart] = useState("2023-05-02");
  const [firePostEnd, setFirePostEnd] = useState("2023-09-01");
  const [fireResult, setFireResult] = useState<any>(null);
  
  // Snow State
  const [snowYear, setSnowYear] = useState(2024);
  const [snowIncludeTrend, setSnowIncludeTrend] = useState(true);
  const [snowResult, setSnowResult] = useState<any>(null);
  
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
        if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
          const feat = { type: "Feature" as const, properties: {}, geometry: parsed };
          setSelectedPolygon(feat);
          drawInstance.deleteAll();
          drawInstance.add(feat);
          if (mapRef.current) {
            const coords = parsed.type === 'Polygon' ? parsed.coordinates[0][0] : parsed.coordinates[0][0][0];
            mapRef.current.flyTo({ center: [coords[0], coords[1]], zoom: 10, duration: 1500 });
          }
        }
      }
    } catch { /* ignore parse error while typing */ }
  }, [geoJsonText, drawInstance]);

  const handleModeChange = (mode: string) => {
    if (drawInstance) { 
      try {
        drawInstance.changeMode(mode); 
        setActiveMode(mode); 
      } catch(e) {
        console.warn("MapboxDraw is currently unmounted or stale", e);
      }
    }
  };

  const handleClear = () => {
    if (drawInstance) {
      try {
        drawInstance.deleteAll();
      } catch(e) {
        console.warn("MapboxDraw is currently unmounted or stale", e);
      }
    }
    setSelectedPolygon(null);
    setGeoJsonText("");
    setOverlayName("");
    setLocalOverlay(null);
    setLulcResult(null);
    setFireResult(null);
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
        trend_start_year: 2014,
        trend_end_year: 2025,
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
        setOverlayName("Landslide Risk Classes");
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
      const res = await axios.post(`${serverUrl}/api/deforestation`, {
        geojson: geom,
        start_year: defStartYear,
        end_year: defEndYear,
        min_canopy: defMinCanopy,
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
            "fill-extrusion-color": "#f97316", // Beautiful vibrant orange for 3D buildings
            "fill-extrusion-height": ["+", 8, ["*", ["get", "confidence"], 12]], // Taller buildings if higher confidence
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.85
          }
        }
      ]
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

          {/* Status Pill */}
          <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${hasGeom ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[#030712]/50 border-white/10'}`}>
            <div className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasGeom ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${hasGeom ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider">{hasGeom ? 'AOI Ready' : 'Awaiting AOI'}</span>
              <span className="text-[10px] text-slate-400 font-mono">{hasGeom ? 'Ready for GEE analysis' : 'Draw a shape to begin'}</span>
            </div>
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
                Google Dynamic World — 10m Near Real-Time LULC
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Year</label>
                  <input type="number" min={2017} max={2025} value={lulcYear} onChange={(e) => setLulcYear(parseInt(e.target.value))}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-emerald-300 font-mono text-sm focus:border-emerald-500/50 focus:outline-none transition-colors" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Season</label>
                  <select value={lulcSeason} onChange={(e) => setLulcSeason(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:border-emerald-500/50 focus:outline-none transition-colors">
                    <option value="annual">Annual</option>
                    <option value="kharif">Kharif</option>
                    <option value="rabi">Rabi</option>
                    <option value="dry">Dry</option>
                    <option value="wet">Wet</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 col-span-2 mt-1">
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Model Engine</label>
                  <select value={lulcModel} onChange={(e) => setLulcModel(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sky-300 font-mono text-xs focus:border-emerald-500/50 focus:outline-none transition-colors w-full">
                    <option value="dynamic_world">☁️ Google Dynamic World (Fast Cloud API)</option>
                    <option value="custom_1dcnn">💻 Custom 1D-CNN (Local TensorFlow Processing)</option>
                  </select>
                </div>
              </div>
              
              <AnimatePresence>
                {lulcModel === "custom_1dcnn" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-[10px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 font-mono">
                    ⚠️ Running intense neural network classification via local device. Will export and bind PNG base64 frame mapping instead of dynamic Leaflet tiling.
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Run Button */}
              <button onClick={runLulc} disabled={loading || !hasGeom || isTraining}
                className={`relative group overflow-hidden flex items-center justify-center gap-3 w-full py-3.5 rounded-full font-semibold tracking-wide transition-all duration-300 text-sm ${
                  loading || !hasGeom || isTraining
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
                  <select value={hitlClass} onChange={(e) => setHitlClass(e.target.value)} disabled={isTraining}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50 appearance-none">
                    <option value="1">Water</option>
                    <option value="2">Trees</option>
                    <option value="3">Grass</option>
                    <option value="4">Flooded Vegetation</option>
                    <option value="5">Crops</option>
                    <option value="6">Shrub & Scrub</option>
                    <option value="7">Built Area</option>
                    <option value="8">Bare Ground</option>
                    <option value="9">Snow & Ice</option>
                  </select>
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
                    {/* Class area cards */}
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
                    {lulcModel !== "custom_1dcnn" && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Map Layers</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { key: 'lulc_tiles', label: 'LULC', emoji: '🗺️' },
                            { key: 'rgb_tiles', label: 'RGB', emoji: '🛰' },
                            { key: 'ndvi_tiles', label: 'NDVI', emoji: '🌿' },
                            { key: 'ndbi_tiles', label: 'NDBI', emoji: '🏗' },
                            { key: 'mndwi_tiles', label: 'MNDWI', emoji: '💧' },
                          ].map((l) => (
                            <button key={l.key} onClick={() => switchLayer(lulcResult[l.key], l.label)}
                              className={`text-[10px] px-2 py-2 rounded-lg border font-bold tracking-wider transition-all ${
                                overlayName === l.label
                                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {l.emoji} {l.label}
                            </button>
                          ))}
                        </div>

                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mt-2">Probability Heatmaps</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { key: 'built_prob_tiles', label: 'Built Area', emoji: '🏘' },
                            { key: 'trees_prob_tiles', label: 'Trees', emoji: '🌳' },
                            { key: 'crops_prob_tiles', label: 'Crops', emoji: '🌾' },
                          ].map((l) => (
                            <button key={l.key} onClick={() => switchLayer(lulcResult[l.key], l.label)}
                              className={`text-[10px] px-2 py-2 rounded-lg border font-bold tracking-wider transition-all ${
                                overlayName === l.label
                                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {l.emoji} {l.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* FIRE TAB */}
          {activeTab === "fire" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Parameters</h3>
                
                {/* Pre-Fire Dates */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Pre-Fire Period</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={firePreStart} onChange={(e) => setFirePreStart(e.target.value)}
                      className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                    <input type="date" value={firePreEnd} onChange={(e) => setFirePreEnd(e.target.value)}
                      className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                  </div>
                </div>

                {/* Post-Fire Dates */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Post-Fire Period</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={firePostStart} onChange={(e) => setFirePostStart(e.target.value)}
                      className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                    <input type="date" value={firePostEnd} onChange={(e) => setFirePostEnd(e.target.value)}
                      className="bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500/50" />
                  </div>
                </div>

                <button
                  onClick={runFire}
                  disabled={!selectedPolygon || loading}
                  className="w-full mt-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-orange-900/20 disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
                  {loading ? "Analyzing Geometry..." : "Run Burn Severity Analysis"}
                </button>
              </div>

              <AnimatePresence>
                {fireResult && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-4 overflow-visible">
                    
                    {/* Map Layers */}
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
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                            <span className="flex-1 text-left font-medium">{layer.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stats & Classes */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Severity Statistics</h3>
                      
                      {/* Total area stat */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                        <span className="text-xs font-semibold text-red-200">Total Burned Area</span>
                        <span className="font-mono text-sm font-bold text-red-400">{fireResult.stats.total_burned_ha} <span className="text-xs text-red-500/70">ha</span></span>
                      </div>

                      {/* Class breakdown */}
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
                    <input type="number" min="2014" max="2025" value={snowYear} onChange={(e) => setSnowYear(parseInt(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer pb-2 hover:opacity-80 transition-opacity">
                      <input type="checkbox" checked={snowIncludeTrend} onChange={(e) => setSnowIncludeTrend(e.target.checked)} className="accent-cyan-500 w-3.5 h-3.5" />
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Include 10yr Trend</span>
                    </label>
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
                          { id: snowResult.ndsi_tiles, name: "NDSI Heatmap", color: "border-indigo-500", text: "text-indigo-400" },
                          { id: snowResult.rgb_tiles, name: "True Color (Landsat)", color: "border-slate-500", text: "text-slate-400" },
                        ].map((layer, i) => (
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
                      <div className="flex justify-between items-center text-[11px] px-2">
                         <span className="text-slate-500">Mean NDSI:</span>
                         <span className="font-mono text-slate-300">{snowResult.stats?.ndsi_mean} ± {snowResult.stats?.ndsi_std}</span>
                      </div>
                    </div>

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
                  <select
                    value={landslideEngine}
                    onChange={(e) => setLandslideEngine(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-500/50 appearance-none"
                  >
                    <option value="gee">Heuristic / GEE (Random Forest)</option>
                    <option value="deep_learning">Landslide4Sense U-Net (Deep Learning)</option>
                  </select>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {landslideEngine === "gee" 
                    ? "Calculates landslide susceptibility using a Random Forest model trained on variables including elevation, slope, aspect, and proximity to drainage."
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
                    <select value={landslideTrainClass} onChange={(e) => setLandslideTrainClass(e.target.value)} disabled={isLandslideTraining}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-500/50 appearance-none">
                      <option value="1">Landslide / Susceptible Area</option>
                      <option value="0">Safe / Non-Landslide Area</option>
                    </select>
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
                         <span>Model Accuracy ({landslideEngine === 'gee' ? 'RF' : 'U-Net DL'}):</span>
                         <span className="font-mono text-emerald-400">{landslideResult.stats?.accuracy}%</span>
                      </div>
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
                    <input type="number" min="2001" max="2023" value={defStartYear} onChange={(e) => setDefStartYear(parseInt(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-green-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">End Year (≤2023)</label>
                    <input type="number" min="2001" max="2023" value={defEndYear} onChange={(e) => setDefEndYear(parseInt(e.target.value))}
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
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Data Layers</h3>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: deforestResult.combined_tiles, name: "Forest Loss Map (Combined)", color: "border-green-500", text: "text-green-400" },
                          { id: deforestResult.forest_loss_tiles, name: "Loss Extent Only", color: "border-red-500", text: "text-red-400" },
                          { id: deforestResult.base_forest_tiles, name: "Base Forest Extent (2000)", color: "border-emerald-700", text: "text-emerald-500" },
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
                    </div>

                    {/* Stats */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mt-2">
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Deforestation Statistics</h3>
                      
                      <div className="grid grid-cols-2 gap-3 mb-4">
                         <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                           <div className="text-[10px] uppercase tracking-wider text-red-500/70 mb-1">Loss Area</div>
                           <div className="text-lg font-mono font-bold text-red-400 text-center">{deforestResult.stats?.loss_area_ha} <span className="text-[10px] text-red-500/50">ha</span></div>
                         </div>
                         <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                           <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Base Forest</div>
                           <div className="text-lg font-mono text-slate-300 text-center">{deforestResult.stats?.base_forest_area_ha} <span className="text-[10px] text-slate-500">ha</span></div>
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
                      
                      <div className="mx-2 mt-4 text-[10px] text-slate-500 text-center">
                        Source: {deforestResult.stats?.source}
                      </div>
                    </div>

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
                  <select
                    value={buildingEngine}
                    onChange={(e) => setBuildingEngine(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 appearance-none"
                  >
                    <option value="gee">Google Open Buildings V3</option>
                    <option value="deep_learning">Custom ResU-Net (Deep Learning)</option>
                  </select>
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
                    <select value={buildingTrainClass} onChange={(e) => setBuildingTrainClass(e.target.value)} disabled={isBuildingTraining}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 appearance-none">
                      <option value="1">Building / Urban Area</option>
                      <option value="0">Empty / Bare Land</option>
                    </select>
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
                            ? { id: "geojson_buildings", name: "Google Open Buildings (3D Models)", color: "border-orange-500", text: "text-orange-400" }
                            : (buildingResult.tile_url ? { id: buildingResult.tile_url, name: "Google Open Buildings (2D Map)", color: "border-red-500", text: "text-red-400" } : null),
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
                      <h3 className="text-[11px] font-mono tracking-widest text-slate-400 mb-4 uppercase">Urban Statistics</h3>
                      
                      <div className="space-y-3">
                        {buildingResult.stats?.map((stat: any, index: number) => (
                           <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                              <span className="text-xs font-semibold text-slate-300">{stat.name}</span>
                              <span className="font-mono text-sm font-bold text-emerald-400">{stat.value}</span>
                           </div>
                        ))}
                      </div>

                    </div>

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
    </div>
  );
}

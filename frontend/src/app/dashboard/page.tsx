"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Map, { Source, Layer, NavigationControl, MapRef } from "react-map-gl/maplibre";
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowLeft, Loader2, Play, Settings2, BarChart3, AlertTriangle, ShieldCheck, Crosshair, Map as MapIcon, Layers, ChevronDown, Square, Hexagon, Trash2, Download, CheckCircle2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";

// mapbox-gl-draw imports
import MapboxDraw from "@mapbox/mapbox-gl-draw";
// @ts-ignore
import DrawRectangle from "mapbox-gl-draw-rectangle-mode";
import { useControl } from "react-map-gl/maplibre";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

// Setup custom mode
const modes = MapboxDraw.modes as any;
modes.draw_rectangle = DrawRectangle;

// High-visibility themes for drawing (cyan neon)
const DRAW_STYLES = [
  {
    id: 'gl-draw-polygon-fill-inactive',
    type: 'fill',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    paint: { 'fill-color': '#38bdf8', 'fill-outline-color': '#38bdf8', 'fill-opacity': 0.3 }
  },
  {
    id: 'gl-draw-polygon-fill-active',
    type: 'fill',
    filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
    paint: { 'fill-color': '#38bdf8', 'fill-outline-color': '#38bdf8', 'fill-opacity': 0.4 }
  },
  {
    id: 'gl-draw-polygon-midpoint',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 5, 'circle-color': '#fff' }
  },
  {
    id: 'gl-draw-polygon-stroke-inactive',
    type: 'line',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-width': 3 }
  },
  {
    id: 'gl-draw-polygon-stroke-active',
    type: 'line',
    filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-dasharray': [0.2, 2], 'line-width': 4 }
  },
  {
    id: 'gl-draw-line-inactive',
    type: 'line',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-width': 3 }
  },
  {
    id: 'gl-draw-line-active',
    type: 'line',
    filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-dasharray': [0.2, 2], 'line-width': 4 }
  },
  {
    id: 'gl-draw-polygon-and-line-vertex-stroke-inactive',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    paint: { 'circle-radius': 6, 'circle-color': '#fff' }
  },
  {
    id: 'gl-draw-polygon-and-line-vertex-inactive',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    paint: { 'circle-radius': 4, 'circle-color': '#38bdf8' }
  },
  {
    id: 'gl-draw-point-point-stroke-inactive',
    type: 'circle',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
    paint: { 'circle-radius': 6, 'circle-opacity': 1, 'circle-color': '#fff' }
  },
  {
    id: 'gl-draw-point-inactive',
    type: 'circle',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
    paint: { 'circle-radius': 4, 'circle-color': '#38bdf8' }
  },
  {
    id: 'gl-draw-point-stroke-active',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'meta', 'midpoint']],
    paint: { 'circle-radius': 8, 'circle-color': '#fff' }
  },
  {
    id: 'gl-draw-point-active',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']],
    paint: { 'circle-radius': 6, 'circle-color': '#38bdf8' }
  },
  {
    id: 'gl-draw-polygon-fill-static',
    type: 'fill',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
    paint: { 'fill-color': '#38bdf8', 'fill-outline-color': '#38bdf8', 'fill-opacity': 0.3 }
  },
  {
    id: 'gl-draw-polygon-stroke-static',
    type: 'line',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-width': 3 }
  },
  {
    id: 'gl-draw-line-static',
    type: 'line',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'LineString']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-width': 3 }
  },
  {
    id: 'gl-draw-point-static',
    type: 'circle',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
    paint: { 'circle-radius': 5, 'circle-color': '#38bdf8' }
  }
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
    ({ map }: { map: any }) => {
      map.on("draw.create", props.onCreate);
      map.on("draw.update", props.onUpdate);
      map.on("draw.delete", props.onDelete);
    },
    ({ map }: { map: any }) => {
      map.off("draw.create", props.onCreate);
      map.off("draw.update", props.onUpdate);
      map.off("draw.delete", props.onDelete);
    },
    {
      position: props.position || "top-left"
    }
  );

  useEffect(() => {
    if (draw && props.onInit) {
      props.onInit(draw);
    }
  }, [draw, props]);

  return null;
}

const MAP_STYLE = {
  version: 8 as const,
  sources: {
    "esri-imagery": {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
    },
  },
  layers: [
    {
      id: "esri-imagery-layer",
      type: "raster" as const,
      source: "esri-imagery",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const polygonStyle: FillLayerSpecification = {
  id: "data-fill",
  type: "fill",
  source: "my-data",
  paint: {
    "fill-color": [
      "match",
      ["get", "verdict"],
      "LEGAL", "#38bdf8",
      "USER_LEGAL", "#4da6ff",
      "ILLEGAL", "#f43f5e",
      "SUSPECT", "#f59e0b",
      "#4a5e72",
    ],
    "fill-opacity": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      0.8,
      0.5
    ]
  },
};

const lineStyle: LineLayerSpecification = {
  id: "data-line",
  type: "line",
  source: "my-data",
  paint: {
    "line-color": [
      "match",
      ["get", "verdict"],
      "LEGAL", "#38bdf8",
      "USER_LEGAL", "#4da6ff",
      "ILLEGAL", "#f43f5e",
      "SUSPECT", "#f59e0b",
      "#4a5e72",
    ],
    "line-width": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      4,
      2
    ]
  },
};

export default function Dashboard() {
  const mapRef = useRef<MapRef | null>(null);

  const [viewState, setViewState] = useState({
    longitude: 78.9,
    latitude: 20.5,
    zoom: 6,
  });

  const [geoData, setGeoData] = useState<any>(null);
  const [patches, setPatches] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, illegal: 0, suspect: 0, legal: 0 });
  const [selectedPolygon, setSelectedPolygon] = useState<any>(null);
  const [geoJsonText, setGeoJsonText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Custom draw controller reference
  const [drawInstance, setDrawInstance] = useState<MapboxDraw | null>(null);
  const [activeMode, setActiveMode] = useState<string>("draw_rectangle");
  
  // Analytical Dashboard States
  const [activeMineId, setActiveMineId] = useState<number | null>(null);
  const [reviewingMineId, setReviewingMineId] = useState<number | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // AbortController for cancelling the scan
  const abortControllerRef = useRef<AbortController | null>(null);

  const onUpdateDraw = useCallback((e: any) => {
    if (e.features && e.features.length > 0) {
      const feat = e.features[0];
      setSelectedPolygon(feat);
      setGeoJsonText(JSON.stringify(feat.geometry, null, 2));
      setActiveMode("simple_select"); 
    }
  }, []);

  const onDeleteDraw = useCallback(() => {
    setSelectedPolygon(null);
    setGeoJsonText("");
  }, []);

  useEffect(() => {
    try {
      if (geoJsonText && drawInstance) {
        const parsed = JSON.parse(geoJsonText);
        if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
          const feat = { type: "Feature" as const, properties: {}, geometry: parsed };
          setSelectedPolygon(feat);
          
          // Clear current drawings and draw the pasted shape
          drawInstance.deleteAll();
          drawInstance.add(feat);

          // Auto zoom to the pasted coordinates
          if (mapRef.current) {
            const coords = parsed.type === 'Polygon' ? parsed.coordinates[0][0] : parsed.coordinates[0][0][0];
            mapRef.current.flyTo({ center: [coords[0], coords[1]], zoom: 12, duration: 1500 });
          }
        }
      }
    } catch {}
  }, [geoJsonText, drawInstance]);

  const runDetection = async () => {
    if (!selectedPolygon && !geoJsonText) {
      alert("Please draw an area on the map or paste GeoJSON into the box.");
      return;
    }

    let searchGeo = selectedPolygon;
    if (!searchGeo) {
      try {
        const parsed = JSON.parse(geoJsonText);
        searchGeo = { type: "Feature", properties: {}, geometry: parsed };
      } catch (err) {
        alert("Invalid GeoJSON in text box.");
        return;
      }
    }

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setActiveMineId(null);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${serverUrl}/api/detect`, {
        geojson: searchGeo,
      }, {
        signal: abortControllerRef.current.signal
      });

      setGeoData(res.data.data);
      if (res.data.stats) setStats(res.data.stats);
      if (res.data.patches) setPatches(res.data.patches);
      
      // Auto zoom to results bounds
      if (res.data.data?.features?.length > 0 && mapRef.current) {
        const coords = res.data.data.features[0].geometry.coordinates[0][0];
        mapRef.current.flyTo({ center: [coords[0], coords[1]], zoom: 11, duration: 2000 });
      }

    } catch (err) {
      if (axios.isCancel(err)) {
        console.log("Detection scan cancelled by user.");
      } else {
        console.error(err);
        alert("Failed to run detection on backend. Is api.py running?");
      }
    }
    setLoading(false);
  };

  const handleClearMap = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (drawInstance) drawInstance.deleteAll();
    setGeoJsonText("");
    setSelectedPolygon(null);
    setGeoData(null);
    setPatches({});
    setActiveMineId(null);
    setActiveMode("simple_select");
    setLoading(false);
  };

  const handleModeChange = (mode: string) => {
    if (drawInstance) {
      drawInstance.changeMode(mode);
      setActiveMode(mode);
    }
  };

  const copyAllGeoJSON = () => {
    if (!geoData) return;
    navigator.clipboard.writeText(JSON.stringify(geoData, null, 2));
    alert("Copied complete GeoJSON to clipboard!");
  };

  const focusMine = (feat: any) => {
    setActiveMineId(feat.properties.mine_id);
    if (!mapRef.current) return;
    // Calculate centroid approx
    const rings = feat.geometry.coordinates[0];
    const avgLon = rings.reduce((s:number, p:any) => s+p[0], 0) / rings.length;
    const avgLat = rings.reduce((s:number, p:any) => s+p[1], 0) / rings.length;
    mapRef.current.flyTo({ center: [avgLon, avgLat], zoom: 15, duration: 1500 });
  };

  const handleVerifyMine = async () => {
    if (!reviewingMineId || !reviewReason) return;
    setIsVerifying(true);
    const feat = geoData.features.find((f: any) => f.properties.mine_id === reviewingMineId);
    
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      await axios.post(`${serverUrl}/api/verify`, {
        mine_id: reviewingMineId,
        geom: feat.geometry,
        area_km2: feat.properties.area_km2,
        reason: reviewReason,
        notes: reviewNotes,
        original_verdict: feat.properties.verdict
      });

      // Update local state to reflect the verification
      const newGeoData = { ...geoData };
      const updatedFeat = newGeoData.features.find((f: any) => f.properties.mine_id === reviewingMineId);
      if (updatedFeat) {
        updatedFeat.properties.verdict = 'USER_LEGAL';
      }
      setGeoData(newGeoData);
      
      const newPatches = { ...patches };
      if (newPatches[reviewingMineId]) {
        newPatches[reviewingMineId].verdict = 'USER_LEGAL';
      }
      setPatches(newPatches);
      
      // Update stats
      if (feat.properties.verdict === 'ILLEGAL') setStats(s => ({...s, illegal: s.illegal - 1, legal: s.legal + 1}));
      if (feat.properties.verdict === 'SUSPECT') setStats(s => ({...s, suspect: s.suspect - 1, legal: s.legal + 1}));

      setReviewingMineId(null);
      setReviewReason("");
      setReviewNotes("");
    } catch (err) {
      console.error(err);
      alert("Failed to verify mine to database.");
    }
    setIsVerifying(false);
  };

  return (
    <div className="h-screen w-full bg-[#030712] text-slate-200 overflow-hidden font-sans relative pointer-events-none">
      {/* Left Sidebar Floating Panel */}
      <aside className="absolute left-6 top-6 bottom-6 w-[360px] bg-[#030712]/50 backdrop-blur-3xl border border-white/10 rounded-3xl flex flex-col z-20 shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto">
        
        {/* Abstract Glowing Orb Behind Sidebar */}
        <div className="absolute top-0 left-0 w-full h-64 bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="p-6 border-b border-white/5 flex items-center justify-between relative z-10">
          <Link href="/" className="group flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10">
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
          </Link>
          <div className="font-serif text-xl font-medium tracking-[0.2em] text-white">
            EARTHWATCH
          </div>
          <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
            <Settings2 className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative z-10 custom-scrollbar">

          {/* Setup / Instructions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sky-400">
              <MapIcon className="w-4 h-4" />
              <h3 className="text-xs uppercase tracking-[0.15em] font-semibold">Area Selection</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed font-light">
              Use the <span className="text-white font-medium">Square or Polygon</span> drawing tools on the map to define an extraction zone.
            </p>
          </div>

          {/* Coordinate Status Pill */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedPolygon ? 'bg-sky-500/10 border-sky-500/20' : 'bg-[#030712]/50 border-white/10'}`}
          >
            <div className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedPolygon ? 'bg-sky-400' : 'bg-slate-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${selectedPolygon ? 'bg-sky-400' : 'bg-slate-500'}`}></span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                {selectedPolygon ? 'Target Acquired' : 'Awaiting Coordinates'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {selectedPolygon ? 'Ready for Sentinel-2 extraction' : 'Draw a shape to begin'}
              </span>
            </div>
          </motion.div>

          {/* Advanced GeoJSON Toggle */}
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors text-xs text-slate-300 font-mono"
            >
              <div className="flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5" />
                Raw GeoJSON Input
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <textarea
                    value={geoJsonText}
                    onChange={(e) => setGeoJsonText(e.target.value)}
                    className="w-full bg-[#030712]/50 border border-white/10 rounded-lg p-3 text-sky-300 font-mono text-[11px] h-32 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-all custom-scrollbar mt-1 shadow-inner"
                    placeholder={'{"type":"Polygon","coordinates":[...]}'}
                    spellCheck="false"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            {/* SCAN BUTTON */}
            <button
              onClick={runDetection}
              disabled={loading || (!selectedPolygon && !geoJsonText)}
              className={`relative group overflow-hidden flex items-center justify-center gap-3 w-full py-4 rounded-full font-semibold tracking-wide transition-all duration-300 ${
                loading || (!selectedPolygon && !geoJsonText) 
                ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10' 
                : 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:bg-slate-100 scale-100 hover:scale-[1.02]'
              }`}
            >
              {!(loading || (!selectedPolygon && !geoJsonText)) && (
                <div className="absolute inset-0 w-full h-full bg-white/40 transform skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
              )}
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
              {loading ? "Processing Scan..." : "Initiate Scan"}
            </button>

            {/* CLEAR BUTTON */}
            <button
              onClick={handleClearMap}
              disabled={loading || (!selectedPolygon && !geoJsonText && !geoData)}
              className="w-full bg-transparent border border-white/10 hover:border-white/30 hover:bg-white/5 text-slate-400 hover:text-white text-xs font-medium tracking-wide py-3 rounded-full transition-all disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:bg-transparent"
            >
              Clear Data
            </button>
          </div>

          {/* Stats Section */}
          <AnimatePresence>
            {geoData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="pt-4 mt-2 border-t border-white/10"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-slate-200">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <h3 className="text-xs uppercase tracking-[0.15em] font-semibold">Scan Results</h3>
                  </div>
                  <button onClick={copyAllGeoJSON} className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] font-mono transition-colors text-slate-300 hover:text-white">
                    <Download className="w-3 h-3" /> COPY GEOJSON
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pb-8">
                  <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex flex-col gap-1 shadow-[inset_0_0_20px_rgba(255,255,255,0.05)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-500" />
                    <BarChart3 className="w-4 h-4 text-sky-400 mb-2" />
                    <span className="text-3xl font-light tracking-tight text-white">{stats.total}</span>
                    <span className="text-[10px] text-slate-500 tracking-wider">Total Mines</span>
                  </div>

                  <div className="bg-black/40 backdrop-blur-xl border border-rose-500/20 rounded-xl p-4 flex flex-col gap-1 shadow-[inset_0_0_20px_rgba(244,63,94,0.05)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-500" />
                    <AlertTriangle className="w-4 h-4 text-rose-500 mb-2" />
                    <span className="text-3xl font-light tracking-tight text-rose-500">{stats.illegal}</span>
                    <span className="text-[10px] text-rose-500/70 tracking-wider">Illegal</span>
                  </div>

                  <div className="bg-black/40 backdrop-blur-xl border border-amber-500/20 rounded-xl p-4 flex flex-col gap-1 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-500" />
                    <div className="w-4 h-4 rounded-full border-[2px] border-amber-500 mb-2" />
                    <span className="text-3xl font-light tracking-tight text-amber-500">{stats.suspect}</span>
                    <span className="text-[10px] text-amber-500/70 tracking-wider">Suspect</span>
                  </div>

                  <div className="bg-black/40 backdrop-blur-xl border border-sky-500/20 rounded-xl p-4 flex flex-col gap-1 shadow-[inset_0_0_20px_rgba(56,189,248,0.05)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-500" />
                    <ShieldCheck className="w-4 h-4 text-sky-400 mb-2" />
                    <span className="text-3xl font-light tracking-tight text-sky-400">{stats.legal}</span>
                    <span className="text-[10px] text-sky-400/70 tracking-wider">Legal/Verified</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Map Area */}
      <main className="absolute inset-0 z-0 pointer-events-auto">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapStyle={MAP_STYLE}
          onClick={(e) => {
            // Only query 'data-fill' layer when geoData is loaded and the layer actually exists
            if (geoData && !loading) {
              const features = mapRef.current?.queryRenderedFeatures(e.point, { layers: ['data-fill'] });
              if (features && features.length > 0) {
                const mineId = features[0].properties?.mine_id;
                if (mineId) setActiveMineId(mineId);
              } else {
                if (activeMode === 'simple_select' && e.defaultPrevented !== true) setActiveMineId(null);
              }
            }
          }}
          interactiveLayerIds={(geoData && !loading) ? ['data-fill'] : undefined}
          cursor={geoData ? 'pointer' : 'crosshair'}
        >
          {/* Custom style to hide default mapbox-gl-draw controls since we made our own */}
          <style dangerouslySetInnerHTML={{__html: `
            .mapboxgl-ctrl-group.mapboxgl-ctrl { display: none !important; }
          `}} />

          <NavigationControl position="bottom-right" />
          
          <DrawControl
            modes={modes as any}
            styles={DRAW_STYLES as any}
            displayControlsDefault={false}
            defaultMode="draw_rectangle"
            onInit={setDrawInstance}
            onCreate={onUpdateDraw}
            onUpdate={onUpdateDraw}
            onDelete={onDeleteDraw}
          />

          {geoData && (
            <Source id="my-data" type="geojson" data={geoData}>
              <Layer {...polygonStyle} />
              <Layer {...lineStyle} />
            </Source>
          )}

          {/* VIZ FOR MANUALLY PASTED/DRAWN POLYGON WHEN NO GEO-DATA YET */}
          {selectedPolygon && !geoData && (
            <Source id="selected-input" type="geojson" data={selectedPolygon}>
              <Layer
                id="input-fill"
                type="fill"
                paint={{'fill-color': '#00d4aa', 'fill-opacity': 0.15}}
              />
              <Layer
                id="input-outline"
                type="line"
                paint={{'line-color': '#00d4aa', 'line-width': 2, 'line-dasharray': [2, 2]}}
              />
            </Source>
          )}

          {/* CUSTOM DRAWING TOOLBAR OVERLAY */}
          <div className="absolute top-6 right-6 flex flex-col gap-2 z-10 transition-transform">
            <button 
              onClick={() => handleModeChange('draw_rectangle')}
              title="Draw Square/Rectangle"
              className={`p-3 rounded-full border backdrop-blur-md transition-all flex items-center justify-center shadow-lg ${
                activeMode === 'draw_rectangle'
                ? 'bg-white border-white text-black scale-105'
                : 'bg-[#030712]/80 border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Square className="w-5 h-5" />
            </button>
            <button 
              onClick={() => handleModeChange('draw_polygon')}
              title="Draw Freehand Polygon"
              className={`p-3 rounded-full border backdrop-blur-md transition-all flex items-center justify-center shadow-lg ${
                activeMode === 'draw_polygon'
                ? 'bg-white border-white text-black scale-105'
                : 'bg-[#030712]/80 border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Hexagon className="w-5 h-5" />
            </button>
            <button 
              onClick={handleClearMap}
              title="Clear Map"
              className="p-3 rounded-full border border-white/10 bg-[#030712]/80 backdrop-blur-md text-red-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all shadow-lg flex items-center justify-center mt-2 group"
            >
              <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </Map>

        {/* Floating Legend - Premium Glass */}
        <div className="absolute bottom-10 left-[410px] bg-[#030712]/60 backdrop-blur-3xl border border-white/10 px-6 py-3 rounded-full flex gap-6 text-[10px] font-semibold tracking-wider text-slate-300 items-center shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10 transition-all pointer-events-auto">
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />ILLEGAL</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />SUSPECT</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.5)]" />LEGAL</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />VERIFIED</div>
        </div>
      </main>

      {/* Analytical Panel (Thumbnails + Previews + Verification) */}
      <AnimatePresence>
        {geoData && Object.keys(patches).length > 0 && (
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="w-[420px] absolute right-6 top-6 bottom-6 z-30 flex flex-col bg-[#030712]/50 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] pointer-events-auto overflow-hidden"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-serif text-lg text-white tracking-widest uppercase">Analytical Grid</h2>
              <span className="text-xs font-mono text-sky-400 bg-sky-400/10 px-3 py-1 rounded-full border border-sky-400/20">{geoData.features?.length} Detected</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              
              {/* If a mine is active, show the Detailed Preview */}
              <AnimatePresence mode="popLayout">
                {activeMineId && patches[activeMineId] && (
                  <motion.div
                    key={`preview-${activeMineId}`}
                    initial={{ opacity: 0, scale: 0.95, height: 0 }}
                    animate={{ opacity: 1, scale: 1, height: 'auto' }}
                    exit={{ opacity: 0, scale: 0.95, height: 0 }}
                    className="mb-8"
                  >
                    <div className="p-[1px] rounded-2xl bg-gradient-to-b from-white/20 to-transparent shadow-xl">
                      <div className="bg-black/40 backdrop-blur-2xl rounded-2xl overflow-hidden border border-white/5">
                        
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                          <span className="font-mono text-sm text-white font-bold">Mine #{activeMineId}</span>
                          <button onClick={() => setActiveMineId(null)} className="text-xs text-slate-400 hover:text-white">CLOSE ✕</button>
                        </div>

                        {/* High-res huge preview like old app.py */}
                        <div className="w-full h-48 relative border-b border-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={`data:image/png;base64,${patches[activeMineId].b64}`} 
                            alt={`Mine ${activeMineId} Preview`}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Stats Panel */}
                        {(() => {
                          const feat = geoData.features.find((f:any) => f.properties.mine_id === activeMineId);
                          const verdict = patches[activeMineId].verdict;
                          const vColors: Record<string, string> = { "ILLEGAL": "text-rose-500", "SUSPECT": "text-amber-500", "LEGAL": "text-sky-400", "USER_LEGAL": "text-blue-500", "UNVERIFIED": "text-slate-400" };
                          
                          return (
                            <div className="p-5 flex flex-col gap-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Classification</span>
                                  <span className={`text-sm font-bold tracking-wide ${vColors[verdict] || "text-white"}`}>{verdict}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Confidence Level</span>
                                  <span className="text-sm font-mono text-white">{(patches[activeMineId].prob * 100).toFixed(1)}%</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Intersection (IoU)</span>
                                  <span className="text-sm font-mono text-white">{feat?.properties.iou?.toFixed(3) || "N/A"}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Estimated Area</span>
                                  <span className="text-sm font-mono text-white">{feat?.properties.area_km2?.toFixed(2)} km²</span>
                                </div>
                              </div>
                              
                              <p className="text-xs text-slate-400 border-l-2 border-white/10 pl-3 leading-relaxed mt-2">
                                {feat?.properties.reason || "Under technical analysis phase."}
                              </p>

                              {/* VERIFICATION BUTTON (if illegal or suspect) */}
                              {(verdict === 'ILLEGAL' || verdict === 'SUSPECT') && (
                                <button 
                                  onClick={() => setReviewingMineId(activeMineId)}
                                  className="mt-2 flex items-center justify-center gap-2 border border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg py-3 text-xs font-bold tracking-wide transition-all"
                                >
                                  <ShieldAlert className="w-4 h-4" /> REVIEW FLAGGED MINE
                                </button>
                              )}
                              
                              {verdict === 'USER_LEGAL' && (
                                <div className="mt-2 flex items-center justify-center gap-2 border border-green-500/30 bg-green-500/10 text-green-400 rounded-lg py-3 text-xs font-bold tracking-wide">
                                  <CheckCircle2 className="w-4 h-4" /> VERIFIED LEGAL BY OFFICER
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* TILE GRID (like Streamlit 4-column but we do 2-column here to fit side panel) */}
              <div className="grid grid-cols-2 gap-3">
                {geoData.features?.map((feat: any) => {
                  const id = feat.properties.mine_id;
                  const patch = patches[id];
                  if (!patch) return null;
                  
                  const isSelected = activeMineId === id;
                  const verdict = patch.verdict;
                  const bColors: Record<string, string> = { "ILLEGAL": "border-rose-500/50 bg-rose-500/10 text-rose-500", "SUSPECT": "border-amber-500/50 bg-amber-500/10 text-amber-500", "LEGAL": "border-sky-400/50 bg-sky-400/10 text-sky-400", "USER_LEGAL": "border-blue-500/50 bg-blue-500/10 text-blue-500", "UNVERIFIED": "border-slate-500/50 bg-slate-500/10 text-slate-400" };

                  return (
                    <div 
                      key={`grid-${id}`}
                      onClick={() => focusMine(feat)}
                      className={`group cursor-pointer rounded-xl overflow-hidden border transition-all duration-300 relative ${isSelected ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}`}
                    >
                      <div className="h-24 w-full relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`data:image/png;base64,${patch.b64}`} alt={`Mine ${id}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        
                        {/* Verdict Badge */}
                        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-bold tracking-widest border backdrop-blur-md ${bColors[verdict] || bColors["UNVERIFIED"]}`}>
                          {verdict === "USER_LEGAL" ? "VERIFIED" : verdict}
                        </div>
                      </div>
                      
                      <div className="p-3 bg-black/40 backdrop-blur-md flex flex-col gap-1 border-t border-white/10">
                        <span className="text-xs font-mono font-bold text-white">Mine #{id}</span>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-slate-400 font-mono">{feat.properties.area_km2?.toFixed(2)} km²</span>
                          <span className="text-[9px] text-slate-400 font-mono">{(patch.prob * 100).toFixed(0)}% cf</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Manual Verification Modal Overlay */}
      <AnimatePresence>
        {reviewingMineId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#030712]/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f141f] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-serif tracking-wide text-white">Manual Verification</h3>
                  <button onClick={() => setReviewingMineId(null)} className="text-slate-500 hover:text-white">✕</button>
                </div>
                <p className="text-xs text-slate-400">Override the AI classification by manually linking Mine #{reviewingMineId} to an official state record.</p>
              </div>

              <div className="p-6 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Verification Reason</label>
                  <select 
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none font-mono"
                  >
                    <option value="">Select official reason...</option>
                    <option value="Official lease verified">Official lease verified</option>
                    <option value="RTI confirmed">RTI confirmed</option>
                    <option value="State Geology Dept">State Geology Dept</option>
                    <option value="Ministry of Mines registry">Ministry of Mines registry</option>
                    <option value="Field inspection">Field inspection</option>
                    <option value="Court order pending">Court order pending</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Field Notes / Lease No.</label>
                  <textarea 
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="E.g., Lease ID 1092-A, Inspected by Officer Sharma"
                    className="w-full h-24 bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500 custom-scrollbar font-sans resize-none"
                  />
                </div>
              </div>

              <div className="p-6 bg-black/20 border-t border-white/5 flex gap-3">
                <button 
                  onClick={() => setReviewingMineId(null)}
                  className="flex-1 py-3 px-4 rounded-lg bg-transparent border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/5 transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleVerifyMine}
                  disabled={!reviewReason || isVerifying}
                  className="flex-[2] flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-blue-600 text-white border border-blue-500 hover:bg-blue-500 text-xs font-bold tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
                >
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  OVERRIDE TO LEGAL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

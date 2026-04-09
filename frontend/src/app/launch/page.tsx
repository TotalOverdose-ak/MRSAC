"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe2, TreePine, Flame,
  Snowflake, Mountain, Pickaxe, ChevronRight, Satellite, X, Building2
} from "lucide-react";

const EarthGlobe = dynamic(() => import("@/components/EarthGlobe"), { ssr: false });
const SolarSystem3D = dynamic(() => import("@/components/SolarSystem3D"), { ssr: false });

// ── Module-level flag: survives client-side nav, resets on reload ──
let _hasSeenIntro = false;

// ── Feature definitions ──────────────────────────────────────
const FEATURES = [
  {
    id: "mining", title: "Mine Detection", subtitle: "AI-Powered Illegal Mining Surveillance",
    description: "Sentinel-2 + ResNet34·UNet deep learning to detect illegal mining operations.",
    icon: Pickaxe, color: "#38bdf8", gradient: "from-sky-500/20 to-sky-600/5", borderColor: "border-sky-500/30",
    href: "/dashboard", tags: ["PyTorch", "Sentinel-2", "PostGIS"],
  },
  {
    id: "lulc", title: "Land Use / Land Cover", subtitle: "Dynamic World 10m",
    description: "Near real-time LULC mapping with 9 land cover classes at 10m resolution.",
    icon: Globe2, color: "#00d4aa", gradient: "from-emerald-500/20 to-emerald-600/5", borderColor: "border-emerald-500/30",
    href: "/terrain?tab=lulc", tags: ["GEE", "Dynamic World", "10m"],
  },
  {
    id: "deforestation", title: "Deforestation Tracking", subtitle: "Hansen Global Forest Change",
    description: "Track forest cover loss from 2001-2024 at 30m resolution.",
    icon: TreePine, color: "#22c55e", gradient: "from-green-500/20 to-green-600/5", borderColor: "border-green-500/30",
    href: "/terrain?tab=deforestation", tags: ["Hansen", "30m", "Forest Loss"],
  },
  {
    id: "fire", title: "Forest Fire Analysis", subtitle: "dNBR Burn Severity",
    description: "Pre/post-fire Sentinel-2 analysis to map burn severity.",
    icon: Flame, color: "#f97316", gradient: "from-orange-500/20 to-orange-600/5", borderColor: "border-orange-500/30",
    href: "/terrain?tab=fire", tags: ["dNBR", "Sentinel-2"],
  },
  {
    id: "snow", title: "Snow & Ice Mapping", subtitle: "Landsat NDSI Analysis",
    description: "Snow and ice cover mapping with multi-year trends.",
    icon: Snowflake, color: "#38bdf8", gradient: "from-cyan-500/20 to-cyan-600/5", borderColor: "border-cyan-500/30",
    href: "/terrain?tab=snow", tags: ["NDSI", "Landsat"],
  },
  {
    id: "landslide", title: "Landslide Risk", subtitle: "Random Forest · DEM",
    description: "9-variable terrain analysis with Random Forest classifier.",
    icon: Mountain, color: "#ef4444", gradient: "from-red-500/20 to-red-600/5", borderColor: "border-red-500/30",
    href: "/terrain?tab=landslide", tags: ["RF Model", "NASADEM"],
  },
  {
    id: "building", title: "Building Detection", subtitle: "ResU-Net · Open Buildings",
    description: "Detect urban infrastructure using Custom Deep Learning and GEE.",
    icon: Building2, color: "#a855f7", gradient: "from-purple-500/20 to-purple-600/5", borderColor: "border-purple-500/30",
    href: "/terrain?tab=building", tags: ["U-Net", "GEE V3"],
  },
];

type Phase = "solar" | "zooming" | "menu";

export default function LaunchPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(_hasSeenIntro ? "menu" : "solar");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [rotateSpeed, setRotateSpeed] = useState(0);
  const activeFeature = FEATURES[selectedIdx];

  // When hovering a feature card, spin Earth for 1 second then stop
  useEffect(() => {
    if (!hoveredId) { setRotateSpeed(0); return; }
    setRotateSpeed(1.5);
    const timer = setTimeout(() => setRotateSpeed(0), 1000);
    return () => clearTimeout(timer);
  }, [hoveredId]);

  // Auto-advance solar → zooming (only on first visit)
  useEffect(() => {
    if (_hasSeenIntro) return;
    const t1 = setTimeout(() => setPhase("zooming"), 4000);
    return () => clearTimeout(t1);
  }, []);

  const handleZoomComplete = () => {
    setPhase("menu");
    _hasSeenIntro = true;
  };

  const skipToMenu = () => {
    setPhase("menu");
    _hasSeenIntro = true;
  };

  return (
    <div className="h-screen w-full bg-[#020617] text-slate-200 font-sans relative overflow-y-auto overflow-x-hidden selection:bg-sky-500/30">

      {/* ═══ PHASE 1 & 2: Three.js Solar System ═══ */}
      <AnimatePresence>
        {(phase === "solar" || phase === "zooming") && (
          <motion.div
            key="solar-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-20"
          >
            <SolarSystem3D phase={phase} onZoomComplete={handleZoomComplete} />

            {/* Overlay HUD text */}
            <AnimatePresence>
              {phase === "solar" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                  className="absolute bottom-10 left-1/2 -translate-x-1/2 text-center z-30 flex flex-col items-center gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-[1px] bg-white/20" />
                    <span className="text-[10px] tracking-[0.35em] text-white/50 font-mono uppercase">Earth Watch · Solar System</span>
                    <div className="w-10 h-[1px] bg-white/20" />
                  </div>
                  <motion.p
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="text-xs text-sky-400/70 tracking-[0.2em] font-mono flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    LOCKING ON EARTH
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            {phase === "zooming" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.8, times: [0, 0.15, 0.7, 1] }}
                className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
              >
                <div className="text-center">
                  <p className="text-xl tracking-[0.5em] text-white/90 font-serif">APPROACHING EARTH</p>
                  <div className="mt-4 w-52 h-[1px] mx-auto bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
                </div>
              </motion.div>
            )}

            {/* Skip */}
            <button onClick={skipToMenu}
              className="absolute top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] text-white/50 hover:text-white hover:bg-white/10 tracking-widest font-mono transition-all"
            >
              SKIP <ChevronRight className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PHASE 3: PLANET-STYLE FEATURE MENU ═══ */}
      <AnimatePresence>
        {phase === "menu" && (
          <>
            {/* Earth Globe — right half */}
            <motion.div
              className="fixed top-0 right-0 w-[55%] h-full z-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 0.9, x: 0 }}
              transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-[1200px] h-[1200px] translate-x-[15%]">
                <EarthGlobe rotateSpeed={rotateSpeed} />
              </div>
            </motion.div>

            {/* Dark gradient overlay — left to right for readability */}
            <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-r from-[#020617] via-[#020617]/80 to-transparent" />

            {/* Top nav bar — minimal */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-10 py-6"
            >
              <Link href="/" className="flex items-center gap-2.5 group">
                <Globe2 className="w-5 h-5 text-sky-400" />
                <span className="text-sm tracking-[0.25em] text-white/60 font-medium uppercase">EarthWatch</span>
              </Link>
              <div className="flex items-center gap-8 text-[11px] tracking-[0.15em] text-white/40 uppercase">
                <span className="text-white/20">{String(selectedIdx + 1).padStart(2, '0')} ——— {String(FEATURES.length).padStart(2, '0')}</span>
              </div>
              <Link href="/" className="flex items-center gap-2 px-4 py-2 border border-white/15 rounded-full text-[11px] text-white/50 hover:text-white hover:bg-white/5 tracking-widest transition-all">
                BACK <X className="w-3.5 h-3.5 ml-1" />
              </Link>
            </motion.div>

            {/* ── LEFT: Vertical numbered nav ── */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 1 }}
              className="fixed left-8 top-0 bottom-0 z-20 flex flex-col justify-center gap-1"
            >
              {FEATURES.map((feature, i) => {
                const isActive = selectedIdx === i;
                return (
                  <button key={feature.id}
                    onMouseEnter={() => setHoveredId(feature.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedIdx(i)}
                    className="group flex items-center gap-3 py-2.5 transition-all"
                  >
                    <div className={`h-[1px] transition-all duration-500 ${isActive ? 'w-8 bg-white' : 'w-4 bg-white/20 group-hover:w-6 group-hover:bg-white/40'}`} />
                    <span className={`text-sm font-mono transition-all duration-300 ${isActive ? 'text-white font-bold' : 'text-white/25 group-hover:text-white/50'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </button>
                );
              })}
            </motion.div>

            {/* ── CENTER: Feature details ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 1 }}
              className="fixed left-24 top-0 bottom-0 z-10 flex flex-col justify-center max-w-[480px] px-4"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col gap-6"
                >
                  {/* Feature Title */}
                  <div>
                    <h1 className="text-6xl md:text-7xl font-serif font-light text-white tracking-tight leading-none mb-4">
                      {activeFeature.title}
                    </h1>
                    <p className="text-sm text-white/50 leading-relaxed max-w-sm">
                      {activeFeature.subtitle}
                    </p>
                  </div>

                  {/* Description — quote style with left border */}
                  <div className="border-l-2 border-white/15 pl-5 py-2">
                    <p className="text-[13px] text-white/40 leading-relaxed">
                      {activeFeature.description}
                    </p>
                  </div>

                  {/* Deploy button */}
                  <motion.button
                    onClick={() => router.push(activeFeature.href)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group self-start flex items-center gap-3 px-7 py-3.5 rounded-full border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all"
                  >
                    <span className="text-sm tracking-[0.15em] text-white/80 uppercase font-medium">Deploy Module</span>
                    <ChevronRight className="w-4 h-4 text-white/40 group-hover:translate-x-1 transition-transform" />
                  </motion.button>

                  {/* Stats / Tags row — bottom */}
                  <div className="flex gap-8 pt-4 border-t border-white/10 mt-2">
                    {activeFeature.tags.map((tag: string, i: number) => (
                      <div key={tag} className="flex flex-col gap-1">
                        <span className="text-[10px] text-white/25 uppercase tracking-[0.2em] font-bold">
                          {['Source', 'Resolution', 'Method'][i] || 'Tech'}
                        </span>
                        <span className="text-xs text-white/60 font-mono">{tag}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Bottom: powered by */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 1 }}
              className="fixed bottom-6 left-24 z-20 flex items-center gap-3 text-[9px] text-white/20 font-mono tracking-widest"
            >
              <Satellite className="w-3 h-3" />
              POWERED BY GOOGLE EARTH ENGINE
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

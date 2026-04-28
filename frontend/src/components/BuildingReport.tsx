"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Printer, BarChart3, Building2, MapPinned,
  ShieldCheck, TrendingUp, Gauge, Grid3X3, Layers,
  Cpu, Globe2
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────
interface BuildingReportProps {
  isOpen: boolean;
  onClose: () => void;
  buildingResult: any;
}

// ── Confidence colors ─────────────────────────────────────────
const CONFIDENCE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  high:   { color: "#22d3ee", bg: "rgba(34,211,238,0.15)", label: "High Confidence (≥0.8)" },
  medium: { color: "#a78bfa", bg: "rgba(167,139,250,0.15)", label: "Medium Confidence (0.6–0.8)" },
  low:    { color: "#64748b", bg: "rgba(100,116,139,0.15)", label: "Low Confidence (<0.6)" },
};

// ── Density Class Styling ─────────────────────────────────────
const DENSITY_STYLES: Record<string, { icon: string; color: string; gradient: string }> = {
  "Ultra-Dense Urban Core":     { icon: "🏙️", color: "#ef4444", gradient: "from-red-600 to-orange-600" },
  "High-Density Urban":         { icon: "🏢", color: "#f97316", gradient: "from-orange-600 to-amber-500" },
  "Medium-Density Suburban":    { icon: "🏘️", color: "#eab308", gradient: "from-amber-500 to-yellow-400" },
  "Low-Density Peri-Urban":     { icon: "🏡", color: "#22c55e", gradient: "from-green-500 to-emerald-400" },
  "Rural / Sparse Settlement":  { icon: "🌾", color: "#06b6d4", gradient: "from-cyan-500 to-sky-400" },
};

// ── SVG Confidence Donut Chart ───────────────────────────────
function ConfidenceDonut({ breakdown }: { breakdown: any }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const radius = 70;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    if (!breakdown || Object.keys(breakdown).length === 0) return [];
    const total = Object.values(breakdown).reduce((s: number, b: any) => s + (b.count || 0), 0);
    if (total === 0) return [];

    let accumulated = 0;
    return ["high", "medium", "low"]
      .filter(k => breakdown[k]?.count > 0)
      .map(key => {
        const b = breakdown[key];
        const pct = b.count / total;
        const dashArray = `${pct * circumference} ${circumference}`;
        const rotation = accumulated * 360 - 90;
        accumulated += pct;
        return { key, count: b.count, pct: b.pct, dashArray, rotation };
      });
  }, [breakdown, circumference]);

  const hoveredSeg = segments.find(s => s.key === hoveredKey);

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-xs italic">
        No confidence data available
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-44 h-44 drop-shadow-lg">
        {segments.map(seg => (
          <circle
            key={seg.key}
            cx="100" cy="100" r={radius}
            fill="none"
            stroke={CONFIDENCE_COLORS[seg.key]?.color || "#555"}
            strokeWidth={hoveredKey === seg.key ? strokeWidth + 5 : strokeWidth}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={0}
            strokeLinecap="butt"
            transform={`rotate(${seg.rotation} 100 100)`}
            className="transition-all duration-300 cursor-pointer"
            style={{ opacity: hoveredKey && hoveredKey !== seg.key ? 0.3 : 1 }}
            onMouseEnter={() => setHoveredKey(seg.key)}
            onMouseLeave={() => setHoveredKey(null)}
          />
        ))}
        <text x="100" y="94" textAnchor="middle" className="fill-white text-[12px] font-bold">
          {hoveredSeg ? `${hoveredSeg.pct}%` : "Confidence"}
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-slate-400 text-[10px]">
          {hoveredSeg
            ? CONFIDENCE_COLORS[hoveredSeg.key]?.label || ""
            : "Distribution"}
        </text>
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {segments.map(seg => (
          <div
            key={seg.key}
            className="flex items-center gap-1.5 cursor-pointer transition-opacity"
            style={{ opacity: hoveredKey && hoveredKey !== seg.key ? 0.4 : 1 }}
            onMouseEnter={() => setHoveredKey(seg.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CONFIDENCE_COLORS[seg.key]?.color }} />
            <span className="text-[10px] text-slate-400 capitalize">{seg.key}</span>
            <span className="text-[10px] text-slate-500 font-mono">({seg.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Density Gauge ─────────────────────────────────────────────
function DensityGauge({ density, className: densityClass }: { density: number; className: string }) {
  const clamped = Math.min(Math.max(density, 0), 100);
  const angle = (clamped / 100) * 180 - 90; // -90 to 90 degrees
  const style = DENSITY_STYLES[densityClass] || DENSITY_STYLES["Rural / Sparse Settlement"];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 120" className="w-48 h-28">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {/* Colored arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={style.color}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${clamped * 2.51} 251.2`}
          className="transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 8px ${style.color}60)` }}
        />
        {/* Needle */}
        <line
          x1="100" y1="100"
          x2={100 + 55 * Math.cos((angle * Math.PI) / 180)}
          y2={100 + 55 * Math.sin((angle * Math.PI) / 180)}
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
        <circle cx="100" cy="100" r="4" fill="white" />
        {/* Value text */}
        <text x="100" y="88" textAnchor="middle" className="fill-white text-[18px] font-bold">
          {clamped.toFixed(1)}%
        </text>
      </svg>
      <div className="text-center">
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: style.color }}>
          {style.icon} {densityClass}
        </span>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent || '#a855f7'}15` }}>
          {icon}
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
      </div>
      <span className="text-lg font-bold font-mono text-white pl-1">{value}</span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN BUILDING REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function BuildingReport({ isOpen, onClose, buildingResult }: BuildingReportProps) {
  const handlePrint = () => window.print();

  if (!isOpen || !buildingResult) return null;

  const {
    stats = [],
    confidence_breakdown = {},
    density_class = "N/A",
    built_area_ha = 0,
    aoi_area_ha = 0,
    building_count = 0,
    density_pct = 0,
    avg_building_area_sqm = 0,
  } = buildingResult;

  const hasConfidence = confidence_breakdown && Object.keys(confidence_breakdown).length > 0;
  const densityStyle = DENSITY_STYLES[density_class] || DENSITY_STYLES["Rural / Sparse Settlement"];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-8 px-4 print:bg-white print:p-0"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl bg-[#030712]/50 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden print:shadow-none print:border-none print:max-w-none print:rounded-none relative"
            id="building-report-container"
          >
            {/* Ambient glow */}
            <div className="absolute top-0 left-0 w-full h-64 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400 print:text-purple-600" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase print:text-black">Building Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={handlePrint}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-slate-400 hover:text-white"
                  title="Print Report"><Printer className="w-4 h-4" /></button>
                <button onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 transition-colors border border-white/10 text-slate-400 hover:text-red-400"
                  title="Close Report"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* ═══ REPORT BODY ═══ */}
            <div className="relative z-10 p-5 flex flex-col gap-5">

              {/* ── Section 1: Key Metrics Grid ────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={<Building2 className="w-3.5 h-3.5 text-purple-400" />}
                  label="Buildings"
                  value={building_count > 0 ? building_count.toLocaleString() : "N/A"}
                  accent="#a855f7"
                />
                <StatCard
                  icon={<Grid3X3 className="w-3.5 h-3.5 text-cyan-400" />}
                  label="Built-Up"
                  value={`${built_area_ha.toFixed(2)} ha`}
                  accent="#06b6d4"
                />
                <StatCard
                  icon={<Gauge className="w-3.5 h-3.5 text-amber-400" />}
                  label="Density"
                  value={`${density_pct.toFixed(1)}%`}
                  accent="#f59e0b"
                />
                <StatCard
                  icon={<MapPinned className="w-3.5 h-3.5 text-emerald-400" />}
                  label="AOI Area"
                  value={`${aoi_area_ha.toFixed(2)} ha`}
                  accent="#10b981"
                />
              </div>

              {/* ── Section 2: Density Gauge + Confidence Donut ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Density Gauge */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold w-full">
                    Urban Density Classification
                  </h3>
                  <DensityGauge density={density_pct} className={density_class} />
                </div>

                {/* Confidence Distribution */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold w-full">
                    Detection Confidence
                  </h3>
                  {hasConfidence ? (
                    <ConfidenceDonut breakdown={confidence_breakdown} />
                  ) : (
                    <div className="flex items-center justify-center flex-1 text-slate-500 text-xs italic py-8">
                      Run analysis to view confidence data
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 3: Confidence Breakdown Bars ────── */}
              {hasConfidence && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-4">
                    Confidence Band Distribution
                  </h3>
                  <div className="flex flex-col gap-3">
                    {["high", "medium", "low"].filter(k => confidence_breakdown[k]?.count > 0).map(key => {
                      const b = confidence_breakdown[key];
                      const conf = CONFIDENCE_COLORS[key];
                      return (
                        <div key={key} className="group">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: conf.color }} />
                              <span className="text-[11px] text-slate-300 font-medium">{conf.label}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {b.count.toLocaleString()} <span className="text-slate-500">({b.pct}%)</span>
                            </span>
                          </div>
                          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${b.pct}%` }}
                              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                              className="h-full rounded-full group-hover:brightness-125 transition-all"
                              style={{
                                backgroundColor: conf.color,
                                boxShadow: `0 0 12px ${conf.color}40`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Section 4: Analysis Summary Table ──────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3">
                  Complete Analysis Summary
                </h3>
                <div className="flex flex-col">
                  {stats.map((stat: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] px-2 rounded transition-colors"
                    >
                      <span className="text-[11px] text-slate-400 font-medium">{stat.name}</span>
                      <span className="text-[11px] text-white font-mono font-semibold">{stat.value}</span>
                    </div>
                  ))}
                  {/* Extra derived stat */}
                  {avg_building_area_sqm > 0 && (
                    <div className="flex items-center justify-between py-2.5 px-2 rounded">
                      <span className="text-[11px] text-slate-400 font-medium">Avg. Building Footprint</span>
                      <span className="text-[11px] text-white font-mono font-semibold">{avg_building_area_sqm.toFixed(1)} m²</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 5: Map Legend ──────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3">
                  Map Visualization Legend
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-3 rounded-full overflow-hidden flex">
                    {[
                      "#1a1a2e", "#5b21b6", "#7c3aed", "#a78bfa",
                      "#06b6d4", "#22d3ee", "#67e8f9"
                    ].map((color, i) => (
                      <div key={i} className="flex-1 h-full" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-500 font-mono">Low Confidence</span>
                  <span className="text-[9px] text-slate-500 font-mono">High Confidence</span>
                </div>
                <p className="text-[9px] text-slate-600 mt-2 leading-relaxed">
                  Buildings are visualized on the map using a purple-to-cyan gradient based on their detection
                  confidence score. Higher confidence detections appear as bright cyan, while lower confidence
                  buildings appear as deep purple.
                </p>
              </div>

              {/* ── Section 6: Methodology Note ───────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" /> Methodology
                </h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Building footprints are sourced from <strong className="text-slate-300">Google Open Buildings V3</strong>,
                  which uses advanced deep learning models trained on high-resolution Maxar satellite imagery (~0.5m GSD).
                  The dataset covers over 1.8 billion buildings across Africa, South Asia, and Southeast Asia.
                  Each footprint includes a confidence score (0–1) reflecting detection certainty. Area calculations
                  use pixel-based reducers at 10m resolution via Google Earth Engine for optimal accuracy.
                </p>
              </div>

            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · Generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">
                Google Open Buildings V3 · GEE · Maxar
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

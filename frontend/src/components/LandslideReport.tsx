"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Mountain, BarChart3, ShieldAlert,
  Cpu, Target, TrendingUp, Layers, Download
} from "lucide-react";
import { useReportPDF } from "./useReportPDF";

// ── Types ────────────────────────────────────────────────────
interface LandslideReportProps {
  isOpen: boolean;
  onClose: () => void;
  landslideResult: any;
  engine: string;
}

// ── Risk colors ──────────────────────────────────────────────
const RISK_LEVELS = [
  { key: "very_high_risk_km2", label: "Very High Risk", color: "#ff3d5a", threshold: "≥ 0.65" },
  { key: "high_risk_km2",      label: "High Risk",      color: "#f5a623", threshold: "0.50–0.65" },
  { key: "moderate_risk_km2",  label: "Moderate Risk",   color: "#f5d623", threshold: "0.25–0.50" },
  { key: "low_risk_km2",       label: "Low Risk",        color: "#00c48c", threshold: "< 0.25" },
];

// ── Risk Donut Chart ─────────────────────────────────────────
function RiskDonut({ stats }: { stats: any }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 70;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    const total = Number(stats?.total_km2) || 1;
    let accumulated = 0;
    return RISK_LEVELS.map(risk => {
      const area = Number(stats?.[risk.key]) || 0;
      const pct = area / total;
      const dashArray = `${pct * circumference} ${circumference}`;
      const rotation = accumulated * 360 - 90;
      accumulated += pct;
      return { ...risk, area, pct, dashArray, rotation };
    }).filter(s => s.area > 0);
  }, [stats, circumference]);

  const hoveredSeg = segments.find(s => s.key === hovered);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 200" className="w-44 h-44 drop-shadow-lg">
        {segments.map(seg => (
          <circle
            key={seg.key}
            cx="100" cy="100" r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={hovered === seg.key ? strokeWidth + 5 : strokeWidth}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={0}
            strokeLinecap="butt"
            transform={`rotate(${seg.rotation} 100 100)`}
            className="transition-all duration-300 cursor-pointer"
            style={{ opacity: hovered && hovered !== seg.key ? 0.3 : 1 }}
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x="100" y="94" textAnchor="middle" className="fill-white text-[12px] font-bold">
          {hoveredSeg ? `${(hoveredSeg.pct * 100).toFixed(1)}%` : "Risk"}
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-slate-400 text-[10px]">
          {hoveredSeg ? `${hoveredSeg.area} km²` : "Distribution"}
        </text>
      </svg>
      <div className="flex flex-wrap gap-3 justify-center">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5 cursor-pointer transition-opacity"
            style={{ opacity: hovered && hovered !== seg.key ? 0.4 : 1 }}
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-[10px] text-slate-400">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Importance Bar Chart ─────────────────────────────────────
function ImportanceChart({ importance }: { importance: Record<string, number> }) {
  if (!importance || Object.keys(importance).length === 0) return null;
  const sorted = Object.entries(importance).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...sorted.map(([, v]) => v), 1);

  const featureColors: Record<string, string> = {
    slope: "#f5a623", elevation: "#00c48c", precipitation: "#38bdf8",
    ndvi: "#22c55e", aspect: "#a855f7", flow_acc: "#06b6d4",
    hand: "#3b82f6", tpi: "#f59e0b", dist_drainage: "#8b5cf6",
    hillshade: "#94a3b8", RED: "#ef4444", GREEN: "#22c55e",
    BLUE: "#3b82f6", NDVI: "#22c55e", SLOPE: "#f5a623", ELEVATION: "#00c48c",
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {sorted.map(([name, value]) => (
        <div key={name} className="group">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] text-slate-300 capitalize">{name.replace(/_/g, ' ')}</span>
            <span className="text-[11px] text-slate-400 font-mono">{value.toFixed(1)}%</span>
          </div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(value / maxVal) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full group-hover:brightness-125 transition-all"
              style={{ backgroundColor: featureColors[name] || "#64748b" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stat Row ─────────────────────────────────────────────────
function StatRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
          <span className="text-[11px] text-slate-300">{item.label}</span>
          <span className={`text-[11px] font-mono font-medium ${item.color || 'text-slate-200'}`}>
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN LANDSLIDE REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function LandslideReport({ isOpen, onClose, landslideResult, engine }: LandslideReportProps) {
  const { reportRef, reportId, reportTime, isExporting, downloadPDF } = useReportPDF("LSLD");
  if (!isOpen || !landslideResult) return null;

  const stats = landslideResult?.stats || {};
  const importance = landslideResult?.importance || {};
  const totalArea = Number(stats.total_km2) || 0;
  const highRiskTotal = (Number(stats.high_risk_km2) || 0) + (Number(stats.very_high_risk_km2) || 0);
  const isGEE = engine === "gee";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-8 px-4 print:bg-white print:p-0 pointer-events-auto"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl bg-[#030712]/50 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden print:shadow-none print:border-none relative"
          >
            {/* Ambient glow */}
            <div className="absolute top-0 left-0 w-full h-64 bg-red-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mountain className="w-4 h-4 text-red-400" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase">Landslide Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={downloadPDF} disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-red-500/10 hover:bg-red-500/20 transition-colors border border-red-500/20 text-red-400 hover:text-red-300 text-xs font-semibold disabled:opacity-50"
                  title="Download PDF">{isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-3.5 h-3.5" />} PDF</button>
                <button onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 transition-colors border border-white/10 text-slate-400 hover:text-red-400"
                  title="Close"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* ═══ BODY ═══ */}
            <div ref={reportRef} className="relative z-10 p-5 flex flex-col gap-5">

              {/* ── Section 1: Key Metrics Grid ─────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: <Layers className="w-3.5 h-3.5 text-sky-400" />, label: "Total Area", value: `${totalArea} km²`, color: "text-sky-400" },
                  { icon: <ShieldAlert className="w-3.5 h-3.5 text-red-500" />, label: "High Risk", value: `${highRiskTotal.toFixed(2)} km²`, color: "text-red-500" },
                  { icon: <Target className="w-3.5 h-3.5 text-emerald-400" />, label: "Accuracy", value: `${stats.accuracy || 0}%`, color: "text-emerald-400" },
                  { icon: <TrendingUp className="w-3.5 h-3.5 text-amber-400" />, label: "F1 Score", value: stats.f1 || 'N/A', color: "text-amber-400" },
                ].map(s => (
                  <div key={s.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-2">
                      {s.icon}
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                    </div>
                    <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* ── Section 2: Donut + Summary ────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold w-full">Risk Distribution</h3>
                  <RiskDonut stats={stats} />
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Analysis Summary</h3>
                  <StatRow items={[
                    { label: "Total Analyzed", value: `${totalArea} km²`, color: "text-white" },
                    { label: "Very High Risk", value: `${stats.very_high_risk_km2 || 0} km²`, color: "text-red-500" },
                    { label: "High Risk", value: `${stats.high_risk_km2 || 0} km²`, color: "text-orange-400" },
                    { label: "Moderate Risk", value: `${stats.moderate_risk_km2 || 0} km²`, color: "text-yellow-400" },
                    { label: "Low Risk", value: `${stats.low_risk_km2 || 0} km²`, color: "text-emerald-400" },
                    { label: "Engine", value: isGEE ? "GEE Random Forest" : "U-Net Deep Learning", color: "text-sky-400" },
                  ]} />
                </div>
              </div>

              {/* ── Section 3: Risk Breakdown Bars ────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-4">Risk Area Breakdown</h3>
                <div className="flex flex-col gap-3">
                  {RISK_LEVELS.map(risk => {
                    const area = Number(stats?.[risk.key]) || 0;
                    const pct = totalArea > 0 ? (area / totalArea) * 100 : 0;
                    return (
                      <div key={risk.key}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: risk.color }} />
                            <span className="text-[11px] text-slate-300">{risk.label}</span>
                            <span className="text-[8px] text-slate-500 font-mono">P {risk.threshold}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">{area} km² ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: risk.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Section 4: Feature Importance ─────────── */}
              {Object.keys(importance).length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
                    Feature Importance ({isGEE ? "Random Forest" : "U-Net Channels"})
                  </h3>
                  <ImportanceChart importance={importance} />
                </div>
              )}

              {/* ── Section 5: Model Performance ──────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3 flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  Model Performance ({isGEE ? "Random Forest" : "U-Net DL"})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Accuracy", value: `${stats.accuracy || 0}%`, color: "text-emerald-400" },
                    { label: "Precision", value: stats.precision || "N/A", color: "text-sky-400" },
                    { label: "Recall", value: stats.recall || "N/A", color: "text-amber-400" },
                    { label: "F1 Score", value: stats.f1 || "N/A", color: "text-white" },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                      <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </div>
                {isGEE && (stats.num_training_samples || stats.num_test_samples) && (
                  <div className="mt-3 flex gap-4 text-[10px] text-slate-500">
                    <span>Training Catchments: <strong className="text-slate-300">{stats.num_training_samples || 0}</strong></span>
                    <span>Test Catchments: <strong className="text-slate-300">{stats.num_test_samples || 0}</strong></span>
                  </div>
                )}
              </div>

              {/* ── Section 6: Methodology ────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" /> Model & Methodology
                </h3>
                <div className="flex flex-col gap-2 text-[10px] text-slate-400 leading-relaxed">
                  {isGEE ? (
                    <>
                      <p>
                        Susceptibility mapped using a <strong className="text-slate-300">Random Forest classifier ({50} trees)</strong> trained
                        on HydroSHEDS Level-12 catchment (slope unit) statistics. Input variables: elevation, slope, aspect,
                        precipitation (CHIRPS), and NDVI (Sentinel-2). Catchments split into high/low risk proxies by slope steepness.
                      </p>
                      <p>
                        DEM: NASA NASADEM 30m · Hydrology: MERIT Hydro · Sampling at 90m resolution ·
                        Area calculation at 500m · Catchment borders rendered as polygon overlays.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Susceptibility mapped using a <strong className="text-slate-300">Landslide4Sense U-Net</strong> deep learning model
                        with 6-channel input (RED, GREEN, BLUE, NDVI, SLOPE, ELEVATION). Pre-processing follows the Titti et al.
                        normalization: <code className="text-sky-400/80">1 - (value / (max/2))</code>.
                      </p>
                      <p>
                        Imagery: Sentinel-2 Harmonized 12-band · DEM: ALOS AW3D30 · Inference at 128×128 resolution ·
                        Dynamic contrast stretch applied for visualization.
                      </p>
                    </>
                  )}
                </div>
              </div>

            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · {reportId} · {reportTime}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">
                {isGEE ? "GEE · Random Forest · HydroSHEDS" : "Sentinel-2 · Landslide4Sense · U-Net"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

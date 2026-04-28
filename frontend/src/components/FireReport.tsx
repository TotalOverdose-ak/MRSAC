"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Flame, Loader2, Sun, Moon, Satellite, TrendingUp, TrendingDown, Minus, BarChart3, RefreshCw, BrainCircuit, Download } from "lucide-react";
import axios from "axios";
import { useReportPDF } from "./useReportPDF";

interface FireReportProps {
  isOpen: boolean;
  onClose: () => void;
  fireResult: any;
  fireRiskResult?: any;
  getGeometry: () => any;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── SVG Donut Chart (matching LULC quality) ─────────────────
function FireDonut({ stats }: { stats: any }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 80;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    const total = stats.total_fires || 1;
    const items = [
      { label: 'High Conf', value: stats.confidence_high || 0, color: '#22c55e' },
      { label: 'Medium Conf', value: stats.confidence_medium || 0, color: '#eab308' },
      { label: 'Low Conf', value: stats.confidence_low || 0, color: '#ef4444' },
    ].filter(i => i.value > 0);

    let accumulated = 0;
    return items.map(item => {
      const pct = item.value / total;
      const dashArray = `${pct * circumference} ${circumference}`;
      const rotation = accumulated * 360 - 90;
      accumulated += pct;
      return { ...item, pct, dashArray, rotation };
    });
  }, [stats, circumference]);

  const hoveredSeg = segments.find(s => s.label === hovered);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 220" className="w-48 h-48 drop-shadow-lg">
        {segments.map(seg => (
          <circle
            key={seg.label}
            cx="110" cy="110" r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={hovered === seg.label ? strokeWidth + 6 : strokeWidth}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={0}
            strokeLinecap="butt"
            transform={`rotate(${seg.rotation} 110 110)`}
            className="transition-all duration-300 cursor-pointer"
            style={{ opacity: hovered && hovered !== seg.label ? 0.3 : 1 }}
            onMouseEnter={() => setHovered(seg.label)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x="110" y="100" textAnchor="middle" className="fill-white text-[13px] font-bold">
          {hoveredSeg ? hoveredSeg.label : 'Total'}
        </text>
        <text x="110" y="120" textAnchor="middle" className="fill-slate-400 text-[11px]">
          {hoveredSeg
            ? `${hoveredSeg.value.toLocaleString()} (${(hoveredSeg.pct * 100).toFixed(1)}%)`
            : stats.total_fires.toLocaleString()}
        </text>
      </svg>
    </div>
  );
}

// ── Horizontal Bar Chart (like LULC's BarChart) ─────────────
function MonthlyBarChart({ data }: { data: Record<string, number> }) {
  const entries = MONTH_LABELS.map(m => ({ month: m, count: data[m] || 0 }));
  const maxCount = Math.max(...entries.map(e => e.count), 1);

  return (
    <div className="flex flex-col gap-2 w-full">
      {entries.map(({ month, count }) => {
        const barWidth = (count / maxCount) * 100;
        const intensity = count / maxCount;
        const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f97316' : '#fbbf24';
        return (
          <div key={month} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-slate-400 font-medium w-8">{month}</span>
              <span className="text-[11px] text-slate-300 font-mono">{count.toLocaleString()}</span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full group-hover:brightness-125 transition-all"
                style={{ backgroundColor: count > 0 ? color : 'transparent' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Yearly Trend (Horizontal bars like LULC) ────────────────
function YearlyTrendChart({ data }: { data: { year: number; count: number }[] }) {
  if (!data || data.length === 0) return null;
  const maxCount = Math.max(...data.map(d => d.count), 1);

  // Calculate trend
  const firstYear = data[0];
  const lastYear = data[data.length - 1];
  const trendPct = firstYear.count > 0
    ? ((lastYear.count - firstYear.count) / firstYear.count) * 100
    : 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Trend indicator */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
        {trendPct > 5 ? <TrendingUp className="w-4 h-4 text-red-400" /> :
         trendPct < -5 ? <TrendingDown className="w-4 h-4 text-emerald-400" /> :
         <Minus className="w-4 h-4 text-slate-500" />}
        <span className={`text-xs font-bold font-mono ${trendPct > 5 ? 'text-red-400' : trendPct < -5 ? 'text-emerald-400' : 'text-slate-400'}`}>
          {trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}% overall trend
        </span>
        <span className="text-[10px] text-slate-400 font-mono ml-auto">
          {firstYear.year}→{lastYear.year}
        </span>
      </div>

      {/* Bars */}
      {data.map((d) => {
        const barWidth = (d.count / maxCount) * 100;
        const intensity = d.count / maxCount;
        const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f97316' : '#fbbf24';
        return (
          <div key={d.year} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-slate-400 font-mono w-10">{d.year}</span>
              <span className="text-[11px] text-slate-300 font-mono">{d.count.toLocaleString()} fires</span>
            </div>
            <div className="w-full h-4 bg-white/5 rounded overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded group-hover:brightness-125 transition-all"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat Row ─────────────────────────────────────────────────
function StatRow({ items }: { items: { label: string; value: string | number; sub?: string; color?: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
          <span className="text-[11px] text-slate-300">{item.label}</span>
          <span className={`text-[11px] font-mono font-medium ${item.color || 'text-slate-200'}`}>
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
            {item.sub && <span className="text-slate-600 ml-1">{item.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN FIRE REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function FireReport({ isOpen, onClose, fireResult, fireRiskResult, getGeometry }: FireReportProps) {
  const { reportRef, reportId, reportTime, isExporting, downloadPDF } = useReportPDF("FIRE");

  const [firmsStats, setFirmsStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2025-12-31");
  const [fetched, setFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStats = async () => {
    const geom = getGeometry();
    if (!geom) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await axios.post(`${serverUrl}/api/fire/stats`, {
        geojson: geom,
        start_date: startDate,
        end_date: endDate,
      });
      setFirmsStats(res.data.stats);
      setFetched(true);
    } catch (err: any) {
      console.error("FIRMS stats failed:", err);
      setFetchError(err?.response?.data?.detail || err.message || "Failed to fetch FIRMS data");
      setFetched(true);
    }
    setIsLoading(false);
  };

  // Auto-fetch when report opens
  useEffect(() => {
    if (isOpen && !fetched && !isLoading) {
      fetchStats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const stats = firmsStats;
  const dnbrStats = fireResult?.stats;

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
            {/* Ambient glow — matches sidebar */}
            <div className="absolute top-0 left-0 w-full h-64 bg-orange-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase">Fire Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={downloadPDF} disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-orange-500/10 hover:bg-orange-500/20 transition-colors border border-orange-500/20 text-orange-400 hover:text-orange-300 text-xs font-semibold disabled:opacity-50"
                  title="Download PDF">{isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-3.5 h-3.5" />} PDF</button>
                <button onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 transition-colors border border-white/10 text-slate-400 hover:text-red-400"
                  title="Close"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div ref={reportRef} className="relative z-10 flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar">

              {/* ── dNBR Section (if available) ──────────────── */}
              {dnbrStats && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase mb-3">
                    Burn Severity Analysis (Sentinel-2 dNBR)
                  </h3>
                  <div className="flex flex-col gap-3 mb-3">
                    {/* Hero: Total Burned */}
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Total Burned Area</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">Moderate + High severity only (USGS BAER)</span>
                      </div>
                      <span className="text-2xl font-bold font-mono text-red-400">{dnbrStats.total_burned_ha} <span className="text-sm text-red-500/70">ha</span></span>
                    </div>
                    {/* 4 Severity classes */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'High Severity', value: `${dnbrStats.high_severity_ha} ha`, color: 'text-red-500' },
                        { label: 'Mod-High', value: `${dnbrStats.moderate_high_severity_ha} ha`, color: 'text-orange-500' },
                        { label: 'Moderate', value: `${dnbrStats.moderate_severity_ha} ha`, color: 'text-orange-400' },
                        { label: 'Low Severity', value: `${dnbrStats.low_severity_ha} ha`, color: 'text-yellow-400' },
                      ].map(s => (
                        <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3.5 flex flex-col gap-1">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{s.label}</span>
                          <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <StatRow items={[
                    { label: 'Pre-fire', value: dnbrStats.pre_fire_period },
                    { label: 'Post-fire', value: dnbrStats.post_fire_period },
                    { label: 'Source', value: dnbrStats.source },
                  ]} />
                </div>
              )}

              {/* ── FIRMS Stats Section ────────────────────── */}
              <div className="bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                    <Satellite className="w-3.5 h-3.5 text-orange-400" />
                    NASA FIRMS Fire History
                  </h3>
                  {fetched && (
                    <button onClick={() => { setFetched(false); fetchStats(); }}
                      className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-orange-300 transition-colors print:hidden">
                      <RefreshCw className="w-3 h-3" /> Re-fetch
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mb-3">
                  Historical fire detections from MODIS + VIIRS satellites.
                </p>

                {/* Date range picker */}
                <div className="flex items-center gap-2 mb-3 print:hidden">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-orange-300 font-mono focus:border-orange-500/50 focus:outline-none transition-colors" />
                  <span className="text-slate-500 text-xs">→</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-orange-300 font-mono focus:border-orange-500/50 focus:outline-none transition-colors" />
                </div>

                {/* Loading state */}
                {isLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-12 h-12 rounded-full border-2 border-orange-500/20 border-t-orange-400 animate-spin" />
                    <span className="text-xs text-slate-400 font-mono tracking-wider">Fetching FIRMS data...</span>
                    <span className="text-[10px] text-slate-500">Querying 17M+ satellite fire detections</span>
                  </div>
                )}

                {/* Error state */}
                {fetchError && !isLoading && (
                  <div className="flex flex-col items-center py-6 gap-2 text-center">
                    <span className="text-xs text-red-400 font-mono">{fetchError}</span>
                    <button onClick={() => { setFetched(false); setFetchError(null); fetchStats(); }}
                      className="text-[10px] text-orange-400 hover:text-orange-300 underline">
                      Retry
                    </button>
                  </div>
                )}

                {/* ── RESULTS ── */}
                {stats && stats.total_fires > 0 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 mt-4">

                    {/* Section 1: Donut + Summary (like LULC) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                        <h4 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase w-full">Confidence Distribution</h4>
                        <FireDonut stats={stats} />
                        {/* Legend */}
                        <div className="flex gap-3 mt-1">
                          {[
                            { label: 'High', color: '#22c55e' },
                            { label: 'Medium', color: '#eab308' },
                            { label: 'Low', color: '#ef4444' },
                          ].map(c => (
                            <div key={c.label} className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                              <span className="text-[10px] text-slate-400">{c.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-3">
                        <h4 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">Analysis Summary</h4>
                        <StatRow items={[
                          { label: 'Total Fires', value: stats.total_fires.toLocaleString(), color: 'text-orange-400' },
                          { label: 'Peak Month', value: stats.peak_month, color: 'text-red-400' },
                          { label: 'Avg FRP', value: `${stats.avg_frp_mw} MW`, color: 'text-yellow-400' },
                          { label: 'Max FRP', value: `${stats.max_frp_mw} MW`, color: 'text-red-500' },
                          { label: 'Avg Brightness Temp', value: `${stats.avg_brightness_k} K` },
                          { label: 'Date Range', value: `${stats.date_range?.earliest} → ${stats.date_range?.latest}` },
                        ]} />
                      </div>
                    </div>

                    {/* Day/Night Split */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h4 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase mb-3">Day / Night Distribution</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <Sun className="w-5 h-5 text-amber-400" />
                          <div className="flex flex-col">
                            <span className="text-lg font-bold font-mono text-amber-300">{stats.day_fires.toLocaleString()}</span>
                            <span className="text-[9px] text-slate-400">
                              Daytime · {Math.round(stats.day_fires / (stats.day_fires + stats.night_fires || 1) * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          <Moon className="w-5 h-5 text-blue-400" />
                          <div className="flex flex-col">
                            <span className="text-lg font-bold font-mono text-blue-300">{stats.night_fires.toLocaleString()}</span>
                            <span className="text-[9px] text-slate-400">
                              Nighttime · {Math.round(stats.night_fires / (stats.day_fires + stats.night_fires || 1) * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Monthly Chart (horizontal bars) */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                      <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">Monthly Fire Frequency</h4>
                      <MonthlyBarChart data={stats.monthly_breakdown} />
                    </div>

                    {/* Yearly trend */}
                    {stats.yearly_trend && stats.yearly_trend.length > 1 && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                        <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                          Yearly Fire Trend ({stats.date_range?.earliest?.slice(0, 4)} – {stats.date_range?.latest?.slice(0, 4)})
                        </h4>
                        <YearlyTrendChart data={stats.yearly_trend} />
                      </div>
                    )}

                    {/* Satellite breakdown */}
                    {stats.satellite_breakdown && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                        <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2">
                          <Satellite className="w-3.5 h-3.5 text-orange-400" />
                          Satellite Sources
                        </h4>
                        <div className="flex flex-col gap-2">
                          {Object.entries(stats.satellite_breakdown)
                            .sort((a, b) => (b[1] as number) - (a[1] as number))
                            .map(([sat, count]) => {
                              const maxSat = Math.max(...Object.values(stats.satellite_breakdown).map(v => v as number));
                              const barWidth = maxSat > 0 ? ((count as number) / maxSat) * 100 : 0;
                              return (
                                <div key={sat} className="group">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[11px] text-slate-400 font-mono w-16 shrink-0">{sat}</span>
                                    <span className="text-[11px] text-slate-300 font-mono">{(count as number).toLocaleString()}</span>
                                  </div>
                                  <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${barWidth}%` }}
                                      transition={{ duration: 0.8 }}
                                      className="h-full rounded-full bg-orange-500/60 group-hover:bg-orange-400 transition-colors"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {stats && stats.total_fires === 0 && (
                  <p className="text-xs text-slate-500 mt-3 italic">No fire detections found in this area/time range.</p>
                )}
              </div>
            </div>

            {/* ── ML Fire Risk Prediction Section ─────────── */}
            {fireRiskResult && fireRiskResult.model_metrics && (
              <div className="px-6 py-5">
                <div className="bg-white/[0.02] border border-red-500/10 rounded-xl p-5">
                  <h3 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <BrainCircuit className="w-3.5 h-3.5 text-red-400" /> ML Fire Risk Prediction
                  </h3>

                  {/* Model Info */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {[
                      { label: 'Algorithm', value: 'Random Forest', color: 'text-emerald-400' },
                      { label: 'R² Score', value: fireRiskResult.model_metrics.r2_score, color: 'text-emerald-400' },
                      { label: 'MAE', value: fireRiskResult.model_metrics.mae, color: 'text-yellow-400' },
                      { label: 'Training Fires', value: fireRiskResult.model_metrics.training_fires?.toLocaleString(), color: 'text-orange-400' },
                      { label: 'Grid Size', value: `${fireRiskResult.grid_cell_size_km} km`, color: 'text-slate-300' },
                      { label: 'Validation Year', value: fireRiskResult.model_metrics.validation_year, color: 'text-slate-300' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                        <span className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Risk Distribution */}
                  {fireRiskResult.risk_summary && (
                    <div className="mb-4">
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-2">Risk Distribution</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-red-500/[0.1] border border-red-500/20 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold font-mono text-red-400">{fireRiskResult.risk_summary.high_risk_cells}</div>
                          <div className="text-[8px] text-red-300/70 uppercase tracking-wider font-bold mt-1">High Risk</div>
                          <div className="text-[8px] text-slate-500 font-mono">{Math.round(fireRiskResult.risk_summary.high_risk_cells / fireRiskResult.risk_summary.total_cells * 100)}%</div>
                        </div>
                        <div className="bg-yellow-500/[0.1] border border-yellow-500/20 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold font-mono text-yellow-400">{fireRiskResult.risk_summary.medium_risk_cells}</div>
                          <div className="text-[8px] text-yellow-300/70 uppercase tracking-wider font-bold mt-1">Medium</div>
                          <div className="text-[8px] text-slate-500 font-mono">{Math.round(fireRiskResult.risk_summary.medium_risk_cells / fireRiskResult.risk_summary.total_cells * 100)}%</div>
                        </div>
                        <div className="bg-green-500/[0.1] border border-green-500/20 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold font-mono text-green-400">{fireRiskResult.risk_summary.low_risk_cells}</div>
                          <div className="text-[8px] text-green-300/70 uppercase tracking-wider font-bold mt-1">Low Risk</div>
                          <div className="text-[8px] text-slate-500 font-mono">{Math.round(fireRiskResult.risk_summary.low_risk_cells / fireRiskResult.risk_summary.total_cells * 100)}%</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feature Importances */}
                  {fireRiskResult.model_metrics.feature_importances && (
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-3">Feature Importances</div>
                      <div className="space-y-2">
                        {Object.entries(fireRiskResult.model_metrics.feature_importances)
                          .slice(0, 8)
                          .map(([name, imp]: [string, any]) => (
                            <div key={name} className="group">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-slate-300 capitalize">{name.replace(/_/g, ' ')}</span>
                                <span className="text-[10px] font-mono text-slate-400 font-bold">{(imp * 100).toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(imp * 400, 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Footer */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · {reportId} · {reportTime}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">NASA FIRMS · MODIS + VIIRS</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

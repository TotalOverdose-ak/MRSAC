"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Snowflake, Download, TrendingUp, TrendingDown, Minus, Mountain, BarChart3, Layers } from "lucide-react";
import { useReportPDF } from "./useReportPDF";

interface SnowReportProps {
  isOpen: boolean;
  onClose: () => void;
  snowResult: any;
}

// ── SVG Donut Chart — Snow vs Non-Snow ────────────────────────
function SnowDonut({ stats }: { stats: any }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 80;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    const total = stats.total_area_km2 || 1;
    const items = [
      { label: 'Snow Cover', value: stats.snow_area_km2 || 0, color: '#22d3ee' },
      { label: 'Non-Snow', value: stats.non_snow_area_km2 || 0, color: '#334155' },
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
          {hoveredSeg ? hoveredSeg.label : `${stats.snow_coverage_pct}%`}
        </text>
        <text x="110" y="120" textAnchor="middle" className="fill-slate-400 text-[11px]">
          {hoveredSeg
            ? `${hoveredSeg.value.toFixed(1)} km² (${(hoveredSeg.pct * 100).toFixed(1)}%)`
            : 'Snow Coverage'}
        </text>
      </svg>
    </div>
  );
}

// ── Elevation Zone Bar Chart ──────────────────────────────────
function ElevationBars({ zones }: { zones: any[] }) {
  if (!zones || zones.length === 0) return null;
  const maxSnow = Math.max(...zones.map(z => z.snow_coverage_pct), 1);

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {zones.map((zone) => {
        const barWidth = (zone.snow_coverage_pct / maxSnow) * 100;
        return (
          <div key={zone.label} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                <span className="text-[11px] text-slate-400 font-medium">{zone.label}</span>
              </div>
              <span className="text-[11px] text-slate-300 font-mono">
                {zone.snow_coverage_pct}% · {zone.snow_area_km2} km²
              </span>
            </div>
            <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full group-hover:brightness-125 transition-all"
                style={{ backgroundColor: zone.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Snow Trend Chart (SVG Line/Area Graph) ────────────────────
function SnowTrendChart({ data }: { data: any[] }) {
  if (!data || data.length < 2) return null;

  const firstYear = data[0];
  const lastYear = data[data.length - 1];
  const trendPct = firstYear.area_km2 > 0
    ? ((lastYear.area_km2 - firstYear.area_km2) / firstYear.area_km2) * 100
    : 0;

  // Chart dimensions
  const W = 560, H = 200, padL = 60, padR = 20, padT = 10, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const areas = data.map(d => d.area_km2);
  const minA = Math.min(...areas) * 0.85;
  const maxA = Math.max(...areas) * 1.1;

  const xScale = (i: number) => padL + (i / (data.length - 1)) * chartW;
  const yScale = (v: number) => padT + chartH - ((v - minA) / (maxA - minA || 1)) * chartH;

  // Build polyline and area paths
  const points = data.map((d, i) => `${xScale(i)},${yScale(d.area_km2)}`);
  const linePath = points.join(' ');
  const areaPath = `M${xScale(0)},${yScale(data[0].area_km2)} ${points.map((p, i) => i === 0 ? '' : `L${p}`).join(' ')} L${xScale(data.length - 1)},${padT + chartH} L${xScale(0)},${padT + chartH} Z`;

  // Y-axis ticks (5 steps)
  const yTicks = Array.from({ length: 5 }, (_, i) => minA + (i / 4) * (maxA - minA));

  // Peak/min markers
  const peakIdx = areas.indexOf(Math.max(...areas));
  const minIdx = areas.indexOf(Math.min(...areas));

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Trend indicator */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
        {trendPct > 5 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> :
         trendPct < -5 ? <TrendingDown className="w-4 h-4 text-red-400" /> :
         <Minus className="w-4 h-4 text-slate-500" />}
        <span className={`text-xs font-bold font-mono ${trendPct > 5 ? 'text-emerald-400' : trendPct < -5 ? 'text-red-400' : 'text-slate-400'}`}>
          {trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}% overall trend
        </span>
        <span className="text-[10px] text-slate-400 font-mono ml-auto">
          {firstYear.year}→{lastYear.year}
        </span>
      </div>

      {/* SVG Line/Area Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 180 }}>
        <defs>
          <linearGradient id="snowAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={padL - 6} y={yScale(v) + 4} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#snowAreaGrad)" />

        {/* Line */}
        <polyline points={linePath} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Data points */}
        {data.map((d, i) => (
          <g key={d.year}>
            <circle cx={xScale(i)} cy={yScale(d.area_km2)} r={i === peakIdx || i === minIdx ? 5 : 3.5}
              fill={i === peakIdx ? '#22d3ee' : i === minIdx ? '#f87171' : '#0f172a'} stroke="#22d3ee" strokeWidth="2" />
            {/* X-axis labels */}
            <text x={xScale(i)} y={H - padB + 18} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="monospace">
              {String(d.year).slice(-2)}
            </text>
          </g>
        ))}

        {/* Peak annotation */}
        <text x={xScale(peakIdx)} y={yScale(data[peakIdx].area_km2) - 10} textAnchor="middle" fill="#22d3ee" fontSize="8" fontFamily="monospace" fontWeight="bold">
          Peak: {data[peakIdx].area_km2} km²
        </text>
        {/* Min annotation */}
        <text x={xScale(minIdx)} y={yScale(data[minIdx].area_km2) + 16} textAnchor="middle" fill="#f87171" fontSize="8" fontFamily="monospace" fontWeight="bold">
          Min: {data[minIdx].area_km2} km²
        </text>

        {/* Y-axis label */}
        <text x="12" y={padT + chartH / 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace" transform={`rotate(-90, 12, ${padT + chartH / 2})`}>
          Snow Area (km²)
        </text>
      </svg>
    </div>
  );
}

// ── Stat Row ──────────────────────────────────────────────────
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
//  MAIN SNOW REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function SnowReport({ isOpen, onClose, snowResult }: SnowReportProps) {
  const { reportRef, reportId, reportTime, isExporting, downloadPDF } = useReportPDF("SNOW");

  if (!isOpen || !snowResult) return null;

  const stats = snowResult.stats;
  const elevationZones = snowResult.elevation_zones || [];
  const snowLine = snowResult.snow_line || {};
  const elevationStats = snowResult.elevation_stats || {};
  const trend = snowResult.trend || [];
  const seasonal = snowResult.seasonal || [];
  const persistence = snowResult.persistence || {};
  const lst = snowResult.lst || {};

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
            <div className="absolute top-0 left-0 w-full h-64 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-cyan-400" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase">Snow & Ice Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={downloadPDF} disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors border border-cyan-500/20 text-cyan-400 hover:text-cyan-300 text-xs font-semibold disabled:opacity-50"
                  title="Download PDF">{isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-3.5 h-3.5" />} PDF</button>
                <button onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 transition-colors border border-white/10 text-slate-400 hover:text-red-400"
                  title="Close"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div ref={reportRef} className="relative z-10 flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar">

              {/* ── Section 1: Coverage Overview ─────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h4 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase w-full">Snow Coverage ({stats?.year})</h4>
                  <SnowDonut stats={stats} />
                  {/* Legend */}
                  <div className="flex gap-4 mt-1">
                    {[
                      { label: 'Snow', color: '#22d3ee' },
                      { label: 'Non-Snow', color: '#334155' },
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
                    { label: 'Snow Coverage', value: `${stats?.snow_coverage_pct}%`, color: 'text-cyan-400' },
                    { label: 'Snow Area', value: `${stats?.snow_area_km2} km²`, color: 'text-cyan-300' },
                    { label: 'Non-Snow Area', value: `${stats?.non_snow_area_km2} km²` },
                    { label: 'Total Area', value: `${stats?.total_area_km2} km²` },
                    { label: 'Mean NDSI', value: `${stats?.ndsi_mean} ± ${stats?.ndsi_std}`, color: 'text-indigo-400' },
                    { label: 'NDSI Median', value: stats?.ndsi_median || '—' },
                    { label: 'Fractional Snow Cover', value: `${stats?.mean_fractional_snow_cover_pct}%`, color: 'text-sky-400' },
                  ]} />
                </div>
              </div>

              {/* ── Section 2: Snow Line Altitude ────────────── */}
              {snowLine.snow_line_altitude_m && (
                <div className="bg-white/[0.02] border border-cyan-500/10 rounded-xl p-5">
                  <h4 className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase mb-3 flex items-center gap-2">
                    <Mountain className="w-3.5 h-3.5 text-cyan-400" />
                    Snow Line Altitude (SRTM DEM)
                  </h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3.5 text-center">
                      <div className="text-[9px] text-cyan-500/70 uppercase tracking-wider font-bold mb-1">Snow Line</div>
                      <div className="text-xl font-bold font-mono text-cyan-300">{snowLine.snow_line_altitude_m}<span className="text-sm text-cyan-500/50 ml-1">m</span></div>
                      <div className="text-[8px] text-slate-500 mt-0.5">10th percentile</div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3.5 text-center">
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Median Snow</div>
                      <div className="text-lg font-bold font-mono text-slate-300">{snowLine.median_snow_elevation_m || '—'}<span className="text-sm text-slate-500 ml-1">m</span></div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3.5 text-center">
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Highest Snow</div>
                      <div className="text-lg font-bold font-mono text-slate-300">{snowLine.highest_snow_m || '—'}<span className="text-sm text-slate-500 ml-1">m</span></div>
                    </div>
                  </div>
                  {/* AOI Elevation Context */}
                  <StatRow items={[
                    { label: 'AOI Min Elevation', value: `${elevationStats.min_elevation_m} m` },
                    { label: 'AOI Max Elevation', value: `${elevationStats.max_elevation_m} m` },
                    { label: 'AOI Mean Elevation', value: `${elevationStats.mean_elevation_m} ± ${elevationStats.std_elevation_m} m` },
                  ]} />
                </div>
              )}

              {/* ── Section 3: Elevation Zone Analysis ────────── */}
              {elevationZones.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    Snow Distribution by Elevation Zone
                  </h4>
                  <ElevationBars zones={elevationZones} />
                  
                  {/* Zone detail table */}
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <div className="grid grid-cols-4 gap-1 text-[9px] text-slate-500 font-mono uppercase tracking-wider mb-2 px-1">
                      <span>Zone</span>
                      <span className="text-right">Total</span>
                      <span className="text-right">Snow</span>
                      <span className="text-right">NDSI</span>
                    </div>
                    {elevationZones.map((zone: any) => (
                      <div key={zone.label} className="grid grid-cols-4 gap-1 text-[10px] py-1.5 px-1 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <span className="text-slate-300 flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                          {zone.label}
                        </span>
                        <span className="text-right text-slate-400 font-mono">{zone.total_area_km2} km²</span>
                        <span className="text-right text-cyan-400 font-mono">{zone.snow_area_km2} km²</span>
                        <span className="text-right text-slate-400 font-mono">{zone.mean_ndsi}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Section 4: NDSI Distribution ─────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                  NDSI Statistics
                </h4>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: 'Q1 (25th)', value: stats?.ndsi_p25, color: 'text-blue-400' },
                    { label: 'Median', value: stats?.ndsi_median, color: 'text-cyan-400' },
                    { label: 'Mean', value: stats?.ndsi_mean, color: 'text-indigo-400' },
                    { label: 'Q3 (75th)', value: stats?.ndsi_p75, color: 'text-purple-400' },
                    { label: 'Std Dev', value: stats?.ndsi_std, color: 'text-slate-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 text-center">
                      <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1">{s.label}</div>
                      <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* NDSI scale bar */}
                <div className="mt-4 pt-3 border-t border-white/5">
                  <div className="text-[9px] text-slate-500 mb-2">NDSI Threshold Reference</div>
                  <div className="relative h-4 rounded-full overflow-hidden bg-gradient-to-r from-[#8B4513] via-[#808080] via-[#E0E0E0] to-[#87CEEB]">
                    <div className="absolute top-0 h-full border-l-2 border-dashed border-red-400" style={{ left: '60%' }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[8px] text-slate-500 font-mono">-0.5 (Non-snow)</span>
                    <span className="text-[8px] text-red-400 font-mono font-bold" style={{ marginLeft: '20%' }}>0.4 (Threshold)</span>
                    <span className="text-[8px] text-cyan-400 font-mono">1.0 (Snow)</span>
                  </div>
                </div>
              </div>

              {/* ── Section 5a: Seasonal Breakdown ─────────────── */}
              {seasonal.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                    Seasonal Snow Coverage ({stats?.year})
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {seasonal.map((s: any) => {
                      const colors: any = { winter: '#38bdf8', spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316' };
                      const maxPct = Math.max(...seasonal.map((x: any) => x.snow_coverage_pct), 1);
                      const barW = (s.snow_coverage_pct / maxPct) * 100;
                      return (
                        <div key={s.season} className="bg-white/[0.03] border border-white/5 rounded-xl p-3.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-slate-400 font-medium">{s.label}</span>
                            <span className="text-sm font-bold font-mono" style={{ color: colors[s.season] }}>{s.snow_coverage_pct}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${barW}%` }} transition={{ duration: 0.8 }}
                              className="h-full rounded-full" style={{ backgroundColor: colors[s.season] }} />
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono mt-1">{s.snow_area_km2} km²</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Section 5b: Snow Persistence (MODIS) ───────── */}
              {persistence?.stats?.mean_snow_days > 0 && (
                <div className="bg-white/[0.02] border border-purple-500/10 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                    Snow Persistence — MODIS Daily ({persistence.stats.year})
                  </h4>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Mean', value: persistence.stats.mean_snow_days, unit: 'days', color: 'text-purple-400' },
                      { label: 'Median', value: persistence.stats.median_snow_days, unit: 'days', color: 'text-purple-300' },
                      { label: 'P90', value: persistence.stats.p90_snow_days, unit: 'days', color: 'text-fuchsia-400' },
                      { label: 'Max', value: persistence.stats.max_snow_days, unit: 'days', color: 'text-pink-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 text-center">
                        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1">{s.label}</div>
                        <div className={`text-base font-bold font-mono ${s.color}`}>{s.value}</div>
                        <div className="text-[8px] text-slate-600">{s.unit}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-500 flex justify-between">
                    <span>Source: MODIS MOD10A1 (500m daily, 2000+)</span>
                    <span className="font-mono">{persistence.stats.total_images} images analyzed</span>
                  </div>
                </div>
              )}

              {/* ── Section 6: Multi-Year Trend ──────────────── */}
              {trend.length > 1 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                    Multi-Year Snow Cover Trend ({trend[0]?.year} – {trend[trend.length - 1]?.year})
                  </h4>
                  <SnowTrendChart data={trend} />
                </div>
              )}

              {/* ── Section 5d: Surface Temperature (LST) ──────── */}
              {lst?.stats?.snow_mean_lst_c != null && (
                <div className="bg-white/[0.02] border border-orange-500/10 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                    Snow Surface Temperature — MODIS LST ({lst.stats.year})
                  </h4>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Mean', value: `${lst.stats.snow_mean_lst_c}°C`, color: 'text-blue-400' },
                      { label: 'Min', value: `${lst.stats.snow_min_lst_c}°C`, color: 'text-cyan-400' },
                      { label: 'Max', value: `${lst.stats.snow_max_lst_c}°C`, color: 'text-orange-400' },
                      { label: 'Std Dev', value: `${lst.stats.snow_std_lst_c}°C`, color: 'text-slate-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 text-center">
                        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1">{s.label}</div>
                        <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Per-zone LST */}
                  {lst.zone_lst?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-2">Temperature by Elevation Zone</div>
                      {lst.zone_lst.map((z: any) => (
                        <div key={z.label} className="flex items-center justify-between py-1 text-[10px]">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
                            {z.label}
                          </span>
                          <span className="font-mono text-blue-300">{z.mean_lst_c}°C</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[9px] text-slate-500 mt-3 italic">⚠ LST accuracy over snow/ice is limited. Values are approximate annual means.</div>
                </div>
              )}

              {/* ── Section 7: Methodology ───────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-3">Methodology</h4>
                <div className="space-y-2.5 text-[10px] text-slate-400 leading-relaxed">
                  <p>
                    <span className="text-slate-200 font-bold">Index:</span> Normalized Difference Snow Index (NDSI) = (Green − SWIR₁) / (Green + SWIR₁). 
                    Snow strongly reflects visible light (Green band) but absorbs Short-Wave Infrared (SWIR₁), resulting in high NDSI values for snow-covered pixels.
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Data Source:</span> Landsat 8 (2013+) and Landsat 9 (2021+) Surface Reflectance — 30m spatial resolution. 
                    Cloud masking via QA_PIXEL bitwise flags (dilated clouds, cirrus, cloud, cloud shadow). Yearly median composite.
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Threshold:</span> NDSI {">"} 0.4 is the standard scientific threshold for binary snow classification (NASA/USGS standard).
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Fractional Snow Cover:</span> Linear scaling of NDSI (0 → 0%, 0.6 → 100%), providing sub-pixel snow fraction estimation.
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Elevation Analysis:</span> SRTM DEM (30m) integrated for elevation zone analysis and Snow Line Altitude (SLA) calculation.
                    SLA is computed as the 10th percentile of snow-covered pixel elevations — representing the approximate lower boundary of persistent snow cover.
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Seasonal Analysis:</span> Snow coverage computed separately for Winter (Dec–Feb), Spring (Mar–May), Summer (Jun–Aug), and Autumn (Sep–Nov) using per-season Landsat composites.
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Snow Persistence:</span> MODIS MOD10A1F Cloud-Gap-Filled daily snow cover (500m, 2000+) used to count snow-covered days per pixel per year. CGF algorithm fills cloud-obscured pixels with most recent clear-sky observation.
                  </p>
                  <p>
                    <span className="text-slate-200 font-bold">Surface Temperature:</span> MODIS MOD11A1 Land Surface Temperature (1km daily). Converted from Kelvin using scale factor 0.02, then offset by -273.15 to °C. Masked to snow-covered areas. Note: LST accuracy over high-albedo surfaces is limited.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · {reportId} · {reportTime}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">Landsat 8/9 · SRTM DEM · GEE</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

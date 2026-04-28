"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, TreePine, TrendingUp, TrendingDown, Minus, Download } from "lucide-react";
import { useReportPDF } from "./useReportPDF";

interface DeforestationReportProps {
  isOpen: boolean;
  onClose: () => void;
  deforestResult: any;
  getGeometry: () => any;
}

// ── SVG Donut Chart ──────────────────────────────────────────
function ForestDonut({ stats }: { stats: any }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 80;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    const base = stats?.base_forest_area_ha || 0;
    const loss = stats?.loss_area_ha || 0;
    const gain = stats?.gain_area_ha || 0;
    const total = base + loss + gain || 1;
    const items = [
      { label: 'Base Forest', value: base, color: '#2d6a2d' },
      { label: 'Forest Loss', value: loss, color: '#ef4444' },
      { label: 'Forest Gain', value: gain, color: '#00FF88' },
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
          <circle key={seg.label} cx="110" cy="110" r={radius} fill="none"
            stroke={seg.color}
            strokeWidth={hovered === seg.label ? strokeWidth + 6 : strokeWidth}
            strokeDasharray={seg.dashArray} strokeDashoffset={0} strokeLinecap="butt"
            transform={`rotate(${seg.rotation} 110 110)`}
            className="transition-all duration-300 cursor-pointer"
            style={{ opacity: hovered && hovered !== seg.label ? 0.3 : 1 }}
            onMouseEnter={() => setHovered(seg.label)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x="110" y="100" textAnchor="middle" className="fill-white text-[13px] font-bold">
          {hoveredSeg ? hoveredSeg.label : 'Forest'}
        </text>
        <text x="110" y="120" textAnchor="middle" className="fill-slate-400 text-[11px]">
          {hoveredSeg
            ? `${hoveredSeg.value} ha (${(hoveredSeg.pct * 100).toFixed(1)}%)`
            : `${stats?.base_forest_area_ha || 0} ha`}
        </text>
      </svg>
    </div>
  );
}

// ── Year-wise Loss Bar Chart ─────────────────────────────────
function YearlyLossChart({ data }: { data: { year: number; loss_ha: number }[] }) {
  if (!data || data.length === 0) return null;
  const maxLoss = Math.max(...data.map(d => d.loss_ha), 0.01);
  const avgLoss = data.reduce((s, d) => s + d.loss_ha, 0) / data.length;

  return (
    <div className="flex flex-col gap-2 w-full">
      {data.map((d) => {
        const barWidth = (d.loss_ha / maxLoss) * 100;
        const isSpike = d.loss_ha > avgLoss * 2 && d.loss_ha > 0;
        const intensity = d.loss_ha / maxLoss;
        const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f97316' : '#22c55e';
        return (
          <div key={d.year} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-slate-400 font-mono w-10">{d.year}</span>
              <div className="flex items-center gap-1.5">
                {isSpike && <span className="text-[8px] text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">SPIKE</span>}
                <span className="text-[11px] text-slate-300 font-mono">{d.loss_ha} ha</span>
              </div>
            </div>
            <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full group-hover:brightness-125 transition-all"
                style={{ backgroundColor: d.loss_ha > 0 ? color : 'transparent' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── NDVI Time-Series SVG Line Chart ──────────────────────────
function NdviTimeseriesChart({ data }: { data: { year: number; mean_ndvi: number }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!data || data.length < 2) return null;

  const W = 520, H = 160, padL = 40, padR = 12, padT = 16, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const minNdvi = Math.min(...data.map(d => d.mean_ndvi)) * 0.9;
  const maxNdvi = Math.max(...data.map(d => d.mean_ndvi)) * 1.05;
  const range = maxNdvi - minNdvi || 0.01;

  const points = data.map((d, i) => ({
    x: padL + (i / (data.length - 1)) * chartW,
    y: padT + chartH - ((d.mean_ndvi - minNdvi) / range) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${padT + chartH} L${points[0].x},${padT + chartH} Z`;

  // Y-axis gridlines
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const val = minNdvi + (range / gridCount) * i;
    const y = padT + chartH - ((val - minNdvi) / range) * chartH;
    return { val, y };
  });

  const dotColor = (ndvi: number) => ndvi > 0.5 ? '#22c55e' : ndvi > 0.3 ? '#eab308' : '#ef4444';

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: 320 }}>
        <defs>
          <linearGradient id="ndvi-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="white" strokeOpacity="0.06" strokeWidth="0.5" />
            <text x={padL - 4} y={g.y + 3} textAnchor="end" className="fill-slate-500" fontSize="8" fontFamily="monospace">
              {g.val.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#ndvi-area-grad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots + year labels */}
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} className="cursor-pointer">
            <circle cx={p.x} cy={p.y} r={hoveredIdx === i ? 5 : 3.5}
              fill={dotColor(p.mean_ndvi)} stroke="#060d1b" strokeWidth="1.5"
              className="transition-all duration-200" />
            <text x={p.x} y={padT + chartH + 14} textAnchor="middle" className="fill-slate-500" fontSize="7" fontFamily="monospace">
              {data.length <= 10 ? p.year : i % 2 === 0 ? p.year : ''}
            </text>
            {/* Hover tooltip */}
            {hoveredIdx === i && (
              <g>
                <rect x={p.x - 32} y={p.y - 26} width="64" height="18" rx="4"
                  fill="#0a1628" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
                <text x={p.x} y={p.y - 14} textAnchor="middle" className="fill-white" fontSize="8" fontFamily="monospace" fontWeight="bold">
                  {p.year}: {p.mean_ndvi.toFixed(3)}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}


// ── Tree Area Time-Series ────────────────────────────────────
function TreeAreaChart({ data }: { data: { year: number; tree_area_ha: number }[] }) {
  if (!data || data.length === 0) return null;
  const maxArea = Math.max(...data.map(d => d.tree_area_ha), 0.01);
  const first = data[0];
  const last = data[data.length - 1];
  const trendPct = first.tree_area_ha > 0
    ? ((last.tree_area_ha - first.tree_area_ha) / first.tree_area_ha) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
        {trendPct < -5 ? <TrendingDown className="w-4 h-4 text-red-400" /> :
         trendPct > 5 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> :
         <Minus className="w-4 h-4 text-slate-500" />}
        <span className={`text-xs font-bold font-mono ${trendPct < -5 ? 'text-red-400' : trendPct > 5 ? 'text-emerald-400' : 'text-slate-400'}`}>
          {trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}% tree area change
        </span>
        <span className="text-[10px] text-slate-400 font-mono ml-auto">{first.year}→{last.year}</span>
      </div>
      {data.map((d) => {
        const barWidth = (d.tree_area_ha / maxArea) * 100;
        const intensity = d.tree_area_ha / maxArea;
        const color = intensity > 0.7 ? '#22c55e' : intensity > 0.4 ? '#eab308' : '#ef4444';
        return (
          <div key={d.year} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-slate-400 font-mono w-10">{d.year}</span>
              <span className="text-[11px] text-slate-300 font-mono">{d.tree_area_ha} ha</span>
            </div>
            <div className="w-full h-4 bg-white/5 rounded overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${barWidth}%` }}
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

// ── Histogram Chart ──────────────────────────────────────────
function HistogramChart({ data, color, label }: { data: { bin: number; count: number }[]; color: string; label: string }) {
  if (!data || data.length === 0) return <p className="text-[10px] text-slate-500 italic">No histogram data</p>;
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="flex flex-col gap-0.5 w-full">
      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">{label}</span>
      <div className="flex items-end gap-[1px] h-24">
        {data.map((d, i) => {
          const barHeight = (d.count / maxCount) * 100;
          return (
            <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${barHeight}%` }}
              transition={{ duration: 0.5, delay: i * 0.02 }}
              className="flex-1 rounded-t-sm hover:brightness-125 transition-all cursor-pointer"
              style={{ backgroundColor: color, opacity: 0.7 }}
              title={`NDVI: ${d.bin.toFixed(2)} | Count: ${d.count}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-0.5">
        <span>{data[0]?.bin.toFixed(1)}</span>
        <span>{data[Math.floor(data.length / 2)]?.bin.toFixed(1)}</span>
        <span>{data[data.length - 1]?.bin.toFixed(1)}</span>
      </div>
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
//  MAIN DEFORESTATION REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function DeforestationReport({ isOpen, onClose, deforestResult, getGeometry }: DeforestationReportProps) {
  const { reportRef, reportId, reportTime, isExporting, downloadPDF } = useReportPDF("DFST");
  if (!isOpen || !deforestResult) return null;

  const stats = deforestResult.stats;
  const ndvi = deforestResult.ndvi;
  const yearlyLoss = stats?.yearly_loss || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
            <div className="absolute top-0 left-0 w-full h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TreePine className="w-4 h-4 text-green-400" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase">Deforestation Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={downloadPDF} disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs font-semibold disabled:opacity-50"
                  title="Download PDF">{isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-3.5 h-3.5" />} PDF</button>
                <button onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 transition-colors border border-white/10 text-slate-400 hover:text-red-400"
                  title="Close"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div ref={reportRef} className="relative z-10 p-5 flex flex-col gap-5">

              {/* ── Section 1: Hansen Donut + Summary ──────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold w-full">Forest Composition</h4>
                  <ForestDonut stats={stats} />
                  <div className="flex gap-3 mt-1">
                    {[
                      { label: 'Base', color: '#2d6a2d' },
                      { label: 'Loss', color: '#ef4444' },
                      { label: 'Gain', color: '#00FF88' },
                    ].map(c => (
                      <div key={c.label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-[10px] text-slate-400">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-3">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">Analysis Summary</h4>
                  <StatRow items={[
                    { label: 'Base Forest (2000)', value: `${stats?.base_forest_area_ha} ha`, color: 'text-green-400' },
                    { label: 'Total Loss', value: `${stats?.loss_area_ha} ha`, color: 'text-red-400' },
                    { label: 'Loss %', value: `${stats?.loss_percentage}%`, color: 'text-red-400' },
                    { label: 'Forest Gain', value: `${stats?.gain_area_ha} ha`, color: 'text-emerald-400' },
                    { label: 'Peak Loss Year', value: stats?.peak_loss_year || 'N/A', color: 'text-yellow-400' },
                    { label: 'Avg Annual Loss', value: `${stats?.avg_annual_loss_ha} ha/yr` },
                    { label: 'Min Canopy', value: `${stats?.min_canopy}%` },
                    { label: 'Source', value: 'Hansen GFC v1.12' },
                  ]} />
                </div>
              </div>

              {/* ── Section 2: Year-wise Loss Bar Chart ────── */}
              {yearlyLoss.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2">
                    Year-wise Forest Loss ({stats?.start_year}–{stats?.end_year})
                    <span className="text-[8px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-bold normal-case tracking-normal">HANSEN 30m</span>
                  </h4>
                  <YearlyLossChart data={yearlyLoss} />
                </div>
              )}

              {/* ── Section 3: NDVI Time-Series (if available) */}
              {ndvi?.timeseries && ndvi.timeseries.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2">
                    🛰️ NDVI Time-Series ({ndvi.timeseries[0]?.year}–{ndvi.timeseries[ndvi.timeseries.length - 1]?.year})
                    <span className="text-[8px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full font-bold normal-case tracking-normal">SENTINEL-2 10m</span>
                  </h4>
                  <NdviTimeseriesChart data={ndvi.timeseries} />
                </div>
              )}

              {/* ── Section 4: Tree Area Time-Series ────────── */}
              {ndvi?.tree_area_timeseries && ndvi.tree_area_timeseries.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                    Tree Cover Area (NDVI &gt; {ndvi.threshold})
                  </h4>
                  <TreeAreaChart data={ndvi.tree_area_timeseries} />
                </div>
              )}

              {/* ── Section 5: Histogram Comparison ──────────── */}
              {ndvi?.before_histogram && ndvi?.after_histogram && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-4">
                    NDVI Histogram Comparison
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <HistogramChart data={ndvi.before_histogram} color="#22c55e" label={`Before (${ndvi.before_year})`} />
                    <HistogramChart data={ndvi.after_histogram} color="#ef4444" label={`After (${ndvi.after_year})`} />
                  </div>
                </div>
              )}

              {/* ── Section 6: Delta NDVI Stats ──────────────── */}
              {ndvi && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-3">
                    NDVI Change Analysis
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Before NDVI', value: ndvi.ndvi_before_mean?.toFixed(3), color: 'text-green-400' },
                      { label: 'After NDVI', value: ndvi.ndvi_after_mean?.toFixed(3), color: 'text-yellow-400' },
                      { label: 'NDVI Change', value: ndvi.ndvi_change?.toFixed(3), color: ndvi.ndvi_change < 0 ? 'text-red-400' : 'text-emerald-400' },
                      { label: 'Max Decline', value: ndvi.max_ndvi_decline?.toFixed(3), color: 'text-red-500' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                        <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between p-3 rounded-lg bg-red-500/[0.06] border border-red-500/[0.12]">
                    <span className="text-[10px] text-slate-300">Area with &gt;0.2 NDVI decline</span>
                    <span className="text-sm font-bold font-mono text-red-400">{ndvi.significant_decline_area_ha} ha</span>
                  </div>
                </div>
              )}

            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · {reportId} · {reportTime}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">Hansen GFC + Sentinel-2 SR</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

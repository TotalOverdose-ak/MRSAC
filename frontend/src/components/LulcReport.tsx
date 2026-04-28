"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BarChart3, Loader2, TrendingUp, TrendingDown, Minus, Download } from "lucide-react";
import axios from "axios";
import { useReportPDF } from "./useReportPDF";

// ── Types ────────────────────────────────────────────────────
interface LulcReportProps {
  isOpen: boolean;
  onClose: () => void;
  lulcResult: any;
  lulcYear: number;
  lulcSeason: string;
  lulcModel: string;
  getGeometry: () => any;
}

// ── DW Color palette ─────────────────────────────────────────
const DW_COLORS: Record<string, string> = {
  Water: "#419BDF", Trees: "#397D49", Grass: "#88B053",
  "Flooded Vegetation": "#7A87C6", Crops: "#E49635",
  "Shrub & Scrub": "#DFC35A", "Built Area": "#C4281B",
  "Bare Ground": "#A59B8F", "Snow & Ice": "#B39FE1",
};

// ── SVG Donut Chart ──────────────────────────────────────────
function DonutChart({ data, totalArea, dominant }: {
  data: Record<string, number>;
  totalArea: number;
  dominant: string;
}) {
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);
  const radius = 80;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    const entries = Object.entries(data).filter(([, v]) => v > 0);
    let accumulated = 0;
    return entries.map(([cls, area]) => {
      const pct = totalArea > 0 ? area / totalArea : 0;
      const dashArray = `${pct * circumference} ${circumference}`;
      const rotation = accumulated * 360 - 90; // start at top
      accumulated += pct;
      return { cls, area, pct, dashArray, rotation };
    });
  }, [data, totalArea, circumference]);

  const hoveredSegment = segments.find(s => s.cls === hoveredClass);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 220 220" className="w-56 h-56 drop-shadow-lg">
        {segments.map((seg) => (
          <circle
            key={seg.cls}
            cx="110" cy="110" r={radius}
            fill="none"
            stroke={DW_COLORS[seg.cls] || "#555"}
            strokeWidth={hoveredClass === seg.cls ? strokeWidth + 6 : strokeWidth}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={0}
            strokeLinecap="butt"
            transform={`rotate(${seg.rotation} 110 110)`}
            className="transition-all duration-300 cursor-pointer"
            style={{ opacity: hoveredClass && hoveredClass !== seg.cls ? 0.3 : 1 }}
            onMouseEnter={() => setHoveredClass(seg.cls)}
            onMouseLeave={() => setHoveredClass(null)}
          />
        ))}
        {/* Center text */}
        <text x="110" y="102" textAnchor="middle" className="fill-white text-[13px] font-bold">
          {hoveredSegment ? hoveredSegment.cls : dominant}
        </text>
        <text x="110" y="122" textAnchor="middle" className="fill-slate-400 text-[11px]">
          {hoveredSegment
            ? `${hoveredSegment.area.toFixed(2)} km² (${(hoveredSegment.pct * 100).toFixed(1)}%)`
            : `${totalArea.toFixed(2)} km²`}
        </text>
      </svg>
    </div>
  );
}

// ── Horizontal Bar Chart ─────────────────────────────────────
function BarChart({ data, totalArea }: {
  data: Record<string, number>;
  totalArea: number;
}) {
  const sorted = useMemo(() =>
    Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]),
    [data]
  );
  const maxArea = sorted.length > 0 ? sorted[0][1] : 1;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {sorted.map(([cls, area]) => {
        const pct = totalArea > 0 ? (area / totalArea) * 100 : 0;
        const barWidth = (area / maxArea) * 100;
        return (
          <div key={cls} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DW_COLORS[cls] || "#555" }} />
                <span className="text-[11px] text-slate-300 font-medium">{cls}</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{area.toFixed(2)} km² <span className="text-slate-500">({pct.toFixed(1)}%)</span></span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full group-hover:brightness-125 transition-all"
                style={{ backgroundColor: DW_COLORS[cls] || "#555" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Multi-Year Comparison Chart ──────────────────────────────
function MultiYearChart({ yearData }: {
  yearData: { year: number; areas: Record<string, number> }[];
}) {
  const allClasses = useMemo(() => {
    const classes = new Set<string>();
    yearData.forEach(yd => Object.keys(yd.areas).forEach(c => classes.add(c)));
    return Array.from(classes).filter(c =>
      yearData.some(yd => (yd.areas[c] || 0) > 0)
    );
  }, [yearData]);

  const maxArea = useMemo(() => {
    let max = 0;
    yearData.forEach(yd => Object.values(yd.areas).forEach(v => { if (v > max) max = v; }));
    return max || 1;
  }, [yearData]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {allClasses.map(cls => (
        <div key={cls} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DW_COLORS[cls] || "#555" }} />
            <span className="text-[11px] text-slate-300 font-medium">{cls}</span>
          </div>
          <div className="flex flex-col gap-1">
            {yearData.map(yd => {
              const area = yd.areas[cls] || 0;
              const barWidth = (area / maxArea) * 100;
              return (
                <div key={yd.year} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-mono w-10 shrink-0">{yd.year}</span>
                  <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded"
                      style={{
                        backgroundColor: DW_COLORS[cls] || "#555",
                        opacity: 0.6 + (yearData.indexOf(yd) / yearData.length) * 0.4,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono w-20 text-right shrink-0">{area.toFixed(2)} km²</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Change Cards ─────────────────────────────────────────────
function ChangeCards({ yearData }: {
  yearData: { year: number; areas: Record<string, number> }[];
}) {
  if (yearData.length < 2) return null;

  const first = yearData[0];
  const last = yearData[yearData.length - 1];
  const allClasses = new Set<string>();
  yearData.forEach(yd => Object.keys(yd.areas).forEach(c => allClasses.add(c)));

  const changes = Array.from(allClasses)
    .map(cls => {
      const oldArea = first.areas[cls] || 0;
      const newArea = last.areas[cls] || 0;
      const diff = newArea - oldArea;
      const pctChange = oldArea > 0.01 ? (diff / oldArea) * 100 : newArea > 0 ? 100 : 0;
      return { cls, oldArea, newArea, diff, pctChange };
    })
    .filter(c => Math.abs(c.diff) > 0.01)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <div className="grid grid-cols-2 gap-2">
      {changes.slice(0, 6).map(c => (
        <div key={c.cls} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DW_COLORS[c.cls] || "#555" }} />
            <span className="text-[10px] text-slate-400 font-medium truncate">{c.cls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {c.diff > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> :
             c.diff < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-400" /> :
             <Minus className="w-3.5 h-3.5 text-slate-500" />}
            <span className={`text-sm font-bold font-mono ${c.diff > 0 ? "text-emerald-400" : c.diff < 0 ? "text-red-400" : "text-slate-400"}`}>
              {c.diff > 0 ? "+" : ""}{c.pctChange.toFixed(1)}%
            </span>
          </div>
          <span className="text-[9px] text-slate-500 font-mono">
            {c.oldArea.toFixed(1)} → {c.newArea.toFixed(1)} km²
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function LulcReport({
  isOpen, onClose, lulcResult, lulcYear, lulcSeason, lulcModel, getGeometry,
}: LulcReportProps) {
  const { reportRef, reportId, reportTime, isExporting, downloadPDF } = useReportPDF("LULC");

  // Multi-year comparison state
  const [compareYears, setCompareYears] = useState<number[]>([]);
  const [yearInput, setYearInput] = useState<string>("");
  const [multiYearData, setMultiYearData] = useState<{ year: number; areas: Record<string, number> }[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonDone, setComparisonDone] = useState(false);

  const stats = lulcResult?.stats;
  const classAreas: Record<string, number> = stats?.class_areas_km2 || {};
  const classPct: Record<string, number> = stats?.class_percentages || {};
  const totalArea: number = Number(stats?.total_area_km2) || 0;
  const dominant: string = stats?.dominant_class || "N/A";

  // ── Add/Remove compare years ────────────────────────────────
  const addYear = () => {
    const y = parseInt(yearInput);
    if (!y || y < 2017 || y > 2025) return;
    if (compareYears.includes(y)) return;
    if (compareYears.length >= 4) return; // max 4 years
    setCompareYears([...compareYears, y].sort((a, b) => a - b));
    setYearInput("");
    setComparisonDone(false);
  };

  const removeYear = (y: number) => {
    setCompareYears(compareYears.filter(yr => yr !== y));
    setComparisonDone(false);
  };

  // ── Run Multi-Year Comparison ──────────────────────────────
  const runComparison = async () => {
    const geom = getGeometry();
    if (!geom || compareYears.length < 2) return;

    setIsComparing(true);
    setMultiYearData([]);
    setComparisonDone(false);

    const serverUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const results: { year: number; areas: Record<string, number> }[] = [];

    for (const year of compareYears) {
      try {
        const res = await axios.post(`${serverUrl}/api/lulc`, {
          geojson: geom,
          year,
          season: lulcSeason,
          model: "dynamic_world",
        });
        if (res.data?.stats?.class_areas_km2) {
          results.push({ year, areas: res.data.stats.class_areas_km2 });
        }
      } catch {
        results.push({ year, areas: {} });
      }
    }

    setMultiYearData(results.sort((a, b) => a.year - b.year));
    setIsComparing(false);
    setComparisonDone(true);
  };


  if (!isOpen || !lulcResult) return null;

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
            className="w-full max-w-2xl bg-[#030712]/50 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden print:shadow-none print:border-none print:max-w-none print:rounded-none relative"
            id="lulc-report-container"
          >
            {/* Ambient glow */}
            <div className="absolute top-0 left-0 w-full h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between print:border-gray-200">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400 print:text-emerald-600" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase print:text-black">LULC Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={downloadPDF} disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs font-semibold disabled:opacity-50"
                  title="Download PDF">{isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-3.5 h-3.5" />} PDF</button>
                <button onClick={onClose}
                  className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all"
                  title="Close Report"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* ═══ REPORT BODY ═══ */}
            <div ref={reportRef} className="relative z-10 p-5 flex flex-col gap-5">

              {/* ── Section 1: Donut + Stats ────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold w-full">Class Distribution</h3>
                  <DonutChart data={classAreas} totalArea={totalArea} dominant={dominant} />
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Analysis Summary</h3>
                  <div className="flex flex-col gap-2">
                    {[
                      ["Total Area", `${totalArea.toFixed(2)} km²`],
                      ["Dominant Class", dominant],
                      ["Year", stats?.year],
                      ["Season", stats?.season?.toUpperCase()],
                      ["Resolution", stats?.resolution],
                      ["Images Used", stats?.images_used],
                      ["Model", stats?.source],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-[11px] text-slate-500">{String(label)}</span>
                        <span className="text-[11px] text-slate-200 font-mono font-medium">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Section 2: Bar Chart ─────────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-4">Area Distribution — {stats?.year}</h3>
                <BarChart data={classAreas} totalArea={totalArea} />
              </div>

              {/* ── Section 3: Legend ─────────────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3">LULC Classes (Dynamic World)</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {Object.entries(DW_COLORS).map(([cls, color]) => (
                    <div key={cls} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                      <span className="text-[10px] text-slate-400">{cls}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 4: Multi-Year Comparison ──────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 print:break-before-page">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-1">Multi-Year Comparison</h3>
                <p className="text-[10px] text-slate-600 mb-4">Add 2–4 years and compare how land cover changed over time.</p>

                {/* Year picker */}
                <div className="flex items-center gap-2 mb-3 print:hidden">
                  <input
                    type="number"
                    min={2017}
                    max={2025}
                    value={yearInput}
                    onChange={(e) => setYearInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addYear(); }}
                    placeholder="e.g. 2020"
                    className="w-24 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-emerald-300 font-mono focus:border-emerald-500/50 focus:outline-none transition-colors"
                  />
                  <button
                    onClick={addYear}
                    disabled={compareYears.length >= 4}
                    className="px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30"
                  >
                    + Add
                  </button>
                </div>

                {/* Year pills */}
                {compareYears.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {compareYears.map(y => (
                      <span
                        key={y}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-mono"
                      >
                        {y}
                        <button onClick={() => removeYear(y)} className="hover:text-red-400 transition-colors print:hidden">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Compare button */}
                {compareYears.length >= 2 && !comparisonDone && (
                  <button
                    onClick={runComparison}
                    disabled={isComparing}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 print:hidden"
                  >
                    {isComparing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching data for {compareYears.length} years...</> : `Compare ${compareYears.length} Years`}
                  </button>
                )}

                {compareYears.length < 2 && !comparisonDone && (
                  <p className="text-[10px] text-slate-600 italic">Add at least 2 years to enable comparison.</p>
                )}

                {/* Results */}
                {comparisonDone && multiYearData.length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-5 mt-4"
                  >
                    <div>
                      <h4 className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold mb-3">
                        Change Summary ({multiYearData[0].year} → {multiYearData[multiYearData.length - 1].year})
                      </h4>
                      <ChangeCards yearData={multiYearData} />
                    </div>

                    <div>
                      <h4 className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold mb-3">
                        Class-wise Comparison
                      </h4>
                      <MultiYearChart yearData={multiYearData} />
                    </div>
                  </motion.div>
                )}
              </div>

            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · {reportId} · {reportTime}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">
                Sentinel-2 · 10m · Google Dynamic World V1
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

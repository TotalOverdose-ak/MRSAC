"use client";

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Printer, Pickaxe, ShieldAlert, ShieldCheck,
  BarChart3, MapPinned, BrainCircuit, Crosshair, Cpu, Eye,
  Download, FileText, Clock, Hash, Satellite, Database
} from "lucide-react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

// ── Types ────────────────────────────────────────────────────
interface MiningReportProps {
  isOpen: boolean;
  onClose: () => void;
  geoData: any;
  stats: any;
  patches: Record<string, any>;
}

// ── Verdict colors ───────────────────────────────────────────
const VERDICT_COLORS: Record<string, { color: string; label: string }> = {
  ILLEGAL:     { color: "#f43f5e", label: "Illegal" },
  SUSPECT:     { color: "#f59e0b", label: "Suspect" },
  LEGAL:       { color: "#38bdf8", label: "Legal" },
  USER_LEGAL:  { color: "#3b82f6", label: "Verified" },
  UNVERIFIED:  { color: "#64748b", label: "Unverified" },
};

// ── Donut Chart ──────────────────────────────────────────────
function VerdictDonut({ stats }: { stats: any }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 70;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    const entries = [
      { key: "ILLEGAL", count: stats?.illegal || 0 },
      { key: "SUSPECT", count: stats?.suspect || 0 },
      { key: "LEGAL", count: stats?.legal || 0 },
      { key: "UNVERIFIED", count: stats?.unverified || 0 },
    ].filter(e => e.count > 0);

    const total = entries.reduce((s, e) => s + e.count, 0) || 1;
    let accumulated = 0;
    return entries.map(e => {
      const pct = e.count / total;
      const dashArray = `${pct * circumference} ${circumference}`;
      const rotation = accumulated * 360 - 90;
      accumulated += pct;
      return { ...e, pct, dashArray, rotation };
    });
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
            stroke={VERDICT_COLORS[seg.key]?.color || "#555"}
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
          {hoveredSeg ? `${(hoveredSeg.pct * 100).toFixed(1)}%` : "Verdict"}
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-slate-400 text-[10px]">
          {hoveredSeg ? `${hoveredSeg.count} ${VERDICT_COLORS[hoveredSeg.key]?.label}` : "Distribution"}
        </text>
      </svg>
      <div className="flex flex-wrap gap-3 justify-center">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5 cursor-pointer transition-opacity"
            style={{ opacity: hovered && hovered !== seg.key ? 0.4 : 1 }}
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VERDICT_COLORS[seg.key]?.color }} />
            <span className="text-[10px] text-slate-400">{VERDICT_COLORS[seg.key]?.label}</span>
            <span className="text-[10px] text-slate-500 font-mono">({seg.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Area Bar Chart ───────────────────────────────────────────
function AreaBarChart({ features }: { features: any[] }) {
  if (!features || features.length === 0) return null;
  const sorted = [...features].sort((a, b) => (b.properties?.area_km2 || 0) - (a.properties?.area_km2 || 0));
  const maxArea = Math.max(...sorted.map(f => f.properties?.area_km2 || 0), 0.01);

  return (
    <div className="flex flex-col gap-2 w-full">
      {sorted.map((feat: any) => {
        const props = feat.properties || {};
        const area = props.area_km2 || 0;
        const barWidth = (area / maxArea) * 100;
        const vc = VERDICT_COLORS[props.verdict] || VERDICT_COLORS.UNVERIFIED;
        return (
          <div key={props.mine_id} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-slate-400 font-mono">Mine #{props.mine_id}</span>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ color: vc.color, backgroundColor: `${vc.color}15` }}>
                  {vc.label.toUpperCase()}
                </span>
                <span className="text-[11px] text-slate-300 font-mono">{area.toFixed(2)} km²</span>
              </div>
            </div>
            <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full group-hover:brightness-125 transition-all"
                style={{ backgroundColor: vc.color }}
              />
            </div>
          </div>
        );
      })}
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
//  MAIN MINING REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function MiningReport({ isOpen, onClose, geoData, stats, patches }: MiningReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const reportId = useMemo(() => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EW-MINE-${ts}-${rand}`;
  }, []);
  const reportTime = useMemo(() => new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
  }), []);

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const el = reportRef.current;
      // html-to-image uses browser's native SVG foreignObject rendering
      // so it supports ALL modern CSS (lab, oklch, etc.) natively
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#030712",
        quality: 1,
        cacheBust: true,
      });
      // Create image to get dimensions
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 16;
      const imgH = (img.height * imgW) / img.width;
      let remaining = imgH;
      let pageNum = 0;
      while (remaining > 0) {
        if (pageNum > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 8, pageNum === 0 ? 8 : -(imgH - remaining), imgW, imgH);
        remaining -= (pageH - 16);
        pageNum++;
      }
      pdf.save(`${reportId}.pdf`);
    } catch (e) { console.error("PDF export failed", e); alert("PDF export failed. Try again."); }
    setIsExporting(false);
  };

  if (!isOpen || !geoData) return null;

  const features = geoData?.features || [];
  const patchEntries = Object.entries(patches || {});

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
            <div className="absolute top-0 left-0 w-full h-64 bg-sky-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pickaxe className="w-4 h-4 text-sky-400" />
                <span className="font-serif text-base font-medium tracking-[0.15em] text-white uppercase">Mining Report</span>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={downloadPDF} disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-sky-500/10 hover:bg-sky-500/20 transition-colors border border-sky-500/20 text-sky-400 hover:text-sky-300 text-xs font-semibold disabled:opacity-50"
                  title="Download PDF">{isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-3.5 h-3.5" />} PDF</button>
                <button onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 transition-colors border border-white/10 text-slate-400 hover:text-red-400"
                  title="Close"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* ═══ BODY ═══ */}
            <div ref={reportRef} className="relative z-10 p-5 flex flex-col gap-5">

              {/* ── Report Tracking Info ──────────────────── */}
              <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5"><Hash className="w-3 h-3 text-sky-400" /><span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Report ID</span></div>
                  <span className="text-xs text-sky-300 font-mono font-bold">{reportId}</span>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-sky-400" /><span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Generated</span></div>
                  <span className="text-xs text-slate-300 font-mono">{reportTime}</span>
                </div>
              </div>

              {/* ── Executive Summary ─────────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-2 flex items-center gap-1.5"><FileText className="w-3 h-3" /> Executive Summary</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  This report presents the results of an automated mining detection scan performed on satellite imagery
                  covering the selected Area of Interest. A total of <strong className="text-white">{stats?.total || 0} mine sites</strong> were
                  detected, of which <strong className="text-rose-400">{stats?.illegal || 0}</strong> were classified as <strong className="text-rose-400">Illegal</strong>,{" "}
                  <strong className="text-amber-400">{stats?.suspect || 0}</strong> as <strong className="text-amber-400">Suspect</strong>, and{" "}
                  <strong className="text-sky-400">{stats?.legal || 0}</strong> as <strong className="text-sky-400">Legal/Verified</strong>.
                  The total mining footprint covers approximately <strong className="text-white">{stats?.total_area_km2 || 0} km²</strong>.
                  Classification is based on spatial overlap (IoU) with government-registered legal mine boundaries.
                </p>
              </div>

              {/* ── Section 1: Summary Stats Grid ─────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: <BarChart3 className="w-3.5 h-3.5 text-sky-400" />, label: "Total Mines", value: stats?.total || 0, color: "text-sky-400" },
                  { icon: <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />, label: "Illegal", value: stats?.illegal || 0, color: "text-rose-500" },
                  { icon: <Crosshair className="w-3.5 h-3.5 text-amber-400" />, label: "Suspect", value: stats?.suspect || 0, color: "text-amber-400" },
                  { icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, label: "Legal", value: stats?.legal || 0, color: "text-emerald-400" },
                ].map(s => (
                  <div key={s.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-2">
                      {s.icon}
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                    </div>
                    <span className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* ── Section 2: Donut + Analysis Summary ───── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold w-full">Verdict Distribution</h3>
                  <VerdictDonut stats={stats} />
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col gap-3">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Analysis Summary</h3>
                  <StatRow items={[
                    { label: 'Total Mines', value: stats?.total || 0, color: 'text-sky-400' },
                    { label: 'Total Area', value: `${stats?.total_area_km2 || 0} km²`, color: 'text-white' },
                    { label: 'Avg Mine Area', value: `${stats?.avg_area_km2 || 0} km²` },
                    { label: 'Largest Mine', value: `${stats?.max_area_km2 || 0} km²`, color: 'text-amber-400' },
                    { label: 'Avg IoU', value: stats?.avg_iou?.toFixed(3) || 'N/A', color: 'text-emerald-400' },
                    { label: 'Centroids Inside Legal', value: `${stats?.centroid_inside_count || 0} / ${stats?.total || 0}` },
                  ]} />
                </div>
              </div>

              {/* ── Section 3: Mine Details Table (Enhanced) ─ */}
              {features.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3">Detected Mines — Details</h3>
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">ID</th>
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">Area</th>
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">Location</th>
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">Verdict</th>
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">IoU</th>
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">Conf</th>
                          <th className="text-left py-2 text-slate-500 font-mono font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...features]
                          .sort((a: any, b: any) => {
                            const order: Record<string, number> = { ILLEGAL: 0, SUSPECT: 1, UNVERIFIED: 2, LEGAL: 3, USER_LEGAL: 4 };
                            return (order[a.properties?.verdict] ?? 5) - (order[b.properties?.verdict] ?? 5);
                          })
                          .map((feat: any) => {
                            const p = feat.properties || {};
                            const vc = VERDICT_COLORS[p.verdict] || VERDICT_COLORS.UNVERIFIED;
                            const coords = feat.geometry?.coordinates?.[0] || [];
                            const cLon = coords.length > 0 ? (coords.reduce((s: number, c: any) => s + c[0], 0) / coords.length).toFixed(4) : 'N/A';
                            const cLat = coords.length > 0 ? (coords.reduce((s: number, c: any) => s + c[1], 0) / coords.length).toFixed(4) : 'N/A';
                            return (
                              <tr key={p.mine_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                <td className="py-2 text-slate-300 font-mono">#{p.mine_id}</td>
                                <td className="py-2 text-slate-300 font-mono">{(p.area_km2 || 0).toFixed(2)} km²</td>
                                <td className="py-2 text-slate-400 font-mono text-[9px]">{cLat}°N, {cLon}°E</td>
                                <td className="py-2">
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ color: vc.color, backgroundColor: `${vc.color}15` }}>
                                    {vc.label.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-2 text-slate-300 font-mono">{(p.iou || 0).toFixed(3)}</td>
                                <td className="py-2 text-slate-400 capitalize text-[9px]">{p.confidence || 'N/A'}</td>
                                <td className="py-2">
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${p.verdict === 'USER_LEGAL' ? 'text-blue-400 bg-blue-400/10' : 'text-slate-500 bg-white/5'}`}>
                                    {p.verdict === 'USER_LEGAL' ? '✓ VERIFIED' : 'PENDING'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Section 4: Area Distribution Bar Chart ── */}
              {features.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-4">Mine Area Distribution</h3>
                  <AreaBarChart features={features} />
                </div>
              )}

              {/* ── Section 5: IoU Analysis ───────────────── */}
              {stats?.avg_iou > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3 flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 text-sky-400" /> IoU Classification Analysis
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Avg IoU', value: stats.avg_iou?.toFixed(3), color: 'text-sky-400' },
                      { label: 'Max IoU', value: stats.max_iou?.toFixed(3), color: 'text-emerald-400' },
                      { label: 'Min IoU', value: stats.min_iou?.toFixed(3), color: 'text-amber-400' },
                      { label: 'Centroid Inside', value: `${stats.centroid_inside_count}`, color: 'text-white' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                        <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
                    IoU (Intersection over Union) measures overlap between detected mine footprint and legal mine boundaries.
                    IoU ≥ 0.30 → Legal, 0.10–0.30 → Suspect, &lt;0.10 → Illegal.
                  </p>
                </div>
              )}

              {/* ── Section 6: Thumbnail Gallery ──────────── */}
              {patchEntries.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 print:break-before-page">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3 flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-sky-400" /> Segmentation Thumbnails
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {patchEntries.map(([mineId, patch]: [string, any]) => {
                      const vc = VERDICT_COLORS[patch.verdict] || VERDICT_COLORS.UNVERIFIED;
                      return (
                        <div key={mineId} className="bg-black/30 border border-white/5 rounded-lg overflow-hidden group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:image/png;base64,${patch.b64}`}
                            alt={`Mine ${mineId}`}
                            className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="p-2 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-mono">#{mineId}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                                style={{ color: vc.color, backgroundColor: `${vc.color}15` }}>
                                {vc.label.toUpperCase()}
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">{(patch.prob * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Section 7: Data Sources ────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-3 flex items-center gap-1.5">
                  <Satellite className="w-3 h-3 text-sky-400" /> Data Sources
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: <Satellite className="w-3 h-3 text-sky-400" />, label: "Imagery", value: "Sentinel-2 SR Harmonized" },
                    { icon: <Cpu className="w-3 h-3 text-purple-400" />, label: "Resolution", value: "10m Multi-spectral" },
                    { icon: <Database className="w-3 h-3 text-emerald-400" />, label: "Legal DB", value: "PostGIS · Mining Leases" },
                    { icon: <BrainCircuit className="w-3 h-3 text-amber-400" />, label: "Model", value: "ResNet34·UNet+SCSE" },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
                      {s.icon}
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">{s.label}</span>
                        <span className="text-[10px] text-slate-300 font-mono">{s.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 8: Methodology ────────────────── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" /> Model & Methodology
                </h3>
                {stats?.model_info ? (
                  <div className="flex flex-col gap-2 text-[10px] text-slate-400 leading-relaxed">
                    <p>
                      Mine detection uses a <strong className="text-slate-300">{stats.model_info.architecture}</strong> trained
                      on {stats.model_info.input_channels}-band Sentinel-2 imagery ({stats.model_info.input_bands}) at{" "}
                      {stats.model_info.resolution_m}m resolution. Tiles of {stats.model_info.tile_size_km}km × {stats.model_info.tile_size_km}km
                      are processed through the encoder-decoder network with a segmentation threshold of {stats.model_info.seg_threshold}.
                    </p>
                    <p>
                      Classification is performed via <strong className="text-slate-300">{stats.model_info.classification}</strong>.
                      IoU ≥ {stats.model_info.iou_legal_threshold} → Legal,
                      IoU {stats.model_info.iou_suspect_threshold}–{stats.model_info.iou_legal_threshold} → Suspect,
                      IoU &lt; {stats.model_info.iou_suspect_threshold} → Illegal.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Mine footprints detected using deep learning (ResNet34 · UNet with SCSE attention) on Sentinel-2 SR imagery.
                    Legal classification via PostGIS spatial comparison with government mining lease boundaries.
                  </p>
                )}
              </div>

            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="relative z-10 px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-600 font-mono">
                Earth Watch · MRSAC · {reportId} · {reportTime}
              </span>
              <span className="text-[9px] text-slate-600 font-mono">
                Sentinel-2 · ResNet34·UNet · PostGIS
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

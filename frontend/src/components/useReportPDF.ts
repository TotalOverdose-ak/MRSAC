"use client";

import { useRef, useState, useMemo } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

/**
 * Shared hook for PDF export across all report modules.
 * Uses html-to-image (browser-native SVG foreignObject rendering)
 * which supports ALL modern CSS including Tailwind v4 lab()/oklch() colors.
 */
export function useReportPDF(prefix: string) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const reportId = useMemo(() => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EW-${prefix}-${ts}-${rand}`;
  }, [prefix]);

  const reportTime = useMemo(() => new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  }), []);

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const el = reportRef.current;
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#030712",
        quality: 1,
        cacheBust: true,
      });
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
    } catch (e) {
      console.error("PDF export failed", e);
      alert("PDF export failed. Try again.");
    }
    setIsExporting(false);
  };

  return { reportRef, reportId, reportTime, isExporting, downloadPDF };
}

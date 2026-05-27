import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfSection = {
  title: string;
  head: string[];
  body: (string | number)[][];
};

export type PdfReportOptions = {
  title: string;
  subtitle?: string;
  company?: string;
  summary?: { label: string; value: string | number }[];
  sections: PdfSection[];
  signatureLabel?: string;
  filename: string;
};

export function generateReportPDF(opts: PdfReportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const company = opts.company ?? "Marketing Monitoring";
  const now = new Date();
  const dateStr = now.toLocaleString();

  // ===== Header band =====
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 90, "F");

  // Logo circle
  doc.setFillColor(59, 130, 246); // primary blue
  doc.circle(margin + 18, 45, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("M", margin + 13, 51);

  // Company name + title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(company, margin + 50, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text("Daily Location & Visit Tracker", margin + 50, 56);

  // Date (right side)
  doc.setFontSize(9);
  doc.text(`Generated: ${dateStr}`, pageW - margin, 40, { align: "right" });
  doc.text(`Report ID: ${now.getTime().toString(36).toUpperCase()}`, pageW - margin, 56, { align: "right" });

  // ===== Title =====
  let y = 120;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(opts.title, margin, y);
  if (opts.subtitle) {
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(opts.subtitle, margin, y);
  }
  y += 20;

  // ===== Summary cards =====
  if (opts.summary && opts.summary.length) {
    const cardW = (pageW - margin * 2 - (opts.summary.length - 1) * 8) / opts.summary.length;
    opts.summary.forEach((s, i) => {
      const x = margin + i * (cardW + 8);
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(x, y, cardW, 56, 6, 6, "F");
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(s.label.toUpperCase(), x + 10, y + 18);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(String(s.value), x + 10, y + 42);
    });
    y += 76;
  }

  // ===== Sections (tables) =====
  opts.sections.forEach((sec) => {
    if (y > pageH - 180) {
      doc.addPage();
      y = margin;
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(sec.title, margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [sec.head],
      body: sec.body.map((r) => r.map((c) => String(c))),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 6, textColor: [30, 41, 59] },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 24;
  });

  // ===== Signature block (last page) =====
  const pageCount = doc.getNumberOfPages();
  doc.setPage(pageCount);
  let sigY = pageH - 110;
  if (y > sigY - 20) {
    doc.addPage();
    sigY = pageH - 110;
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, sigY, margin + 200, sigY);
  doc.line(pageW - margin - 200, sigY, pageW - margin, sigY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(opts.signatureLabel ?? "Prepared by", margin, sigY + 14);
  doc.text("Authorized Signature", pageW - margin - 200, sigY + 14);

  doc.setFontSize(8);
  doc.text(`Date: ${now.toLocaleDateString()}`, margin, sigY + 28);
  doc.text(`Date: ${now.toLocaleDateString()}`, pageW - margin - 200, sigY + 28);

  // Footer on every page
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`© ${now.getFullYear()} ${company} — Confidential Report`, margin, pageH - 24);
    doc.text(`Page ${i} of ${doc.getNumberOfPages()}`, pageW - margin, pageH - 24, { align: "right" });
  }

  doc.save(opts.filename);
}

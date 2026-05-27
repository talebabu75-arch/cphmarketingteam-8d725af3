import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import companyLogo from "@/assets/company-banner.png";
import companyFooter from "@/assets/company-footer.png";

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let _logoData: string | null = null;
let _footerData: string | null = null;
async function loadLogo() {
  if (!_logoData) _logoData = await urlToDataUrl(companyLogo);
  return _logoData;
}
async function loadFooter() {
  if (!_footerData) _footerData = await urlToDataUrl(companyFooter);
  return _footerData;
}

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

export type CombinedReportOptions = {
  filename: string;
  coverTitle?: string;
  coverSubtitle?: string;
  company?: string;
  reports: Omit<PdfReportOptions, "filename">[];
};

/* ---------- Internal: render one report into an existing doc ---------- */
function renderReport(
  doc: jsPDF,
  report: Omit<PdfReportOptions, "filename">,
  logo: string | null,
  startOnNewPage: boolean,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  if (startOnNewPage) doc.addPage();

  // ===== Header band =====
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, 100, "F");

  if (logo) {
    try {
      const maxW = pageW - margin * 2 - 160;
      const w = Math.min(maxW, 420);
      const h = w * (300 / 1920);
      doc.addImage(logo, "PNG", margin, 20, w, h);
    } catch { /* ignore */ }
  }

  const now = new Date();
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text(`Generated: ${now.toLocaleString()}`, pageW - margin, 40, { align: "right" });
  doc.text(`Report ID: ${now.getTime().toString(36).toUpperCase()}`, pageW - margin, 56, { align: "right" });

  // ===== Title =====
  let y = 120;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(report.title, margin, y);
  if (report.subtitle) {
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(report.subtitle, margin, y);
  }
  y += 20;

  // ===== Summary cards =====
  if (report.summary && report.summary.length) {
    const cardW = (pageW - margin * 2 - (report.summary.length - 1) * 8) / report.summary.length;
    report.summary.forEach((s, i) => {
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
  report.sections.forEach((sec) => {
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

  // ===== Signature block at bottom of last page of THIS report =====
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
  doc.text(report.signatureLabel ?? "Prepared by", margin, sigY + 14);
  doc.text("Authorized Signature", pageW - margin - 200, sigY + 14);

  doc.setFontSize(8);
  doc.text(`Date: ${now.toLocaleDateString()}`, margin, sigY + 28);
  doc.text(`Date: ${now.toLocaleDateString()}`, pageW - margin - 200, sigY + 28);
}

/* ---------- Internal: stamp footers across every page ---------- */
function stampFooters(doc: jsPDF, company: string, footerImg: string | null) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const footerH = 56;
  const now = new Date();

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - footerH - 8, pageW - margin, pageH - footerH - 8);

    if (footerImg) {
      try {
        const w = pageW - margin * 2;
        const h = Math.min(footerH, w * (180 / 1920));
        doc.addImage(footerImg, "PNG", margin, pageH - h - 18, w, h);
      } catch { /* ignore */ }
    } else {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${company} — খোকন টাওয়ার, মেডিকেল কলেজ রোড, টমছমব্রিজ, কুমিল্লা  |  01888 117873, 01888 117890  |  Ambulance: 01888 117888`,
        pageW / 2,
        pageH - 30,
        { align: "center" },
      );
    }

    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`© ${now.getFullYear()} ${company}`, margin, pageH - 8);
    doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 8, { align: "right" });
  }
}

/* ---------- Public: single-report PDF (backwards compatible) ---------- */
export async function generateReportPDF(opts: PdfReportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const company = opts.company ?? "Cumilla People's Hospital";
  const logo = await loadLogo();
  const footerImg = await loadFooter();

  renderReport(doc, opts, logo, false);
  stampFooters(doc, company, footerImg);
  doc.save(opts.filename);
}

/* ---------- Public: combined multi-report PDF ---------- */
export async function generateCombinedReportPDF(opts: CombinedReportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const company = opts.company ?? "Cumilla People's Hospital";
  const logo = await loadLogo();
  const footerImg = await loadFooter();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const now = new Date();

  // ===== Cover page =====
  if (logo) {
    try {
      const w = Math.min(pageW - margin * 2, 480);
      const h = w * (300 / 1920);
      doc.addImage(logo, "PNG", (pageW - w) / 2, 80, w, h);
    } catch { /* ignore */ }
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(opts.coverTitle ?? "Consolidated Report Bundle", pageW / 2, 240, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139);
  doc.text(
    opts.coverSubtitle ?? `All auto-generated reports • ${now.toLocaleDateString()}`,
    pageW / 2,
    266,
    { align: "center" },
  );

  // Table of contents
  let tocY = 320;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Contents", margin, tocY);
  tocY += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  opts.reports.forEach((r, i) => {
    if (tocY > pageH - 120) return;
    doc.text(`${i + 1}.  ${r.title}${r.subtitle ? ` — ${r.subtitle}` : ""}`, margin, tocY);
    tocY += 18;
  });

  // ===== Each report on its own new page =====
  opts.reports.forEach((rep) => {
    renderReport(doc, rep, logo, true);
  });

  stampFooters(doc, company, footerImg);
  doc.save(opts.filename);
}

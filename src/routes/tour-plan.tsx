import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardLists } from "@/lib/use-lists";
import { toast } from "sonner";
import { ArrowLeft, Printer, FileDown, FileText, Save, Loader2, Wand2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import companyLogo from "@/assets/company-banner.png";
import companyFooter from "@/assets/company-footer.png";

export const Route = createFileRoute("/tour-plan")({
  head: () => ({
    meta: [
      { title: "Monthly Tour Plan — Marketing Team" },
      { name: "description", content: "Create and export monthly tour plans for each marketing team member." },
    ],
  }),
  component: TourPlanPage,
});

type TourRow = { id?: string; person: string; plan_date: string; location: string | null; notes: string | null };

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }
function ddmmyy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url); const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string); r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function TourPlanPage() {
  const navigate = useNavigate();
  const { persons, locations, loading } = useDashboardLists();
  const [ready, setReady] = useState(false);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, Record<string, { location: string; notes: string }>>>({});
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef<Set<string>>(new Set());

  // auth
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) navigate({ to: "/login", replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login", replace: true });
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (persons.length && selectedPersons.length === 0) {
      setSelectedPersons(persons.map((p) => p.name));
    }
  }, [persons]);

  // load month data
  const startISO = ymd(year, month, 1);
  const endISO = ymd(year, month, daysInMonth(year, month));
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data, error } = await supabase
        .from("tour_plans")
        .select("*")
        .gte("plan_date", startISO)
        .lte("plan_date", endISO);
      if (error) { toast.error(error.message); return; }
      const next: Record<string, Record<string, { location: string; notes: string }>> = {};
      (data ?? []).forEach((r: any) => {
        next[r.person] ??= {};
        next[r.person][r.plan_date] = { location: r.location ?? "", notes: r.notes ?? "" };
      });
      setRows(next);
      dirtyRef.current.clear();
    })();
  }, [ready, startISO, endISO]);

  const days = useMemo(() => {
    const n = daysInMonth(year, month);
    return Array.from({ length: n }, (_, i) => ymd(year, month, i + 1));
  }, [year, month]);

  function setCell(person: string, date: string, field: "location" | "notes", value: string) {
    setRows((prev) => {
      const next = { ...prev };
      next[person] = { ...(next[person] ?? {}) };
      next[person][date] = { ...(next[person][date] ?? { location: "", notes: "" }), [field]: value };
      return next;
    });
    dirtyRef.current.add(`${person}|${date}`);
  }

  async function saveAll() {
    setSaving(true);
    try {
      const ops: TourRow[] = [];
      const deletes: { person: string; plan_date: string }[] = [];
      dirtyRef.current.forEach((key) => {
        const [person, date] = key.split("|");
        const cell = rows[person]?.[date];
        const loc = (cell?.location ?? "").trim();
        const notes = (cell?.notes ?? "").trim();
        if (!loc && !notes) {
          deletes.push({ person, plan_date: date });
        } else {
          ops.push({ person, plan_date: date, location: loc || null, notes: notes || null });
        }
      });
      if (ops.length) {
        const { error } = await supabase.from("tour_plans").upsert(ops, { onConflict: "person,plan_date" });
        if (error) throw error;
      }
      for (const d of deletes) {
        await supabase.from("tour_plans").delete().eq("person", d.person).eq("plan_date", d.plan_date);
      }
      dirtyRef.current.clear();
      toast.success("সেইভ হয়েছে");
    } catch (e: any) {
      toast.error(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  function autofillRotation(person: string) {
    if (!locations.length) { toast.error("কোন লোকেশন নেই"); return; }
    days.forEach((date, i) => {
      const loc = locations[i % locations.length].name;
      setCell(person, date, "location", loc);
    });
    toast.success(`${person}: রোটেশন অনুযায়ী পূরণ হয়েছে`);
  }

  function clearPerson(person: string) {
    days.forEach((date) => {
      const cell = rows[person]?.[date];
      if (cell?.location || cell?.notes) {
        setCell(person, date, "location", "");
        setCell(person, date, "notes", "");
      }
    });
  }

  // Export helpers
  function buildExportRows(person: string) {
    return days.map((date) => {
      const cell = rows[person]?.[date];
      return {
        date,
        display: ddmmyy(date),
        location: cell?.location ?? "",
        notes: cell?.notes ?? "",
      };
    });
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    selectedPersons.forEach((p) => {
      const data = buildExportRows(p).map((r) => ({
        Date: r.display,
        Location: r.location,
        Notes: r.notes,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, ws, p.slice(0, 30));
    });
    const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });
    XLSX.writeFile(wb, `tour-plan-${monthName}-${year}.xlsx`);
  }

  async function exportPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const logo = await urlToDataUrl(companyLogo);
    const footer = await urlToDataUrl(companyFooter);
    const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

    selectedPersons.forEach((person, idx) => {
      if (idx > 0) doc.addPage();
      if (logo) try {
        const w = 280, h = w * (300 / 1920);
        doc.addImage(logo, "PNG", margin, 20, w, h);
      } catch {}
      doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text(`Monthly Tour Plan — ${monthName} ${year}`, margin, 90);
      doc.setFont("helvetica", "normal"); doc.setFontSize(12);
      doc.setTextColor(71, 85, 105);
      doc.text(`Team Member: ${person}`, margin, 110);

      autoTable(doc, {
        startY: 130,
        head: [["Date", "Location", "Notes"]],
        body: buildExportRows(person).map((r) => [r.display, r.location, r.notes]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 160 } },
        theme: "grid",
      });

      // signature
      const sigY = pageH - 110;
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, sigY, margin + 200, sigY);
      doc.line(pageW - margin - 200, sigY, pageW - margin, sigY);
      doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text("Prepared by", margin, sigY + 14);
      doc.text("Authorized Signature", pageW - margin - 200, sigY + 14);
    });

    // footer on all pages
    if (footer) {
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        try {
          const w = pageW - margin * 2;
          const h = Math.min(56, w * (180 / 1920));
          doc.addImage(footer, "PNG", margin, pageH - h - 18, w, h);
        } catch {}
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 8, { align: "right" });
      }
    }
    doc.save(`tour-plan-${monthName}-${year}.pdf`);
  }

  function printPlan() {
    const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });
    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Tour Plan ${esc(monthName)} ${year}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0f172a;padding:24px;}
        h1{margin:0 0 4px;font-size:20px}
        h2{margin:18px 0 8px;font-size:14px;color:#334155}
        table{border-collapse:collapse;width:100%;margin-bottom:24px;}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;font-size:12px;text-align:left;}
        th{background:#0f172a;color:#fff}
        tr:nth-child(even) td{background:#f8fafc}
        .person{page-break-after:always}
        .person:last-child{page-break-after:auto}
        .sig{margin-top:40px;display:flex;justify-content:space-between;font-size:11px;color:#475569}
        .sig div{border-top:1px solid #94a3b8;width:200px;padding-top:6px;text-align:center}
      </style></head><body>
      <h1>Monthly Tour Plan — ${esc(monthName)} ${year}</h1>
      ${selectedPersons.map((person) => `
        <div class="person">
          <h2>Team Member: ${esc(person)}</h2>
          <table><thead><tr><th style="width:90px">Date</th><th style="width:200px">Location</th><th>Notes</th></tr></thead>
          <tbody>
            ${buildExportRows(person).map((r) => `<tr><td>${esc(r.display)}</td><td>${esc(r.location)}</td><td>${esc(r.notes)}</td></tr>`).join("")}
          </tbody></table>
          <div class="sig"><div>Prepared by</div><div>Authorized Signature</div></div>
        </div>
      `).join("")}
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup blocked"); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  if (!ready || loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 1 + i);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <ArrowLeft className="size-3.5" /> Back
            </Link>
            <h1 className="text-lg font-semibold">Monthly Tour Plan</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={saveAll} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-60">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
            </button>
            <button onClick={printPlan} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <Printer className="size-3.5" /> Print
            </button>
            <button onClick={exportPDF} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <FileText className="size-3.5" /> PDF
            </button>
            <button onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <FileDown className="size-3.5" /> Excel
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Controls */}
        <section className="rounded-xl border bg-card p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Month</label>
            <select value={month} onChange={(e) => setMonth(+e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString("en", { month: "long" })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(+e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground block mb-1">Include in Print / Export</label>
            <div className="flex flex-wrap gap-2">
              {persons.map((p) => {
                const on = selectedPersons.includes(p.name);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersons((prev) => on ? prev.filter((x) => x !== p.name) : [...prev, p.name])}
                    className={`rounded-full px-3 py-1 text-xs border transition ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Per-person editable plan */}
        {persons.map((p) => {
          const n = daysInMonth(year, month);
          return (
            <section key={p.id} className="rounded-xl border bg-card shadow-sm">
              <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <span className="text-xs text-muted-foreground">({n} days)</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => autofillRotation(p.name)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                    <Wand2 className="size-3" /> Auto-fill rotation
                  </button>
                  <button onClick={() => clearPerson(p.name)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                    Clear
                  </button>
                </div>
              </div>
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2 w-28">Date</th>
                      <th className="text-left p-2 w-56">Location</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((date) => {
                      const cell = rows[p.name]?.[date];
                      const dayName = new Date(date).toLocaleDateString("en", { weekday: "short" });
                      const isFri = new Date(date).getDay() === 5;
                      return (
                        <tr key={date} className={`border-t ${isFri ? "bg-muted/40" : ""}`}>
                          <td className="p-2 whitespace-nowrap">
                            <div className="font-medium">{ddmmyy(date)}</div>
                            <div className="text-xs text-muted-foreground">{dayName}</div>
                          </td>
                          <td className="p-2">
                            <input
                              list="loc-list"
                              value={cell?.location ?? ""}
                              onChange={(e) => setCell(p.name, date, "location", e.target.value)}
                              placeholder="Location"
                              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={cell?.notes ?? ""}
                              onChange={(e) => setCell(p.name, date, "notes", e.target.value)}
                              placeholder="Notes (optional)"
                              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <datalist id="loc-list">
          {locations.map((l) => <option key={l.id} value={l.name} />)}
        </datalist>
      </div>
    </main>
  );
}

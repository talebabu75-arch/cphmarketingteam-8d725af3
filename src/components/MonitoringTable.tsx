import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SLOTS, STATUSES, statusClass, type SlotKey } from "@/lib/dashboard-config";
import { useDashboardLists } from "@/lib/use-lists";
import { ManageListsDialog } from "@/components/ManageListsDialog";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { parseMonitoringPdf } from "@/lib/pdf-import";
import { MonthlyAnalysis } from "@/components/MonthlyAnalysis";

type Entry = {
  id?: string;
  entry_date: string;
  person: string;
  location: string | null;
  slot_10: string | null;
  slot_11: string | null;
  slot_14: string | null;
};

type CellKey = `${string}|${string}`; // date|person

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function fmtDate(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function MonitoringTable() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [entries, setEntries] = useState<Map<CellKey, Entry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const { persons: personItems, locations: locationItems, refresh: refreshLists } = useDashboardLists();
  const PERSONS = useMemo(() => personItems.map((p) => p.name), [personItems]);
  const LOCATIONS = useMemo(() => locationItems.map((l) => l.name), [locationItems]);
  const savingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const days = daysInMonth(year, month);
  const monthStart = fmtDate(year, month, 1);
  const monthEnd = fmtDate(year, month, days);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("monitoring_entries")
      .select("*")
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast.error(error.message);
        const map = new Map<CellKey, Entry>();
        (data ?? []).forEach((row: any) => {
          map.set(`${row.entry_date}|${row.person}`, row as Entry);
        });
        setEntries(map);
        setLoading(false);
      });
    return () => { active = false; };
  }, [monthStart, monthEnd]);

  const monthName = useMemo(
    () => new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" }),
    [year, month],
  );

  function getCell(date: string, person: string): Entry {
    return entries.get(`${date}|${person}`) ?? {
      entry_date: date, person, location: null, slot_10: null, slot_11: null, slot_14: null,
    };
  }

  function update(date: string, person: string, field: "location" | SlotKey, value: string) {
    const key: CellKey = `${date}|${person}`;
    const current = getCell(date, person);
    const next: Entry = { ...current, [field]: value || null };
    setEntries((prev) => new Map(prev).set(key, next));

    const existing = savingRef.current.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      const payload = {
        entry_date: next.entry_date,
        person: next.person,
        location: next.location,
        slot_10: next.slot_10,
        slot_11: next.slot_11,
        slot_14: next.slot_14,
      };
      const { data, error } = await supabase
        .from("monitoring_entries")
        .upsert(payload, { onConflict: "entry_date,person" })
        .select()
        .single();
      if (error) {
        toast.error(`Save failed: ${error.message}`);
        return;
      }
      setEntries((prev) => {
        const m = new Map(prev);
        m.set(key, data as Entry);
        return m;
      });
    }, 400);
    savingRef.current.set(key, t);
  }

  function prevMonth() {
    const d = new Date(year, month - 1, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(year, month + 1, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth());
  }

  function downloadPdf(selectedPersons?: string[]) {
    const personsList = selectedPersons && selectedPersons.length > 0 ? selectedPersons : PERSONS;
    const isFiltered = selectedPersons && selectedPersons.length > 0 && selectedPersons.length < PERSONS.length;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

    // Colored header band
    doc.setFillColor(37, 99, 235); // blue
    doc.rect(0, 0, pageWidth, 90, "F");
    doc.setFillColor(29, 78, 216); // darker blue accent strip
    doc.rect(0, 86, pageWidth, 4, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Monitoring Marketing Team work", pageWidth / 2, 34, { align: "center" });

    doc.setTextColor(254, 240, 138); // soft yellow
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(14);
    doc.text("Location Update", pageWidth / 2, 56, { align: "center" });

    doc.setTextColor(219, 234, 254); // light blue
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Month- ${monthLabel}`, pageWidth / 2, 76, { align: "center" });

    // reset for table
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");

    const head1: any[] = [{ content: "Date", rowSpan: 2 }];
    personsList.forEach((p) => head1.push({ content: p, colSpan: 4 }));
    const head2: any[] = [];
    personsList.forEach(() => {
      head2.push("Location");
      SLOTS.forEach((s) => head2.push(s.label));
    });

    const body = Array.from({ length: days }, (_, i) => i + 1).map((day) => {
      const date = fmtDate(year, month, day);
      const row: any[] = [
        `${String(day).padStart(2, "0")} ${new Date(year, month, day).toLocaleString(undefined, { weekday: "short" })}`,
      ];
      personsList.forEach((person) => {
        const c = getCell(date, person);
        row.push(c.location ?? "");
        SLOTS.forEach((s) => row.push((c[s.key] as string) ?? ""));
      });
      return row;
    });

    const statusColors: Record<string, [number, number, number]> = {
      "Yes": [187, 247, 208],
      "No": [254, 165, 165],
      "D.off": [254, 215, 170],
      "L.off": [191, 219, 254],
      "Off day": [254, 202, 202],
    };

    autoTable(doc, {
      head: [head1, head2],
      body,
      startY: 105,
      styles: { fontSize: 7, cellPadding: 3, halign: "center", valign: "middle" },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { halign: "left", cellWidth: 70, fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0) return;
        const relCol = (data.column.index - 1) % 4;
        if (relCol === 0) return; // location
        const val = String(data.cell.raw ?? "");
        const c = statusColors[val];
        if (c) data.cell.styles.fillColor = c;
      },
    });

    // Signature footer on the last page
    const finalY = (doc as any).lastAutoTable?.finalY ?? 105;
    const pageHeight = doc.internal.pageSize.getHeight();
    const sigLabels = ["Prepared By", "Marketing Manager", "Manager"];
    const sigBlockHeight = 70;
    let sigY = finalY + 40;
    if (sigY + sigBlockHeight > pageHeight - 30) {
      doc.addPage();
      sigY = 80;
    }

    const margin = 60;
    const usable = pageWidth - margin * 2;
    const slot = usable / sigLabels.length;
    const lineWidth = 160;

    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.6);
    doc.setTextColor(30, 30, 30);

    sigLabels.forEach((label, i) => {
      const cx = margin + slot * i + slot / 2;
      const lineY = sigY + 30;
      doc.line(cx - lineWidth / 2, lineY, cx + lineWidth / 2, lineY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(label, cx, lineY + 16, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text("(Signature & Date)", cx, lineY + 30, { align: "center" });
      doc.setTextColor(30, 30, 30);
    });

    doc.save(`monitoring-${year}-${String(month + 1).padStart(2, "0")}.pdf`);
  }

  function downloadExcel() {
    // Header rows
    const header1: string[] = ["Date"];
    PERSONS.forEach((p) => {
      header1.push(p, "", "", "");
    });
    const header2: string[] = [""];
    PERSONS.forEach(() => {
      header2.push("Location", ...SLOTS.map((s) => s.label));
    });

    const rows: (string | number)[][] = [header1, header2];
    for (let day = 1; day <= days; day++) {
      const date = fmtDate(year, month, day);
      const row: (string | number)[] = [date];
      PERSONS.forEach((person) => {
        const c = getCell(date, person);
        row.push(c.location ?? "");
        SLOTS.forEach((s) => row.push((c[s.key] as string) ?? ""));
      });
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Merge person name across 4 cols in header row 1
    ws["!merges"] = PERSONS.map((_, i) => ({
      s: { r: 0, c: 1 + i * 4 },
      e: { r: 0, c: 1 + i * 4 + 3 },
    }));
    ws["!cols"] = [{ wch: 12 }, ...PERSONS.flatMap(() => [{ wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }])];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthName);
    XLSX.writeFile(wb, `monitoring-${year}-${String(month + 1).padStart(2, "0")}.xlsx`);
  }

  async function handleImportExcel(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      if (aoa.length < 3) {
        toast.error("Excel ফাইলে কোনো ডাটা নেই");
        return;
      }
      // Row 0: Date | Person1 (merged 4) | Person2 ... → after unmerge, name appears only in first col
      const row0 = aoa[0] as string[];
      const row1 = aoa[1] as string[];

      // Determine person columns. Each person occupies 4 cols. Start at col 1.
      const personNames: string[] = [];
      for (let c = 1; c + 3 < row0.length || c < row0.length; c += 4) {
        const name = String(row0[c] ?? "").trim();
        if (!name) break;
        personNames.push(name);
        if (c + 4 >= row0.length) break;
      }
      if (personNames.length === 0) {
        toast.error("Person column খুঁজে পাওয়া যায়নি");
        return;
      }

      const payload: any[] = [];
      const statusSet = new Set<string>(STATUSES);

      for (let r = 2; r < aoa.length; r++) {
        const row = aoa[r] as any[];
        const dateRaw = row[0];
        if (!dateRaw) continue;
        let entry_date = "";
        if (typeof dateRaw === "number") {
          // Excel serial date
          const d = XLSX.SSF.parse_date_code(dateRaw);
          if (!d) continue;
          entry_date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        } else {
          const s = String(dateRaw).trim();
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (!m) continue;
          entry_date = `${m[1]}-${m[2]}-${m[3]}`;
        }

        personNames.forEach((person, pi) => {
          const base = 1 + pi * 4;
          const location = String(row[base] ?? "").trim() || null;
          const norm = (v: any) => {
            const s = String(v ?? "").trim();
            if (!s) return null;
            return statusSet.has(s) ? s : null;
          };
          const slot_10 = norm(row[base + 1]);
          const slot_11 = norm(row[base + 2]);
          const slot_14 = norm(row[base + 3]);
          if (!location && !slot_10 && !slot_11 && !slot_14) return;
          payload.push({ entry_date, person, location, slot_10, slot_11, slot_14 });
        });
      }

      if (payload.length === 0) {
        toast.error("Import করার মতো কোনো রো পাওয়া যায়নি");
        return;
      }

      toast.message(`${payload.length}টি রো import হচ্ছে…`);
      const { error } = await supabase
        .from("monitoring_entries")
        .upsert(payload, { onConflict: "entry_date,person" });
      if (error) {
        toast.error(`Import failed: ${error.message}`);
        return;
      }
      toast.success(`${payload.length}টি রো সফলভাবে import হয়েছে`);
      // Refresh current month view
      const { data } = await supabase
        .from("monitoring_entries")
        .select("*")
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd);
      const map = new Map<CellKey, Entry>();
      (data ?? []).forEach((row: any) => map.set(`${row.entry_date}|${row.person}`, row as Entry));
      setEntries(map);
    } catch (e: any) {
      toast.error(`Parse error: ${e.message ?? e}`);
    }
  }

  async function handleImportPdf(file: File) {
    try {
      toast.message("PDF পড়া হচ্ছে…");
      const payload = await parseMonitoringPdf(file, PERSONS);
      if (payload.length === 0) {
        toast.error("PDF থেকে কোনো রো পাওয়া যায়নি");
        return;
      }
      toast.message(`${payload.length}টি রো import হচ্ছে…`);
      const { error } = await supabase
        .from("monitoring_entries")
        .upsert(payload, { onConflict: "entry_date,person" });
      if (error) {
        toast.error(`Import failed: ${error.message}`);
        return;
      }
      toast.success(`${payload.length}টি রো সফলভাবে import হয়েছে`);
      const { data } = await supabase
        .from("monitoring_entries")
        .select("*")
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd);
      const map = new Map<CellKey, Entry>();
      (data ?? []).forEach((row: any) => map.set(`${row.entry_date}|${row.person}`, row as Entry));
      setEntries(map);
    } catch (e: any) {
      toast.error(`PDF parse error: ${e.message ?? e}`);
    }
  }





  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">←</button>
          <div className="rounded-md border bg-card px-4 py-1.5 text-sm font-medium min-w-[180px] text-center">{monthName}</div>
          <button onClick={nextMonth} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">→</button>
          <button onClick={downloadPdf} className="ml-2 rounded-md border bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 transition">
            Download PDF
          </button>
          <button onClick={downloadExcel} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
            Download Excel
          </button>
          <label className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition cursor-pointer">
            Import Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportExcel(f);
                e.target.value = "";
              }}
            />
          </label>
          <label className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition cursor-pointer">
            Import PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportPdf(f);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={() => setManageOpen(true)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
            Manage Lists
          </button>

        </div>
        <Legend />
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[75vh]">
          <table className="border-separate border-spacing-0 text-xs w-full">
            <thead className="sticky top-0 z-20">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-30 bg-primary text-primary-foreground px-3 py-2 text-left font-medium border-r border-primary/40 min-w-[90px]">
                  Date
                </th>
                {PERSONS.map((p) => (
                  <th key={p} colSpan={4} className="bg-primary text-primary-foreground px-3 py-2 font-medium border-l border-primary/40">
                    {p}
                  </th>
                ))}
              </tr>
              <tr>
                {PERSONS.map((p) => (
                  <Fragment key={p}>
                    <th className="bg-primary/90 text-primary-foreground/90 px-2 py-1.5 font-normal text-[11px] border-l border-primary/40 min-w-[140px]">Location</th>
                    {SLOTS.map((s) => (
                      <th key={s.key} className="bg-primary/90 text-primary-foreground/90 px-2 py-1.5 font-normal text-[11px] min-w-[88px]">{s.label}</th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={1 + PERSONS.length * 4} className="text-center text-muted-foreground py-10">Loading…</td></tr>
              ) : (
                Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                  const date = fmtDate(year, month, day);
                  const isToday =
                    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  return (
                    <tr key={date} className="group">
                      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium border-t border-r bg-card group-hover:bg-accent/40 ${isToday ? "text-primary" : ""}`}>
                        {String(day).padStart(2, "0")} {new Date(year, month, day).toLocaleString(undefined, { weekday: "short" })}
                      </td>
                      {PERSONS.map((person) => {
                        const cell = getCell(date, person);
                        return (
                          <Fragment key={person}>
                            <td className="border-t border-l px-1 py-1">
                              <SelectBox
                                value={cell.location ?? ""}
                                onChange={(v) => update(date, person, "location", v)}
                                placeholder="Location"
                                options={LOCATIONS}
                              />
                            </td>
                            {SLOTS.map((s) => (
                              <td key={s.key} className="border-t px-1 py-1">
                                <StatusBox
                                  value={(cell[s.key] as string) ?? ""}
                                  onChange={(v) => update(date, person, s.key, v)}
                                />
                              </td>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>



      <MonthlyAnalysis
        entries={Array.from(entries.values())}
        persons={PERSONS}
        monthName={monthName}
      />



      <ManageListsDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        persons={personItems}
        locations={locationItems}
        onChanged={refreshLists}
      />
    </section>
  );
}

function SelectBox({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: readonly string[]; placeholder: string;
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function StatusBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring transition ${statusClass(value)}`}
    >
      <option value="">—</option>
      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {STATUSES.map((s) => (
        <span key={s} className={`px-2 py-1 rounded-md border ${statusClass(s)}`}>{s}</span>
      ))}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SLOTS, STATUSES, statusClass } from "@/lib/dashboard-config";
import { useDashboardLists } from "@/lib/use-lists";
import { ArrowLeft, FileText, Download, FileDown } from "lucide-react";
import { generateReportPDF } from "@/lib/pdf-report";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, LineChart, Line, Cell,
} from "recharts";
import { Trophy, TrendingDown, Grid3x3, Target, Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateSmartSuggestions } from "@/lib/insights.functions";
import { toast } from "sonner";

type Entry = {
  entry_date: string;
  person: string;
  location: string | null;
  slot_10: string | null;
  slot_11: string | null;
  slot_14: string | null;
};

const COLORS: Record<string, string> = {
  "Yes": "#22c55e", "No": "#ef4444", "D.off": "#f97316",
  "L.off": "#3b82f6", "Off day": "#a855f7",
};

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Advanced Reports — Marketing Monitoring" },
      { name: "description", content: "Person-wise, daily, weekly, and monthly comparison reports." },
    ],
  }),
  component: ReportsPage,
});

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function countEntry(e: Entry, bucket: Record<string, number>) {
  const vals = SLOTS.map((s) => e[s.key as "slot_10" | "slot_11" | "slot_14"])
    .filter((v): v is string => !!v && STATUSES.includes(v as any));
  const allOff = vals.length === SLOTS.length && vals.every((v) => v === "Off day");
  let dDoff = 0;
  vals.forEach((v) => {
    if (allOff && v === "Off day") return;
    bucket[v] = (bucket[v] ?? 0) + 1;
    if (v === "D.off") dDoff += 1;
  });
  if (allOff) bucket["Off day"] = (bucket["Off day"] ?? 0) + 1;
  return { extraDoff: dDoff > 1 ? dDoff - 1 : 0 };
}

function score(b: Record<string, number>, extraDoff: number) {
  const yes = b["Yes"] ?? 0, no = b["No"] ?? 0, loff = b["L.off"] ?? 0;
  const denom = yes + no + loff + extraDoff;
  return denom > 0 ? Math.round((yes / denom) * 100) : 0;
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState<Entry[]>([]);
  const { persons } = useDashboardLists();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login", replace: true });
      else setAuthed(true);
    });
  }, [navigate]);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      const { data } = await supabase
        .from("monitoring_entries")
        .select("entry_date,person,location,slot_10,slot_11,slot_14")
        .gte("entry_date", `${year}-01-01`)
        .lte("entry_date", `${year}-12-31`)
        .order("entry_date");
      setEntries((data as Entry[]) ?? []);
    })();
  }, [authed, year]);

  if (!authed) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <ArrowLeft className="size-3.5" /> Back
            </Link>
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <FileText className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Advanced Reports</h1>
              <p className="text-xs text-muted-foreground">Detailed performance reports & comparisons</p>
            </div>
          </div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border bg-card px-3 py-1.5 text-sm"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Tabs defaultValue="person" className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-7 w-full sm:w-auto">
            <TabsTrigger value="person">Person-wise</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="kpi">KPI</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="size-3.5 mr-1" />AI</TabsTrigger>
          </TabsList>

          <TabsContent value="person">
            <PersonReport entries={entries} persons={persons.map((p) => p.name)} year={year} />
          </TabsContent>
          <TabsContent value="daily">
            <DailyReport entries={entries} persons={persons.map((p) => p.name)} />
          </TabsContent>
          <TabsContent value="weekly">
            <WeeklyReport entries={entries} persons={persons.map((p) => p.name)} year={year} />
          </TabsContent>
          <TabsContent value="monthly">
            <MonthlyComparison entries={entries} persons={persons.map((p) => p.name)} year={year} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab entries={entries} persons={persons.map((p) => p.name)} year={year} />
          </TabsContent>
          <TabsContent value="kpi">
            <KpiTab entries={entries} persons={persons.map((p) => p.name)} year={year} />
          </TabsContent>
          <TabsContent value="ai">
            <SmartSuggestionsTab entries={entries} persons={persons.map((p) => p.name)} year={year} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

/* ---------- Person-wise Report ---------- */
function PersonReport({ entries, persons, year }: { entries: Entry[]; persons: string[]; year: number }) {
  const rows = useMemo(() => {
    return persons.map((p) => {
      const b: Record<string, number> = {};
      STATUSES.forEach((s) => (b[s] = 0));
      let extra = 0, days = 0;
      entries.filter((e) => e.person === p).forEach((e) => {
        days += 1;
        const r = countEntry(e, b);
        extra += r.extraDoff;
      });
      return { name: p, ...b, extra, days, score: score(b, extra) };
    }).sort((a, b) => b.score - a.score);
  }, [entries, persons]);

  const handleExport = () => {
    const header = ["Rank", "Name", ...STATUSES, "Extra D.off", "Days", "Score %"];
    const body = rows.map((r, i) => [i + 1, r.name, ...STATUSES.map((s) => (r as any)[s]), r.extra, r.days, r.score]);
    downloadCSV(`person-report-${year}.csv`, [header, ...body]);
  };

  const handlePDF = () => {
    const topPerformer = rows[0]?.name ?? "—";
    const avgScore = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0;
    const totalVisits = rows.reduce((a, r) => a + ((r as any)["Yes"] ?? 0), 0);
    generateReportPDF({
      title: "Person-wise Annual Report",
      subtitle: `Performance summary for the year ${year}`,
      summary: [
        { label: "Total Staff", value: rows.length },
        { label: "Top Performer", value: topPerformer },
        { label: "Avg Score", value: `${avgScore}%` },
        { label: "Total Visits", value: totalVisits },
      ],
      sections: [{
        title: "Performance Ranking",
        head: ["#", "Name", ...STATUSES, "Extra D.off", "Days", "Score %"],
        body: rows.map((r, i) => [i + 1, r.name, ...STATUSES.map((s) => (r as any)[s] || "-"), r.extra || "-", r.days, `${r.score}%`]),
      }],
      filename: `person-report-${year}.pdf`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Person-wise Annual Report</h2>
          <p className="text-sm text-muted-foreground">প্রতিটি পার্সনের {year} সালের সম্পূর্ণ পারফর্মেন্স</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePDF} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90">
            <FileDown className="size-3.5" /> One-Click PDF
          </button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-4">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {STATUSES.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={COLORS[s]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                {STATUSES.map((s) => <th key={s} className="px-3 py-2 text-center">{s}</th>)}
                <th className="px-3 py-2 text-center">Extra D.off</th>
                <th className="px-3 py-2 text-center">Days</th>
                <th className="px-3 py-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link to="/person/$name" params={{ name: r.name }} className="hover:text-primary hover:underline">{r.name}</Link>
                  </td>
                  {STATUSES.map((s) => <td key={s} className="px-3 py-2 text-center">{(r as any)[s] || "—"}</td>)}
                  <td className="px-3 py-2 text-center">{r.extra || "—"}</td>
                  <td className="px-3 py-2 text-center">{r.days}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block min-w-[52px] rounded-md px-2 py-1 text-xs font-semibold ${
                      r.score >= 80 ? "bg-status-yes text-status-yes-foreground"
                      : r.score >= 50 ? "bg-status-loff text-status-loff-foreground"
                      : "bg-status-no text-status-no-foreground"
                    }`}>{r.score}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Daily Report ---------- */
function DailyReport({ entries, persons }: { entries: Entry[]; persons: string[] }) {
  const [date, setDate] = useState(todayISO());
  const dayEntries = useMemo(() => entries.filter((e) => e.entry_date === date), [entries, date]);

  const handleExport = () => {
    const header = ["Person", "Location", ...SLOTS.map((s) => s.label)];
    const body = persons.map((p) => {
      const e = dayEntries.find((x) => x.person === p);
      return [p, e?.location ?? "—", ...SLOTS.map((s) => e?.[s.key as "slot_10" | "slot_11" | "slot_14"] ?? "—")];
    });
    downloadCSV(`daily-report-${date}.csv`, [header, ...body]);
  };

  const handlePDF = () => {
    let present = 0, leave = 0, visits = 0;
    dayEntries.forEach((e) => {
      const vals = SLOTS.map((s) => e[s.key as "slot_10" | "slot_11" | "slot_14"]).filter((v): v is string => !!v);
      if (vals.includes("Yes")) present += 1;
      else if (vals.includes("L.off") || vals.every((v) => v === "Off day")) leave += 1;
      vals.forEach((v) => { if (v === "Yes") visits += 1; });
    });
    generateReportPDF({
      title: "Daily Activity Report",
      subtitle: `Date: ${new Date(date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      summary: [
        { label: "Total Staff", value: persons.length },
        { label: "Present", value: present },
        { label: "On Leave", value: leave },
        { label: "Total Visits", value: visits },
      ],
      sections: [{
        title: "Daily Status by Person",
        head: ["Person", "Location", ...SLOTS.map((s) => s.label)],
        body: persons.map((p) => {
          const e = dayEntries.find((x) => x.person === p);
          return [p, e?.location ?? "-", ...SLOTS.map((s) => e?.[s.key as "slot_10" | "slot_11" | "slot_14"] ?? "-")];
        }),
      }],
      filename: `daily-report-${date}.pdf`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Daily Report</h2>
          <p className="text-sm text-muted-foreground">নির্দিষ্ট দিনের বিস্তারিত রিপোর্ট</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-card px-3 py-1.5 text-sm"
          />
          <button onClick={handlePDF} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90">
            <FileDown className="size-3.5" /> One-Click PDF
          </button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Person</th>
                <th className="px-3 py-2 text-left">Location</th>
                {SLOTS.map((s) => <th key={s.key} className="px-3 py-2 text-center">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {persons.map((p) => {
                const e = dayEntries.find((x) => x.person === p);
                return (
                  <tr key={p} className="border-t hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium">{p}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e?.location ?? "—"}</td>
                    {SLOTS.map((s) => {
                      const v = e?.[s.key as "slot_10" | "slot_11" | "slot_14"];
                      return (
                        <td key={s.key} className="px-3 py-2 text-center">
                          {v ? <span className={`inline-block px-2 py-0.5 rounded-md text-xs ${statusClass(v)}`}>{v}</span> : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Weekly Report ---------- */
function WeeklyReport({ entries, persons, year }: { entries: Entry[]; persons: string[]; year: number }) {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week

  const { start, end, label } = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7) + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: todayISO(monday),
      end: todayISO(sunday),
      label: `${monday.toLocaleDateString()} – ${sunday.toLocaleDateString()}`,
    };
  }, [weekOffset]);

  const rows = useMemo(() => {
    const inRange = entries.filter((e) => e.entry_date >= start && e.entry_date <= end);
    return persons.map((p) => {
      const b: Record<string, number> = {};
      STATUSES.forEach((s) => (b[s] = 0));
      let extra = 0, days = 0;
      inRange.filter((e) => e.person === p).forEach((e) => {
        days += 1;
        const r = countEntry(e, b);
        extra += r.extraDoff;
      });
      return { name: p, ...b, extra, days, score: score(b, extra) };
    }).sort((a, b) => b.score - a.score);
  }, [entries, persons, start, end]);

  const handleExport = () => {
    const header = ["Name", ...STATUSES, "Extra D.off", "Days", "Score %"];
    const body = rows.map((r) => [r.name, ...STATUSES.map((s) => (r as any)[s]), r.extra, r.days, r.score]);
    downloadCSV(`weekly-report-${start}_${end}.csv`, [header, ...body]);
  };

  const handlePDF = () => {
    const topPerformer = rows[0]?.name ?? "—";
    const avgScore = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0;
    const totalVisits = rows.reduce((a, r) => a + ((r as any)["Yes"] ?? 0), 0);
    generateReportPDF({
      title: "Weekly Performance Report",
      subtitle: `${label} • Year ${year}`,
      summary: [
        { label: "Top Performer", value: topPerformer },
        { label: "Avg Score", value: `${avgScore}%` },
        { label: "Total Visits", value: totalVisits },
        { label: "Active Days", value: rows.reduce((a, r) => a + r.days, 0) },
      ],
      sections: [{
        title: "Weekly Performance Ranking",
        head: ["Name", ...STATUSES, "Extra D.off", "Days", "Score %"],
        body: rows.map((r) => [r.name, ...STATUSES.map((s) => (r as any)[s] || "-"), r.extra || "-", r.days, `${r.score}%`]),
      }],
      filename: `weekly-report-${start}_${end}.pdf`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Weekly Report</h2>
          <p className="text-sm text-muted-foreground">{label} ({year})</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setWeekOffset(weekOffset - 1)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">← Prev</button>
          <button onClick={() => setWeekOffset(0)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">This Week</button>
          <button onClick={() => setWeekOffset(weekOffset + 1)} disabled={weekOffset >= 0} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40">Next →</button>
          <button onClick={handlePDF} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90">
            <FileDown className="size-3.5" /> PDF
          </button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-4">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {STATUSES.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={COLORS[s]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                {STATUSES.map((s) => <th key={s} className="px-3 py-2 text-center">{s}</th>)}
                <th className="px-3 py-2 text-center">Days</th>
                <th className="px-3 py-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  {STATUSES.map((s) => <td key={s} className="px-3 py-2 text-center">{(r as any)[s] || "—"}</td>)}
                  <td className="px-3 py-2 text-center">{r.days}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block min-w-[52px] rounded-md px-2 py-1 text-xs font-semibold ${
                      r.score >= 80 ? "bg-status-yes text-status-yes-foreground"
                      : r.score >= 50 ? "bg-status-loff text-status-loff-foreground"
                      : "bg-status-no text-status-no-foreground"
                    }`}>{r.score}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Monthly Comparison ---------- */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthlyComparison({ entries, persons, year }: { entries: Entry[]; persons: string[]; year: number }) {
  const data = useMemo(() => {
    return MONTH_NAMES.map((mn, mi) => {
      const monthEntries = entries.filter((e) => new Date(e.entry_date).getMonth() === mi);
      const row: any = { month: mn };
      persons.forEach((p) => {
        const b: Record<string, number> = {};
        STATUSES.forEach((s) => (b[s] = 0));
        let extra = 0;
        monthEntries.filter((e) => e.person === p).forEach((e) => {
          const r = countEntry(e, b);
          extra += r.extraDoff;
        });
        row[p] = score(b, extra);
      });
      // overall yes count
      let totalYes = 0;
      monthEntries.forEach((e) => {
        SLOTS.forEach((s) => {
          if (e[s.key as "slot_10" | "slot_11" | "slot_14"] === "Yes") totalYes += 1;
        });
      });
      row.__visits = totalYes;
      return row;
    });
  }, [entries, persons]);

  const lineColors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#06b6d4", "#eab308", "#ec4899"];

  const handleExport = () => {
    const header = ["Month", ...persons, "Total Visits"];
    const body = data.map((d) => [d.month, ...persons.map((p) => d[p]), d.__visits]);
    downloadCSV(`monthly-comparison-${year}.csv`, [header, ...body]);
  };

  const handlePDF = () => {
    const totalVisits = data.reduce((a, d) => a + d.__visits, 0);
    const bestMonth = data.reduce((a, d) => (d.__visits > a.__visits ? d : a), data[0]);
    const personAvg = persons.map((p) => {
      const scores = data.map((d) => d[p]).filter((v) => v > 0);
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      return { p, avg };
    });
    const topPerson = personAvg.sort((a, b) => b.avg - a.avg)[0];
    generateReportPDF({
      title: "Monthly Comparison Report",
      subtitle: `12-month performance breakdown for ${year}`,
      summary: [
        { label: "Total Visits", value: totalVisits },
        { label: "Best Month", value: bestMonth?.month ?? "—" },
        { label: "Top Performer", value: topPerson?.p ?? "—" },
        { label: "Avg Score", value: `${topPerson?.avg ?? 0}%` },
      ],
      sections: [{
        title: "Monthly Performance Score (%)",
        head: ["Month", ...persons, "Visits"],
        body: data.map((d) => [d.month, ...persons.map((p) => (d[p] ? `${d[p]}%` : "-")), d.__visits]),
      }],
      filename: `monthly-comparison-${year}.pdf`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Monthly Comparison</h2>
          <p className="text-sm text-muted-foreground">{year} সালের ১২ মাসের পারফর্মেন্স তুলনা</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePDF} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90">
            <FileDown className="size-3.5" /> One-Click PDF
          </button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-4">
        <h3 className="text-sm font-medium mb-3">Performance Score (%) — Per Person Across Months</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {persons.map((p, i) => (
                <Line key={p} type="monotone" dataKey={p} stroke={lineColors[i % lineColors.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-4">
        <h3 className="text-sm font-medium mb-3">Total Visits per Month</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="__visits" name="Total Visits" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Month</th>
                {persons.map((p) => <th key={p} className="px-3 py-2 text-center">{p}</th>)}
                <th className="px-3 py-2 text-center">Visits</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium">{d.month}</td>
                  {persons.map((p) => (
                    <td key={p} className="px-3 py-2 text-center">
                      <span className={`inline-block min-w-[44px] rounded-md px-2 py-0.5 text-xs font-semibold ${
                        d[p] >= 80 ? "bg-status-yes text-status-yes-foreground"
                        : d[p] >= 50 ? "bg-status-loff text-status-loff-foreground"
                        : d[p] > 0 ? "bg-status-no text-status-no-foreground"
                        : "bg-muted text-muted-foreground"
                      }`}>{d[p] || "—"}{d[p] ? "%" : ""}</span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-medium">{d.__visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Analytics: Best Performer / Lowest Attendance / Heatmap ---------- */
function AnalyticsTab({ entries, persons, year }: { entries: Entry[]; persons: string[]; year: number }) {
  const [month, setMonth] = useState<number | "all">("all");

  const filtered = useMemo(() => {
    if (month === "all") return entries;
    return entries.filter((e) => new Date(e.entry_date).getMonth() === month);
  }, [entries, month]);

  // Per-person score / yes / no / loff
  const perPerson = useMemo(() => {
    return persons.map((p) => {
      const b: Record<string, number> = {};
      STATUSES.forEach((s) => (b[s] = 0));
      let extra = 0, days = 0;
      filtered.filter((e) => e.person === p).forEach((e) => {
        days += 1;
        const r = countEntry(e, b);
        extra += r.extraDoff;
      });
      return {
        name: p,
        score: score(b, extra),
        yes: b["Yes"] ?? 0,
        no: b["No"] ?? 0,
        loff: b["L.off"] ?? 0,
        days,
      };
    });
  }, [filtered, persons]);

  const bestPerformers = useMemo(
    () => [...perPerson].sort((a, b) => b.score - a.score || b.yes - a.yes),
    [perPerson],
  );
  const lowestAttendance = useMemo(
    () => [...perPerson].sort((a, b) => (a.score - b.score) || (b.no + b.loff - a.no - a.loff)),
    [perPerson],
  );

  // Heatmap: rows = persons, cols = days of selected month (or year-by-week if all)
  const heatmap = useMemo(() => {
    if (month === "all") {
      // 12 months × persons
      const cols = MONTH_NAMES.map((mn, mi) => ({ key: mn, idx: mi }));
      const matrix = persons.map((p) => {
        return cols.map(({ idx }) => {
          const monthEntries = entries.filter((e) => e.person === p && new Date(e.entry_date).getMonth() === idx);
          let yes = 0;
          monthEntries.forEach((e) => {
            SLOTS.forEach((s) => { if (e[s.key as "slot_10"|"slot_11"|"slot_14"] === "Yes") yes += 1; });
          });
          return yes;
        });
      });
      return { cols: cols.map((c) => c.key), matrix };
    }
    // days in this month
    const days = new Date(year, (month as number) + 1, 0).getDate();
    const cols = Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0"));
    const matrix = persons.map((p) => {
      return cols.map((_, di) => {
        const dateStr = `${year}-${String((month as number) + 1).padStart(2, "0")}-${String(di + 1).padStart(2, "0")}`;
        const e = entries.find((x) => x.person === p && x.entry_date === dateStr);
        if (!e) return 0;
        let yes = 0;
        SLOTS.forEach((s) => { if (e[s.key as "slot_10"|"slot_11"|"slot_14"] === "Yes") yes += 1; });
        return yes;
      });
    });
    return { cols, matrix };
  }, [entries, persons, year, month]);

  const maxHeat = Math.max(1, ...heatmap.matrix.flat());
  function heatColor(v: number) {
    if (v === 0) return "bg-muted/30";
    const r = v / maxHeat;
    if (r > 0.8) return "bg-green-600 text-white";
    if (r > 0.6) return "bg-green-500 text-white";
    if (r > 0.4) return "bg-green-400 text-green-950";
    if (r > 0.2) return "bg-green-300 text-green-950";
    return "bg-green-200 text-green-900";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Performance Analytics</h2>
          <p className="text-sm text-muted-foreground">Best performer, lowest attendance ও heatmap</p>
        </div>
        <select
          value={String(month)}
          onChange={(e) => setMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="rounded-md border bg-card px-3 py-1.5 text-sm"
        >
          <option value="all">Full year ({year})</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Best Performer */}
        <div className="rounded-xl border bg-card shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="size-4 text-yellow-600" />
            <h3 className="text-sm font-semibold">Best Performers (by score)</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bestPerformers} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="score" name="Score %" radius={[0, 4, 4, 0]}>
                  {bestPerformers.map((r, i) => (
                    <Cell key={r.name} fill={i === 0 ? "#eab308" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "#22c55e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="mt-3 space-y-1 text-sm">
            {bestPerformers.slice(0, 5).map((r, i) => (
              <li key={r.name} className="flex justify-between border-b last:border-0 py-1">
                <span><b>#{i + 1}</b> {r.name}</span>
                <span className="text-muted-foreground">{r.score}% • {r.yes} visits</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Lowest Attendance */}
        <div className="rounded-xl border bg-card shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="size-4 text-red-600" />
            <h3 className="text-sm font-semibold">Lowest Attendance</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lowestAttendance.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="no" name="No" stackId="a" fill="#ef4444" />
                <Bar dataKey="loff" name="L.off" stackId="a" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="mt-3 space-y-1 text-sm">
            {lowestAttendance.slice(0, 5).map((r, i) => (
              <li key={r.name} className="flex justify-between border-b last:border-0 py-1">
                <span><b>#{i + 1}</b> {r.name}</span>
                <span className="text-muted-foreground">{r.score}% • {r.no + r.loff} absences</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-xl border bg-card shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Grid3x3 className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Visit Heatmap — {month === "all" ? `Yearly (by month)` : `${MONTH_NAMES[month as number]} ${year} (by day)`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left sticky left-0 bg-card">Person</th>
                {heatmap.cols.map((c) => (
                  <th key={c} className="px-1 py-1 font-normal text-muted-foreground min-w-[28px] text-center">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {persons.map((p, ri) => (
                <tr key={p}>
                  <td className="px-2 py-1 font-medium sticky left-0 bg-card whitespace-nowrap">{p}</td>
                  {heatmap.matrix[ri].map((v, ci) => (
                    <td key={ci} className={`text-center font-medium rounded ${heatColor(v)}`} style={{ minWidth: 28, height: 24 }}>
                      {v || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>Less</span>
          <span className="inline-block w-4 h-4 rounded bg-muted/30" />
          <span className="inline-block w-4 h-4 rounded bg-green-200" />
          <span className="inline-block w-4 h-4 rounded bg-green-400" />
          <span className="inline-block w-4 h-4 rounded bg-green-500" />
          <span className="inline-block w-4 h-4 rounded bg-green-600" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- KPI: Visit count / Attendance / Coverage / Performance % ---------- */
function KpiTab({ entries, persons, year }: { entries: Entry[]; persons: string[]; year: number }) {
  const [month, setMonth] = useState<number | "all">("all");

  const scoped = useMemo(() => {
    if (month === "all") return entries;
    return entries.filter((e) => new Date(e.entry_date).getMonth() === month);
  }, [entries, month]);

  // total working days in scope (non-Friday days that have any entry across team)
  const workingDays = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach((e) => {
      const dow = new Date(e.entry_date).getDay();
      if (dow !== 5) set.add(e.entry_date);
    });
    return set.size || 1;
  }, [scoped]);

  const rows = useMemo(() => {
    return persons.map((p) => {
      const my = scoped.filter((e) => e.person === p);
      let visits = 0;       // total "Yes" across slots
      let no = 0, loff = 0, doff = 0;
      let presentDays = 0;  // any "Yes" on that day
      const locations = new Set<string>();
      my.forEach((e) => {
        const vals = SLOTS.map((s) => e[s.key as "slot_10"|"slot_11"|"slot_14"]);
        let dayYes = 0;
        vals.forEach((v) => {
          if (v === "Yes") { visits += 1; dayYes += 1; }
          else if (v === "No") no += 1;
          else if (v === "L.off") loff += 1;
          else if (v === "D.off") doff += 1;
        });
        if (dayYes > 0) presentDays += 1;
        if (e.location && dayYes > 0) locations.add(e.location);
      });
      const attendance = Math.round((presentDays / workingDays) * 100);
      // visit rate vs. expected (3 slots per working day)
      const visitRate = Math.round((visits / (workingDays * SLOTS.length)) * 100);
      // performance: weighted composite (attendance 40%, visitRate 40%, coverage 20% capped at 10 locations)
      const coverageScore = Math.min(100, locations.size * 10);
      const performance = Math.round(attendance * 0.4 + visitRate * 0.4 + coverageScore * 0.2);
      return {
        name: p, visits, presentDays, attendance, visitRate,
        coverage: locations.size, coverageScore,
        no, loff, doff, performance,
      };
    }).sort((a, b) => b.performance - a.performance);
  }, [scoped, persons, workingDays]);

  const totals = useMemo(() => {
    const totalVisits = rows.reduce((a, r) => a + r.visits, 0);
    const avgAttendance = rows.length ? Math.round(rows.reduce((a, r) => a + r.attendance, 0) / rows.length) : 0;
    const avgPerformance = rows.length ? Math.round(rows.reduce((a, r) => a + r.performance, 0) / rows.length) : 0;
    const totalCoverage = new Set<string>();
    scoped.forEach((e) => { if (e.location) totalCoverage.add(e.location); });
    return { totalVisits, avgAttendance, avgPerformance, totalCoverage: totalCoverage.size };
  }, [rows, scoped]);

  const handlePDF = () => {
    generateReportPDF({
      title: "KPI Report — Staff Performance",
      subtitle: `${month === "all" ? `Full year ${year}` : `${MONTH_NAMES[month as number]} ${year}`} • ${workingDays} working days`,
      summary: [
        { label: "Total Visits", value: totals.totalVisits },
        { label: "Avg Attendance", value: `${totals.avgAttendance}%` },
        { label: "Avg Performance", value: `${totals.avgPerformance}%` },
        { label: "Locations Covered", value: totals.totalCoverage },
      ],
      sections: [{
        title: "KPI Scorecard",
        head: ["#", "Staff", "Visits", "Present", "Attendance", "Visit Rate", "Coverage", "Performance"],
        body: rows.map((r, i) => [
          i + 1, r.name, r.visits, `${r.presentDays}/${workingDays}`,
          `${r.attendance}%`, `${r.visitRate}%`, `${r.coverage} loc`, `${r.performance}%`,
        ]),
      }],
      filename: `kpi-report-${year}${month === "all" ? "" : `-${MONTH_NAMES[month as number]}`}.pdf`,
    });
  };

  const handleCSV = () => {
    const header = ["Rank", "Staff", "Visits", "Present Days", "Working Days", "Attendance %", "Visit Rate %", "Coverage", "Performance %"];
    const body = rows.map((r, i) => [i + 1, r.name, r.visits, r.presentDays, workingDays, r.attendance, r.visitRate, r.coverage, r.performance]);
    downloadCSV(`kpi-${year}${month === "all" ? "" : `-${MONTH_NAMES[month as number]}`}.csv`, [header, ...body]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Target className="size-5 text-primary" /> KPI Scorecard</h2>
          <p className="text-sm text-muted-foreground">Visit count • Attendance • Coverage • Performance %</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={String(month)}
            onChange={(e) => setMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-md border bg-card px-3 py-1.5 text-sm"
          >
            <option value="all">Full year ({year})</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
          </select>
          <button onClick={handlePDF} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90">
            <FileDown className="size-3.5" /> One-Click PDF
          </button>
          <button onClick={handleCSV} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Team-level summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Visits" value={totals.totalVisits} accent="bg-status-yes" />
        <KpiCard label="Avg Attendance" value={`${totals.avgAttendance}%`} accent="bg-status-loff" />
        <KpiCard label="Locations Covered" value={totals.totalCoverage} accent="bg-status-doff" />
        <KpiCard label="Avg Performance" value={`${totals.avgPerformance}%`} accent="bg-primary" />
      </div>

      {/* Per-staff scorecards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => (
          <div key={r.name} className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                  <h3 className="font-semibold">{r.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{r.presentDays}/{workingDays} working days</p>
              </div>
              <div className={`text-2xl font-bold ${
                r.performance >= 80 ? "text-green-600"
                : r.performance >= 50 ? "text-blue-600"
                : "text-red-600"
              }`}>
                {r.performance}%
              </div>
            </div>
            <KpiBar label="Visits" value={r.visits} sub={`${r.visitRate}% rate`} pct={r.visitRate} color="bg-green-500" />
            <KpiBar label="Attendance" value={`${r.attendance}%`} sub={`${r.presentDays} days`} pct={r.attendance} color="bg-blue-500" />
            <KpiBar label="Coverage" value={`${r.coverage} loc`} sub={`${r.coverageScore}% score`} pct={r.coverageScore} color="bg-orange-500" />
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Staff</th>
                <th className="px-3 py-2 text-center">Visits</th>
                <th className="px-3 py-2 text-center">Present</th>
                <th className="px-3 py-2 text-center">Attendance</th>
                <th className="px-3 py-2 text-center">Visit Rate</th>
                <th className="px-3 py-2 text-center">Coverage</th>
                <th className="px-3 py-2 text-center">Performance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link to="/person/$name" params={{ name: r.name }} className="hover:text-primary hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">{r.visits}</td>
                  <td className="px-3 py-2 text-center">{r.presentDays}/{workingDays}</td>
                  <td className="px-3 py-2 text-center">{r.attendance}%</td>
                  <td className="px-3 py-2 text-center">{r.visitRate}%</td>
                  <td className="px-3 py-2 text-center">{r.coverage} loc</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block min-w-[52px] rounded-md px-2 py-1 text-xs font-semibold ${
                      r.performance >= 80 ? "bg-status-yes text-status-yes-foreground"
                      : r.performance >= 50 ? "bg-status-loff text-status-loff-foreground"
                      : "bg-status-no text-status-no-foreground"
                    }`}>{r.performance}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20">
          <b>Performance %</b> = Attendance × 40% + Visit Rate × 40% + Coverage × 20%
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 ${accent}`} />
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function KpiBar({ label, value, sub, pct, color }: { label: string; value: string | number; sub: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value} · {sub}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

/* ---------- AI Smart Suggestions ---------- */
function SmartSuggestionsTab({ entries, persons, year }: { entries: Entry[]; persons: string[]; year: number }) {
  const now = new Date();
  const defaultMonth = now.getFullYear() === year ? now.getMonth() : 11;
  const [month, setMonth] = useState<number>(defaultMonth);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string>("");
  const runFn = useServerFn(generateSmartSuggestions);

  const computeStats = (m: number) => {
    const slotKeys = SLOTS.map((s) => s.key as "slot_10" | "slot_11" | "slot_14");
    const inMonth = entries.filter((e) => {
      const d = new Date(e.entry_date);
      return d.getFullYear() === year && d.getMonth() === m;
    });
    const workingDaySet = new Set<string>();
    inMonth.forEach((e) => {
      if (new Date(e.entry_date).getDay() !== 5) workingDaySet.add(e.entry_date);
    });
    const workingDays = workingDaySet.size || 1;
    const perPerson = persons.map((p) => {
      const my = inMonth.filter((e) => e.person === p);
      let visits = 0, presentDays = 0;
      const locs = new Set<string>();
      my.forEach((e) => {
        const vals = slotKeys.map((k) => e[k]);
        let dayYes = 0;
        vals.forEach((v) => { if (v === "Yes") { visits++; dayYes++; } });
        if (dayYes > 0) presentDays++;
        if (e.location && dayYes > 0) locs.add(e.location);
      });
      const attendance = Math.round((presentDays / workingDays) * 100);
      const visitRate = Math.round((visits / (workingDays * SLOTS.length)) * 100);
      const coverageScore = Math.min(100, locs.size * 10);
      const performance = Math.round(attendance * 0.4 + visitRate * 0.4 + coverageScore * 0.2);
      return { name: p, visits, attendance, coverage: locs.size, performance };
    });
    const totalVisits = perPerson.reduce((a, r) => a + r.visits, 0);
    const avgAttendance = perPerson.length ? Math.round(perPerson.reduce((a, r) => a + r.attendance, 0) / perPerson.length) : 0;
    return { perPerson, totalVisits, avgAttendance };
  };

  const handleGenerate = async () => {
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();
    if (prevYear !== year) {
      toast.error("পূর্ববর্তী মাসের ডেটা পাওয়া যাচ্ছে না (অন্য বছর)। জানুয়ারি বাদে অন্য মাস বেছে নিন।");
      return;
    }
    const cur = computeStats(month);
    const prev = computeStats(prevMonth);
    const personMap = new Map(prev.perPerson.map((p) => [p.name, p]));
    const personsPayload = cur.perPerson.map((p) => {
      const pp = personMap.get(p.name);
      return {
        name: p.name,
        currentVisits: p.visits,
        previousVisits: pp?.visits ?? 0,
        currentAttendance: p.attendance,
        previousAttendance: pp?.attendance ?? 0,
        currentCoverage: p.coverage,
        performance: p.performance,
      };
    });

    setLoading(true);
    setSuggestions("");
    try {
      const res = await runFn({
        data: {
          monthLabel: `${MONTH_NAMES[month]} ${year}`,
          previousMonthLabel: `${MONTH_NAMES[prevMonth]} ${year}`,
          teamTotals: {
            totalVisits: cur.totalVisits,
            previousTotalVisits: prev.totalVisits,
            avgAttendance: cur.avgAttendance,
            previousAvgAttendance: prev.avgAttendance,
          },
          persons: personsPayload,
        },
      });
      setSuggestions(res.suggestions);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) toast.error("Rate limit — একটু পর আবার চেষ্টা করুন।");
      else if (msg.includes("402")) toast.error("AI credit শেষ — Workspace settings থেকে credit যোগ করুন।");
      else toast.error("AI suggestion তৈরি করা যায়নি: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> AI Smart Suggestions
          </h2>
          <p className="text-sm text-muted-foreground">
            AI পারফরম্যান্স ডেটা বিশ্লেষণ করে কাজে লাগার ইনসাইট দিবে — যেমন "Taiyab এই মাসে ১৮% কম visit করেছে"।
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-md border bg-card px-3 py-1.5 text-sm"
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
          </select>
          <button
            onClick={handleGenerate}
            disabled={loading || persons.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {loading ? "তৈরি হচ্ছে…" : "Suggestions তৈরি করুন"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-5 min-h-[200px]">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> AI ডেটা বিশ্লেষণ করছে…
          </div>
        )}
        {!loading && !suggestions && (
          <div className="text-sm text-muted-foreground">
            উপরের "Suggestions তৈরি করুন" বাটনে ক্লিক করে {MONTH_NAMES[month]} {year} মাসের জন্য AI ইনসাইট তৈরি করুন।
            চলতি মাসের ডেটা পূর্ববর্তী মাসের সাথে তুলনা করা হবে।
          </div>
        )}
        {!loading && suggestions && (
          <ul className="space-y-2 text-sm leading-relaxed">
            {suggestions
              .split("\n")
              .map((l) => l.replace(/^[-*•]\s*/, "").trim())
              .filter(Boolean)
              .map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

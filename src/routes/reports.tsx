import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SLOTS, STATUSES, statusClass } from "@/lib/dashboard-config";
import { useDashboardLists } from "@/lib/use-lists";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, LineChart, Line,
} from "recharts";

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
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="person">Person-wise</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly Comparison</TabsTrigger>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Person-wise Annual Report</h2>
          <p className="text-sm text-muted-foreground">প্রতিটি পার্সনের {year} সালের সম্পূর্ণ পারফর্মেন্স</p>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
          <Download className="size-3.5" /> Export CSV
        </button>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Daily Report</h2>
          <p className="text-sm text-muted-foreground">নির্দিষ্ট দিনের বিস্তারিত রিপোর্ট</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-card px-3 py-1.5 text-sm"
          />
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> Export
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Weekly Report</h2>
          <p className="text-sm text-muted-foreground">{label} ({year})</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(weekOffset - 1)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">← Prev</button>
          <button onClick={() => setWeekOffset(0)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">This Week</button>
          <button onClick={() => setWeekOffset(weekOffset + 1)} disabled={weekOffset >= 0} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40">Next →</button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="size-3.5" /> Export
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Monthly Comparison</h2>
          <p className="text-sm text-muted-foreground">{year} সালের ১২ মাসের পারফর্মেন্স তুলনা</p>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
          <Download className="size-3.5" /> Export
        </button>
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

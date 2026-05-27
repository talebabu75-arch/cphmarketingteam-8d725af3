import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUSES, SLOTS, statusClass } from "@/lib/dashboard-config";
import { ArrowLeft, User } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

type Entry = {
  entry_date: string;
  person: string;
  location: string | null;
  slot_10: string | null;
  slot_11: string | null;
  slot_14: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  "Yes": "#22c55e",
  "No": "#ef4444",
  "D.off": "#f97316",
  "L.off": "#3b82f6",
  "Off day": "#a855f7",
};

export const Route = createFileRoute("/person/$name")({
  component: PersonProfile,
});

type Period = "monthly" | "quarterly" | "yearly";

function PersonProfile() {
  const { name } = Route.useParams();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [period, setPeriod] = useState<Period>("monthly");
  const [month, setMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [quarter, setQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3)); // 0-3

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login", replace: true });
      else setAuthed(true);
    });
  }, [navigate]);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      setLoading(true);
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("monitoring_entries")
        .select("entry_date,person,location,slot_10,slot_11,slot_14")
        .eq("person", name)
        .gte("entry_date", start)
        .lte("entry_date", end)
        .order("entry_date");
      if (!error) setEntries((data as Entry[]) ?? []);
      setLoading(false);
    })();
  }, [authed, name, year]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const d = new Date(e.entry_date);
      if (period === "yearly") return true;
      if (period === "monthly") return d.getMonth() === month;
      const q = Math.floor(d.getMonth() / 3);
      return q === quarter;
    });
  }, [entries, period, month, quarter]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUSES.forEach((s) => (counts[s] = 0));
    let totalSlots = 0;
    let extraDoff = 0;
    const locationCount: Record<string, number> = {};
    filtered.forEach((e) => {
      let dayDoff = 0;
      SLOTS.forEach((s) => {
        const v = e[s.key as "slot_10" | "slot_11" | "slot_14"];
        if (v && STATUSES.includes(v as any)) {
          counts[v] += 1;
          totalSlots += 1;
          if (v === "D.off") dayDoff += 1;
        }
      });
      if (dayDoff > 1) extraDoff += dayDoff - 1;
      if (e.location) locationCount[e.location] = (locationCount[e.location] ?? 0) + 1;
    });
    const yes = counts["Yes"] ?? 0;
    const no = counts["No"] ?? 0;
    const loff = counts["L.off"] ?? 0;
    const denom = yes + no + loff + extraDoff;
    const score = denom > 0 ? Math.round((yes / denom) * 100) : 0;
    const topLocations = Object.entries(locationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { counts, totalSlots, extraDoff, score, topLocations, daysActive: filtered.length };
  }, [filtered]);

  const monthlyTrend = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(year, i, 1).toLocaleString("en", { month: "short" }),
      Yes: 0, No: 0, "D.off": 0, "L.off": 0, "Off day": 0, score: 0,
    }));
    const perMonth: Record<number, { yes: number; no: number; loff: number; extra: number }> = {};
    entries.forEach((e) => {
      const m = new Date(e.entry_date).getMonth();
      if (!perMonth[m]) perMonth[m] = { yes: 0, no: 0, loff: 0, extra: 0 };
      let dayDoff = 0;
      SLOTS.forEach((s) => {
        const v = e[s.key as "slot_10" | "slot_11" | "slot_14"];
        if (v && STATUSES.includes(v as any)) {
          (arr[m] as any)[v] += 1;
          if (v === "Yes") perMonth[m].yes += 1;
          if (v === "No") perMonth[m].no += 1;
          if (v === "L.off") perMonth[m].loff += 1;
          if (v === "D.off") dayDoff += 1;
        }
      });
      if (dayDoff > 1) perMonth[m].extra += dayDoff - 1;
    });
    arr.forEach((row, i) => {
      const p = perMonth[i];
      if (!p) return;
      const denom = p.yes + p.no + p.loff + p.extra;
      row.score = denom > 0 ? Math.round((p.yes / denom) * 100) : 0;
    });
    return arr;
  }, [entries, year]);

  const pieData = STATUSES.map((s) => ({ name: s, value: stats.counts[s] })).filter((d) => d.value > 0);

  const periodLabel =
    period === "yearly"
      ? `Year ${year}`
      : period === "quarterly"
      ? `Q${quarter + 1} ${year}`
      : `${new Date(year, month, 1).toLocaleString("en", { month: "long" })} ${year}`;

  if (!authed) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <ArrowLeft className="size-3.5" /> Back
            </Link>
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <User className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
              <p className="text-xs text-muted-foreground">Performance Profile • {periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border bg-card px-2 py-1.5 text-sm"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-md border bg-card px-2 py-1.5 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            {period === "monthly" && (
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-md border bg-card px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m, 1).toLocaleString("en", { month: "long" })}
                  </option>
                ))}
              </select>
            )}
            {period === "quarterly" && (
              <select
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
                className="rounded-md border bg-card px-2 py-1.5 text-sm"
              >
                {[0, 1, 2, 3].map((q) => (
                  <option key={q} value={q}>Q{q + 1}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Performance Score" value={`${stats.score}%`} accent />
              <SummaryCard label="Days Active" value={stats.daysActive} />
              <SummaryCard label="Total Slots" value={stats.totalSlots} />
              <SummaryCard label="Extra D.off" value={stats.extraDoff} />
            </div>

            {/* Status chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              {STATUSES.map((s) => (
                <span key={s} className={`px-2 py-1 rounded-md border ${statusClass(s)}`}>
                  {s}: <b>{stats.counts[s]}</b>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border bg-card shadow-sm p-4">
                <h3 className="text-sm font-medium mb-3">Monthly Trend ({year})</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {STATUSES.map((s) => (
                        <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border bg-card shadow-sm p-4">
                <h3 className="text-sm font-medium mb-3">Distribution ({periodLabel})</h3>
                <div className="h-72">
                  {pieData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} label={(d: any) => `${d.name}: ${d.value}`} labelLine={false}>
                          {pieData.map((d) => (<Cell key={d.name} fill={STATUS_COLORS[d.name]} />))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-4">
              <h3 className="text-sm font-medium mb-3">Monthly Score Trend ({year})</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="text-sm font-medium">Top Locations ({periodLabel})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Location</th>
                        <th className="px-3 py-2 text-right">Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topLocations.length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No data</td></tr>
                      ) : stats.topLocations.map(([loc, n], i) => (
                        <tr key={loc} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{loc}</td>
                          <td className="px-3 py-2 text-right">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="text-sm font-medium">Detailed Entries ({periodLabel})</h3>
                  <p className="text-xs text-muted-foreground">{filtered.length} days</p>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Location</th>
                        {SLOTS.map((s) => (
                          <th key={s.key} className="px-3 py-2 text-center">{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No data</td></tr>
                      ) : filtered.map((e) => (
                        <tr key={e.entry_date} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">{e.entry_date}</td>
                          <td className="px-3 py-2">{e.location ?? "—"}</td>
                          {SLOTS.map((s) => {
                            const v = e[s.key as "slot_10" | "slot_11" | "slot_14"];
                            return (
                              <td key={s.key} className="px-3 py-2 text-center">
                                {v ? <span className={`inline-block rounded px-2 py-0.5 text-xs ${statusClass(v)}`}>{v}</span> : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card shadow-sm p-4 ${accent ? "ring-1 ring-primary/40" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

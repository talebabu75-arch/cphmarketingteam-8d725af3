import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { STATUSES, SLOTS, statusClass } from "@/lib/dashboard-config";

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

export function MonthlyAnalysis({
  entries,
  persons,
  monthName,
}: {
  entries: Entry[];
  persons: string[];
  monthName: string;
}) {
  const { perPerson, totals, totalSlots, dayStatsPerPerson } = useMemo(() => {
    const perPerson: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    const dayStatsPerPerson: Record<string, { present: number; absent: number }> = {};
    STATUSES.forEach((s) => (totals[s] = 0));
    persons.forEach((p) => {
      perPerson[p] = {};
      STATUSES.forEach((s) => (perPerson[p][s] = 0));
      dayStatsPerPerson[p] = { present: 0, absent: 0 };
    });

    let totalSlots = 0;
    entries.forEach((e) => {
      if (!perPerson[e.person]) return;
      const slotVals: string[] = [];
      SLOTS.forEach((s) => {
        const v = e[s.key as "slot_10" | "slot_11" | "slot_14"];
        if (v && STATUSES.includes(v as any)) slotVals.push(v);
      });
      const allOffDay = slotVals.length === SLOTS.length && slotVals.every((v) => v === "Off day");
      let yC = 0, bC = 0;
      slotVals.forEach((v) => {
        if (allOffDay && v === "Off day") return;
        perPerson[e.person][v] += 1;
        totals[v] += 1;
        totalSlots += 1;
        if (v === "Yes") yC += 1;
        else if (v === "No" || v === "D.off" || v === "L.off") bC += 1;
      });
      if (allOffDay) {
        perPerson[e.person]["Off day"] += 1;
        totals["Off day"] += 1;
        totalSlots += 1;
      }
      // Day-based: >=2 Yes => Present day; >=2 (No/D.off/L.off) => Absent day
      if (yC >= 2) dayStatsPerPerson[e.person].present += 1;
      else if (bC >= 2) dayStatsPerPerson[e.person].absent += 1;
    });
    return { perPerson, totals, totalSlots, dayStatsPerPerson };
  }, [entries, persons]);


  const barData = persons.map((p) => ({
    name: p,
    ...perPerson[p],
  }));

  const pieData = STATUSES.map((s) => ({ name: s, value: totals[s] })).filter(
    (d) => d.value > 0,
  );

  // Performance score: Present days / (Present + Absent) days × 100
  const performance = persons.map((p) => {
    const c = perPerson[p];
    const total = STATUSES.reduce((a, s) => a + c[s], 0);
    const { present, absent } = dayStatsPerPerson[p] ?? { present: 0, absent: 0 };
    const denom = present + absent;
    const score = denom > 0 ? Math.round((present / denom) * 100) : 0;
    return { name: p, total, score, present, absent };
  }).sort((a, b) => b.score - a.score);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Performance Analysis</h2>
          <p className="text-sm text-muted-foreground">{monthName} • Total slots recorded: {totalSlots}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {STATUSES.map((s) => (
            <span key={s} className={`px-2 py-1 rounded-md border ${statusClass(s)}`}>
              {s}: <b>{totals[s]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-sm p-4">
          <h3 className="text-sm font-medium mb-3">Per-Person Status Count</h3>
          <div className="h-72">{mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {STATUSES.map((s) => (
                  <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm p-4">
          <h3 className="text-sm font-medium mb-3">Overall Distribution</h3>
          <div className="h-72">
            {!mounted ? null : pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                কোনো ডাটা নেই
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name"
                    innerRadius={50} outerRadius={90} paddingAngle={2}
                    label={(d: any) => `${d.name}: ${d.value}`}
                    labelLine={false}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={STATUS_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-medium">Performance Ranking</h3>
          <p className="text-xs text-muted-foreground">Score = Yes / (Yes + No + L.off + Extra D.off) × 100 • দিনে ১ এর বেশি D.off পেনাল্টি হিসেবে গণনা হয়</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                {STATUSES.map((s) => (
                  <th key={s} className="px-3 py-2 text-center">{s}</th>
                ))}
                <th className="px-3 py-2 text-center">Total</th>
                <th className="px-3 py-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((row, i) => (
                <tr key={row.name} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  {STATUSES.map((s) => (
                    <td key={s} className="px-3 py-2 text-center">
                      {perPerson[row.name][s] || "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-medium">{row.total}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block min-w-[52px] rounded-md px-2 py-1 text-xs font-semibold ${
                      row.score >= 80 ? "bg-status-yes text-status-yes-foreground"
                      : row.score >= 50 ? "bg-status-loff text-status-loff-foreground"
                      : "bg-status-no text-status-no-foreground"
                    }`}>
                      {row.score}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

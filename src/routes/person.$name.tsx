import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUSES, SLOTS, statusClass } from "@/lib/dashboard-config";
import { ArrowLeft, User, Award } from "lucide-react";
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
      const [{ data, error }, personRes] = await Promise.all([
        supabase
          .from("monitoring_entries")
          .select("entry_date,person,location,slot_10,slot_11,slot_14")
          .eq("person", name)
          .gte("entry_date", start)
          .lte("entry_date", end)
          .order("entry_date"),
        supabase.from("dashboard_persons").select("avatar_url").eq("name", name).maybeSingle(),
      ]);
      if (!error) setEntries((data as Entry[]) ?? []);
      setAvatarUrl((personRes.data as { avatar_url: string | null } | null)?.avatar_url ?? null);
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
    let presentDays = 0, absentDays = 0;
    const locationCount: Record<string, number> = {};
    filtered.forEach((e) => {
      const slotVals: string[] = [];
      SLOTS.forEach((s) => {
        const v = e[s.key as "slot_10" | "slot_11" | "slot_14"];
        if (v && STATUSES.includes(v as any)) slotVals.push(v);
      });
      const allOffDay = slotVals.length === SLOTS.length && slotVals.every((v) => v === "Off day");
      let yC = 0, bC = 0;
      slotVals.forEach((v) => {
        if (allOffDay && v === "Off day") return;
        counts[v] += 1;
        totalSlots += 1;
        if (v === "Yes") yC += 1;
        else if (v === "No" || v === "D.off" || v === "L.off") bC += 1;
      });
      if (allOffDay) {
        counts["Off day"] += 1;
        totalSlots += 1;
      }
      if (yC >= 2) presentDays += 1;
      else if (bC >= 2) absentDays += 1;
      if (e.location) locationCount[e.location] = (locationCount[e.location] ?? 0) + 1;
    });

    const denom = presentDays + absentDays;
    const score = denom > 0 ? Math.round((presentDays / denom) * 100) : 0;
    const topLocations = Object.entries(locationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { counts, totalSlots, presentDays, absentDays, score, topLocations, daysActive: filtered.length };
  }, [filtered]);

  const monthlyTrend = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(year, i, 1).toLocaleString("en", { month: "short" }),
      Yes: 0, No: 0, "D.off": 0, "L.off": 0, "Off day": 0, score: 0,
    }));
    const perMonth: Record<number, { present: number; absent: number }> = {};
    entries.forEach((e) => {
      const m = new Date(e.entry_date).getMonth();
      if (!perMonth[m]) perMonth[m] = { present: 0, absent: 0 };
      const slotVals: string[] = [];
      SLOTS.forEach((s) => {
        const v = e[s.key as "slot_10" | "slot_11" | "slot_14"];
        if (v && STATUSES.includes(v as any)) slotVals.push(v);
      });
      const allOffDay = slotVals.length === SLOTS.length && slotVals.every((v) => v === "Off day");
      let yC = 0, bC = 0;
      slotVals.forEach((v) => {
        if (allOffDay && v === "Off day") return;
        (arr[m] as any)[v] += 1;
        if (v === "Yes") yC += 1;
        else if (v === "No" || v === "D.off" || v === "L.off") bC += 1;
      });
      if (allOffDay) (arr[m] as any)["Off day"] += 1;
      if (yC >= 2) perMonth[m].present += 1;
      else if (bC >= 2) perMonth[m].absent += 1;
    });

    arr.forEach((row, i) => {
      const p = perMonth[i];
      if (!p) return;
      const denom = p.present + p.absent;
      row.score = denom > 0 ? Math.round((p.present / denom) * 100) : 0;
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

  const getRank = (score: number) => {
    if (score >= 90) return { tier: "Platinum", emoji: "🏆", grad: ["#e5e4e2", "#9ca3af"], accent: "#1f2937" };
    if (score >= 75) return { tier: "Gold", emoji: "🥇", grad: ["#fde68a", "#d97706"], accent: "#7c2d12" };
    if (score >= 60) return { tier: "Silver", emoji: "🥈", grad: ["#e5e7eb", "#6b7280"], accent: "#111827" };
    if (score >= 40) return { tier: "Bronze", emoji: "🥉", grad: ["#fbbf24", "#92400e"], accent: "#3f2d0a" };
    return { tier: "Participant", emoji: "🎖️", grad: ["#bae6fd", "#0369a1"], accent: "#0c4a6e" };
  };

  const downloadAchievementCard = async () => {
    const W = 1200, H = 1500;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const rank = getRank(stats.score);

    // Preload avatar (CORS-safe) if available
    let avatarImg: HTMLImageElement | null = null;
    if (avatarUrl) {
      avatarImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = avatarUrl;
      });
    }

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, rank.grad[0]);
    bg.addColorStop(1, rank.grad[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Inner card
    ctx.fillStyle = "#ffffff";
    const pad = 60;
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 32);
    ctx.fill();

    // Border accent
    ctx.strokeStyle = rank.accent;
    ctx.lineWidth = 6;
    roundRect(ctx, pad + 20, pad + 20, W - (pad + 20) * 2, H - (pad + 20) * 2, 24);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = rank.accent;
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.fillText("CERTIFICATE OF ACHIEVEMENT", W / 2, 200);

    ctx.font = "20px system-ui, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Performance Recognition", W / 2, 240);

    // Avatar photo (or emoji medal fallback)
    if (avatarImg) {
      const ax = W / 2, ay = 400, ar = 130;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, ax - ar, ay - ar, ar * 2, ar * 2);
      ctx.restore();
      // Ring
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = rank.accent;
      ctx.stroke();
      // Small emoji badge bottom-right of avatar
      ctx.font = "70px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(rank.emoji, ax + ar - 10, ay + ar + 10);
    } else {
      ctx.font = "200px system-ui, sans-serif";
      ctx.fillText(rank.emoji, W / 2, 460);
    }

    // Tier
    ctx.font = "bold 64px system-ui, sans-serif";
    ctx.fillStyle = rank.accent;
    ctx.fillText(`${rank.tier} Tier`, W / 2, 550);

    // Awarded to
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Awarded to", W / 2, 640);

    ctx.font = "bold 80px system-ui, sans-serif";
    ctx.fillStyle = "#111827";
    ctx.fillText(name, W / 2, 730);

    // Period
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`for the period of ${periodLabel}`, W / 2, 780);

    // Score circle
    const cx = W / 2, cy = 950, r = 110;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rank.grad[1];
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 72px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(`${stats.score}%`, cx, cy);
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#6b7280";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("Performance Score", W / 2, 1100);

    // Stats row
    const stat = (label: string, value: string | number, x: number) => {
      ctx.fillStyle = rank.accent;
      ctx.font = "bold 38px system-ui, sans-serif";
      ctx.fillText(String(value), x, 1210);
      ctx.fillStyle = "#6b7280";
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(label, x, 1240);
    };
    stat("Yes", stats.counts["Yes"] ?? 0, W / 2 - 320);
    stat("Days Active", stats.daysActive, W / 2 - 100);
    stat("Total Slots", stats.totalSlots, W / 2 + 120);
    stat("Absent Days", stats.absentDays, W / 2 + 320);

    // Footer
    ctx.fillStyle = "#9ca3af";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(`Issued on ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, W / 2, 1370);
    ctx.font = "italic 14px system-ui, sans-serif";
    ctx.fillText("Monitoring Performance System", W / 2, 1400);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `achievement-${name}-${periodLabel.replace(/\s+/g, "_")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  if (!authed) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <ArrowLeft className="size-3.5" /> Back
            </Link>
            <div className="size-10 rounded-lg overflow-hidden bg-primary text-primary-foreground grid place-items-center shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className="size-full object-cover" />
              ) : (
                <User className="size-5" />
              )}
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
            <button
              onClick={downloadAchievementCard}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 transition disabled:opacity-50"
            >
              <Award className="size-3.5" /> Achievement Card
            </button>
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
              <SummaryCard label="Present Days" value={stats.presentDays} />
              <SummaryCard label="Absent Days" value={stats.absentDays} />
              <SummaryCard label="Total Slots" value={stats.totalSlots} />
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

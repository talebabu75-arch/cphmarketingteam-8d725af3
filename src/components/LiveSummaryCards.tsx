import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SLOTS, STATUSES } from "@/lib/dashboard-config";
import { useDashboardLists } from "@/lib/use-lists";
import { Users, UserCheck, MapPin, Activity, TrendingUp } from "lucide-react";

type Entry = {
  entry_date: string;
  person: string;
  location: string | null;
  slot_10: string | null;
  slot_11: string | null;
  slot_14: string | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange() {
  const d = new Date();
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const end = todayISO();
  return { start, end };
}

export function LiveSummaryCards() {
  const { persons } = useDashboardLists();
  const [today, setToday] = useState<Entry[]>([]);
  const [month, setMonth] = useState<Entry[]>([]);

  useEffect(() => {
    const t = todayISO();
    const { start, end } = monthRange();
    const cols = "entry_date,person,location,slot_10,slot_11,slot_14";
    let cancelled = false;
    const load = async () => {
      const [a, b] = await Promise.all([
        supabase.from("monitoring_entries").select(cols).eq("entry_date", t),
        supabase.from("monitoring_entries").select(cols).gte("entry_date", start).lte("entry_date", end),
      ]);
      if (cancelled) return;
      setToday((a.data as Entry[]) ?? []);
      setMonth((b.data as Entry[]) ?? []);
    };
    load();
    // Debounce realtime reloads so rapid edits don't spam fetches
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 1500);
    };
    const ch = supabase
      .channel("live-summary")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoring_entries" }, scheduleLoad)
      .subscribe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, []);

  const stats = useMemo(() => {
    let present = 0, leave = 0, visits = 0;
    const activeSet = new Set<string>();

    today.forEach((e) => {
      const vals = SLOTS.map((s) => e[s.key as "slot_10" | "slot_11" | "slot_14"]).filter(
        (v): v is string => !!v && STATUSES.includes(v as any),
      );
      const allOff = vals.length === SLOTS.length && vals.every((v) => v === "Off day");
      const hasYes = vals.includes("Yes");
      const hasLoff = vals.includes("L.off");
      if (hasYes) {
        present += 1;
        activeSet.add(e.person);
      } else if (hasLoff || allOff) {
        leave += 1;
      }
      vals.forEach((v) => {
        if (v === "Yes") visits += 1;
      });
    });

    // Monthly performance %
    let yes = 0, no = 0, loff = 0, extraDoff = 0;
    const byPersonDate: Record<string, number> = {};
    month.forEach((e) => {
      const vals = SLOTS.map((s) => e[s.key as "slot_10" | "slot_11" | "slot_14"]).filter(
        (v): v is string => !!v && STATUSES.includes(v as any),
      );
      const allOff = vals.length === SLOTS.length && vals.every((v) => v === "Off day");
      let dDoff = 0;
      vals.forEach((v) => {
        if (allOff && v === "Off day") return;
        if (v === "Yes") yes += 1;
        else if (v === "No") no += 1;
        else if (v === "L.off") loff += 1;
        else if (v === "D.off") dDoff += 1;
      });
      if (dDoff > 1) extraDoff += dDoff - 1;
    });
    const denom = yes + no + loff + extraDoff;
    const perf = denom > 0 ? Math.round((yes / denom) * 100) : 0;

    return {
      present,
      leave,
      visits,
      active: activeSet.size,
      totalStaff: persons.length,
      perf,
    };
  }, [today, month, persons]);

  const cards = [
    { label: "Today Present", value: stats.present, icon: UserCheck, color: "text-status-yes-foreground bg-status-yes" },
    { label: "Today Leave", value: stats.leave, icon: Users, color: "text-status-loff-foreground bg-status-loff" },
    { label: "Total Visits", value: stats.visits, icon: MapPin, color: "text-primary-foreground bg-primary" },
    { label: "Active Staff", value: `${stats.active}/${stats.totalStaff}`, icon: Activity, color: "text-status-off-foreground bg-status-off" },
    { label: "Performance", value: `${stats.perf}%`, icon: TrendingUp, color: stats.perf >= 80 ? "text-status-yes-foreground bg-status-yes" : stats.perf >= 50 ? "text-status-loff-foreground bg-status-loff" : "text-status-no-foreground bg-status-no" },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="rounded-xl border bg-card shadow-sm p-4 flex items-center gap-3">
            <div className={`size-10 rounded-lg grid place-items-center ${c.color}`}>
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground truncate">{c.label}</div>
              <div className="text-xl font-semibold tabular-nums">{c.value}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

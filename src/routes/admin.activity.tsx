import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { ArrowLeft, Activity, RefreshCw, Filter } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/activity")({
  component: ActivityLogPage,
  head: () => ({
    meta: [
      { title: "Activity Log — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Log = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  entry_date: string | null;
  person: string | null;
  changes: any;
  created_at: string;
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-status-yes text-status-yes-foreground",
  UPDATE: "bg-status-loff text-status-loff-foreground",
  DELETE: "bg-status-no text-status-no-foreground",
  APPROVE: "bg-green-600 text-white",
  REJECT: "bg-red-600 text-white",
};

function ActivityLogPage() {
  const { isManager, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [personFilter, setPersonFilter] = useState<string>("");

  useEffect(() => {
    if (roleLoading) return;
    if (!isManager) {
      toast.error("Admin/Manager access required");
      navigate({ to: "/" });
    }
  }, [isManager, roleLoading, navigate]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (actionFilter !== "all") q = q.eq("action", actionFilter);
    if (personFilter.trim()) q = q.ilike("person", `%${personFilter.trim()}%`);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setLogs((data ?? []) as Log[]);
    setLoading(false);
  };

  useEffect(() => { if (isManager) load(); }, [isManager, actionFilter, personFilter]);

  if (roleLoading || !isManager) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }

  function renderChanges(c: any) {
    if (!c || typeof c !== "object") return "—";
    const keys = Object.keys(c);
    if (keys.length === 0) return "—";
    return (
      <div className="space-y-0.5">
        {keys.map((k) => {
          const v = c[k];
          if (Array.isArray(v)) {
            return <div key={k} className="text-xs"><b>{k}:</b> <span className="text-muted-foreground line-through">{String(v[0] ?? "∅")}</span> → <span className="font-medium">{String(v[1] ?? "∅")}</span></div>;
          }
          return <div key={k} className="text-xs"><b>{k}:</b> {String(v ?? "∅")}</div>;
        })}
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition">
              <ArrowLeft className="size-3.5" /> Back
            </Link>
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Activity className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Activity Log</h1>
              <p className="text-xs text-muted-foreground">কে কখন কি edit করেছে</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-muted-foreground" />
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-md border bg-card px-2 py-1.5 text-sm">
              <option value="all">All actions</option>
              <option value="INSERT">Insert</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
            </select>
            <input
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              placeholder="Filter by person…"
              className="rounded-md border bg-card px-2 py-1.5 text-sm"
            />
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
              <RefreshCw className="size-3.5" /> Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Changes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">কোনো activity পাওয়া যায়নি</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-accent/30 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">{l.user_email ?? l.user_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ACTION_COLORS[l.action] ?? "bg-muted"}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{l.entry_date ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{l.person ?? "—"}</td>
                    <td className="px-3 py-2">{renderChanges(l.changes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

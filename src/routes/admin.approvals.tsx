import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { ArrowLeft, Check, X, ClipboardList, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SLOTS } from "@/lib/dashboard-config";

export const Route = createFileRoute("/admin/approvals")({
  component: AdminApprovalsPage,
  head: () => ({
    meta: [
      { title: "Pending Approvals — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Row = {
  id: string;
  entry_date: string;
  person: string;
  location: string | null;
  slot_10: string | null;
  slot_11: string | null;
  slot_14: string | null;
  status: string;
  submitted_by: string | null;
  updated_at: string;
};

function AdminApprovalsPage() {
  const { isAdmin, isManager, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "rejected" | "all">("pending");

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
      .from("monitoring_entries")
      .select("id,entry_date,person,location,slot_10,slot_11,slot_14,status,submitted_by,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { if (isManager) load(); }, [isManager, filter]);

  async function decide(id: string, status: "approved" | "rejected") {
    const { error } = await supabase
      .from("monitoring_entries")
      .update({ status })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "Approved" : "Rejected");
    setRows((prev) => prev.filter((r) => filter === "all" ? true : r.id !== id));
  }

  async function bulkDecide(status: "approved" | "rejected") {
    if (rows.length === 0) return;
    const ids = rows.filter((r) => r.status === "pending").map((r) => r.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("monitoring_entries")
      .update({ status })
      .in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} entries ${status}`);
    load();
  }

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);

  if (roleLoading || !isManager) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
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
              <ClipboardList className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Pending Approvals</h1>
              <p className="text-xs text-muted-foreground">Staff entry আগে approve করুন</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="rounded-md border bg-card px-3 py-1.5 text-sm">
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="all">All recent</option>
            </select>
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
              <RefreshCw className="size-3.5" /> Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        {isAdmin && filter === "pending" && pendingCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div className="text-sm">
              <span className="font-semibold">{pendingCount}</span> pending entries
            </div>
            <div className="flex gap-2">
              <button onClick={() => bulkDecide("approved")} className="inline-flex items-center gap-1.5 rounded-md bg-status-yes text-status-yes-foreground px-3 py-1.5 text-sm hover:opacity-90">
                <Check className="size-3.5" /> Approve all
              </button>
              <button onClick={() => bulkDecide("rejected")} className="inline-flex items-center gap-1.5 rounded-md bg-status-no text-status-no-foreground px-3 py-1.5 text-sm hover:opacity-90">
                <X className="size-3.5" /> Reject all
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  {SLOTS.map((s) => <th key={s.key} className="px-3 py-2 text-center">{s.label}</th>)}
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">কোনো {filter === "pending" ? "pending" : filter === "rejected" ? "rejected" : ""} entry নেই</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/30">
                    <td className="px-3 py-2 whitespace-nowrap">{r.entry_date}</td>
                    <td className="px-3 py-2 font-medium">{r.person}</td>
                    <td className="px-3 py-2">{r.location ?? "—"}</td>
                    <td className="px-3 py-2 text-center">{r.slot_10 ?? "—"}</td>
                    <td className="px-3 py-2 text-center">{r.slot_11 ?? "—"}</td>
                    <td className="px-3 py-2 text-center">{r.slot_14 ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                        r.status === "pending" ? "bg-status-loff text-status-loff-foreground" :
                        r.status === "approved" ? "bg-status-yes text-status-yes-foreground" :
                        "bg-status-no text-status-no-foreground"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {r.status !== "approved" && (
                          <button onClick={() => decide(r.id, "approved")} title="Approve" className="rounded p-1.5 hover:bg-status-yes/30">
                            <Check className="size-4 text-green-700" />
                          </button>
                        )}
                        {r.status !== "rejected" && (
                          <button onClick={() => decide(r.id, "rejected")} title="Reject" className="rounded p-1.5 hover:bg-status-no/30">
                            <X className="size-4 text-red-700" />
                          </button>
                        )}
                      </div>
                    </td>
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

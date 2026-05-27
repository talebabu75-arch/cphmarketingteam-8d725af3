import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { ArrowLeft, Shield, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
  head: () => ({
    meta: [
      { title: "User Management — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type RoleRow = { id: string; user_id: string; role: AppRole; created_at: string };

function AdminUsersPage() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      toast.error("Admin access required");
      navigate({ to: "/" });
    }
  }, [isAdmin, roleLoading, navigate]);

  const load = async () => {
    const { data: me } = await supabase.auth.getUser();
    setMeId(me.user?.id ?? null);
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as RoleRow[]);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  // group roles by user
  const byUser = new Map<string, AppRole[]>();
  rows.forEach((r) => {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r.role);
    byUser.set(r.user_id, arr);
  });

  const setRole = async (userId: string, role: AppRole) => {
    // remove all existing, then add the chosen one
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) { toast.error(delErr.message); return; }
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("Role updated");
    load();
  };

  if (roleLoading || !isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Checking permissions…</div>;
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm hover:underline">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <Shield className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">User Management</h1>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto p-6 space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            প্রতিটি ব্যবহারকারীর জন্য একটি Role সেট করুন। Admin সকল কিছু করতে পারে, Manager পার্সন/লোকেশন যোগ করতে পারে, Staff শুধু দেখতে পারে।
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">User ID</th>
                  <th className="text-left p-3">Current Role</th>
                  <th className="text-left p-3">Change Role</th>
                </tr>
              </thead>
              <tbody>
                {[...byUser.entries()].map(([uid, urs]) => {
                  const cur = urs.includes("admin") ? "admin" : urs.includes("manager") ? "manager" : "staff";
                  const isMe = uid === meId;
                  return (
                    <tr key={uid} className="border-t">
                      <td className="p-3 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <UserIcon className="size-3.5 text-muted-foreground" />
                          {uid.slice(0, 8)}…{uid.slice(-4)}
                          {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">YOU</span>}
                        </div>
                      </td>
                      <td className="p-3">
                        <RoleBadge role={cur} />
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5">
                          {(["admin", "manager", "staff"] as AppRole[]).map((r) => (
                            <button
                              key={r}
                              disabled={cur === r || (isMe && r !== "admin")}
                              onClick={() => setRole(uid, r)}
                              className="px-2.5 py-1 text-xs rounded-md border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed capitalize"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {byUser.size === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-primary" /><b>Admin</b> — সকল ফিচার + ইউজার ম্যানেজমেন্ট</div>
          <div className="flex items-center gap-2"><ShieldCheck className="size-3.5" /><b>Manager</b> — পার্সন/লোকেশন/এন্ট্রি যোগ ও সম্পাদনা</div>
          <div className="flex items-center gap-2"><UserIcon className="size-3.5" /><b>Staff</b> — শুধু দেখতে পারবে</div>
        </div>
      </div>
    </main>
  );
}

function RoleBadge({ role }: { role: AppRole }) {
  const map: Record<AppRole, string> = {
    admin: "bg-primary/15 text-primary border-primary/30",
    manager: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    staff: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border capitalize ${map[role]}`}>
      {role === "admin" ? <ShieldCheck className="size-3" /> : role === "manager" ? <Shield className="size-3" /> : <UserIcon className="size-3" />}
      {role}
    </span>
  );
}

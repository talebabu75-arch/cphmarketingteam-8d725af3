import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MonitoringTable } from "@/components/MonitoringTable";
import { LiveSummaryCards } from "@/components/LiveSummaryCards";
import { useDashboardLists } from "@/lib/use-lists";
import { LogOut, BarChart3, User, FileText } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marketing Team Monitoring Dashboard" },
      { name: "description", content: "Track daily marketing team locations and visit status across all team members." },
      { property: "og:title", content: "Marketing Team Monitoring Dashboard" },
      { property: "og:description", content: "Track daily marketing team locations and visit status across all team members." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      if (!session) navigate({ to: "/login", replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/login", replace: true });
      } else {
        setEmail(data.session.user.email ?? null);
      }
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready || !email) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Marketing Monitoring</h1>
              <p className="text-xs text-muted-foreground">Daily location & visit tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
            <Link
              to="/reports"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition"
            >
              <FileText className="size-3.5" /> Reports
            </Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent transition"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <LiveSummaryCards />
        <PersonProfiles />
        <MonitoringTable />
      </div>
    </main>
  );
}

function PersonProfiles() {
  const { persons, loading } = useDashboardLists();
  if (loading || persons.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Team Profiles</h2>
        <span className="text-xs text-muted-foreground">বিস্তারিত পারফর্মেন্স রিপোর্ট দেখতে ক্লিক করুন</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {persons.map((p) => (
          <Link
            key={p.id}
            to="/person/$name"
            params={{ name: p.name }}
            className="group rounded-lg border bg-background p-3 hover:bg-accent hover:border-primary/50 transition flex items-center gap-3"
          >
            <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition">
              <User className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground">View profile</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

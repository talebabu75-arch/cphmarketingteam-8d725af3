import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MonitoringTable } from "@/components/MonitoringTable";
import { useDashboardLists } from "@/lib/use-lists";
import { LogOut, BarChart3, User } from "lucide-react";

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
        <PersonProfiles />
        <MonitoringTable />
      </div>
    </main>
  );
}

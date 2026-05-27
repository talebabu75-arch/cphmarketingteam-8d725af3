import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Marketing Monitoring" },
      { name: "description", content: "Sign in to the marketing team monitoring dashboard." },
    ],
  }),
  component: LoginPage,
});

function genCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b };
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState(() => genCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [humanChecked, setHumanChecked] = useState(false);
  const expected = useMemo(() => captcha.a + captcha.b, [captcha]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  function refreshCaptcha() {
    setCaptcha(genCaptcha());
    setCaptchaAnswer("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!humanChecked) {
      toast.error("Please check the 'I'm not a robot' box");
      return;
    }
    if (Number(captchaAnswer) !== expected) {
      toast.error("Verification answer is incorrect");
      refreshCaptcha();
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
      refreshCaptcha();
      setHumanChecked(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-gradient-to-br from-background to-accent">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Marketing Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to access the team dashboard.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Verification</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="px-3 py-2 rounded-md border bg-muted text-sm font-mono select-none tracking-wider">
                {captcha.a} + {captcha.b} = ?
              </div>
              <input
                type="number" required value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="উত্তর"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button" onClick={refreshCaptcha}
                className="rounded-md border bg-background px-2 py-2 text-xs hover:bg-accent transition"
                aria-label="Refresh captcha"
              >
                ↻
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 cursor-pointer hover:bg-accent/50 transition">
            <input
              type="checkbox"
              checked={humanChecked}
              onChange={(e) => setHumanChecked(e.target.checked)}
              className="size-4 rounded border-input cursor-pointer accent-primary"
            />
            <span className="text-sm">আমি রোবট নই (I'm not a robot)</span>
          </label>

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition"
          >
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Access is invite-only. Contact your admin to be added.
        </p>
        <Link to="/" className="block text-center mt-4 text-xs text-muted-foreground">← Back home</Link>
      </div>
    </main>
  );
}

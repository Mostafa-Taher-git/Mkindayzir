"use client";

import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useState } from "react";
import { LoginSchema } from "@/lib/validators";

export function LoginForm({
  registrationEnabled,
  isPersonal,
}: {
  registrationEnabled: boolean;
  isPersonal: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Reveal what is being typed (item #4).
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";

  // In Personal mode there is only ever one user, so self-registration is
  // never offered regardless of the env flag.
  const showRegistration = !isPersonal && registrationEnabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues[0]?.message || "Invalid input");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {credentials: "include", 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: result.data.email, password: result.data.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Invalid email or password");
        setLoading(false);
        return;
      }

      window.location.href = callbackUrl;
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r-2 border-outline-strong bg-surface-container-low p-12 lg:flex">
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "var(--hud-panel)", backdropFilter: "blur(var(--hud-blur))" }}
        />
        <div className="relative flex items-center gap-3">
          <img
            src="/MKINDAYZIR_logo.jpg"
            alt="Mkindayzir"
            className="h-12 w-12 object-cover border-2 border-outline-strong"
          />
          <span className="font-display text-xl font-extrabold uppercase tracking-tight">
            Mkindayzir
          </span>
        </div>
        <div className="relative">
          <div className="uppercase-label text-primary-light mb-3 animate-pulse-glow">
            ◢ System Online
          </div>
          <h2 className="font-display text-4xl font-extrabold uppercase leading-none">
            Your Operations.
            <br />
            Your Server.
            <br />
            <span className="text-primary-light">Your Control.</span>
          </h2>
          <p className="mt-6 max-w-sm text-muted-foreground">
            A self-hosted, local-first Work OS. No cloud. No leakage. Everything
            stays on your machine.
          </p>
        </div>
        <div className="relative uppercase-label text-muted-foreground">
          Local-first · Offline-capable · Encrypted
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center border-l-2 border-outline-strong bg-background p-4 lg:w-1/2">
        <div className="w-full max-w-md panel p-8 shadow-panel">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src="/MKINDAYZIR_logo.jpg"
              alt="Mkindayzir"
              className="h-10 w-10 object-cover border-2 border-outline-strong"
            />
            <span className="font-display text-lg font-extrabold uppercase tracking-tight">
              Mkindayzir
            </span>
          </div>
          <div className="mb-8">
            <h1 className="font-display text-2xl font-extrabold uppercase tracking-wider">
              Access Console
            </h1>
            <p className="mt-2 text-sm text-muted-foreground font-mono uppercase tracking-wider">
              Authenticate to enter
            </p>
          </div>
          {/* Item #6: back to the landing page. NB: full page load, not
              navigate("/") — the SPA router redirects "/" to /dashboard,
              which bounces unauthenticated visitors right back here. */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              className="border-2 border-outline bg-surface px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-foreground"
            >
              ← Back
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
                {error}
              </div>
            )}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium font-mono uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border-2 border-outline bg-surface px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                required
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium font-mono uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-2 border-outline bg-surface px-3 py-2 pr-20 font-mono text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 border border-outline bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full border-2 border-outline-strong bg-primary text-primary-foreground hover:border-accent hover:bg-primary-hover hover:shadow-accent-ring px-4 py-2 font-mono text-foreground uppercase tracking-wider shadow-bevel active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 chamfer"
            >
              {loading ? "Authenticating..." : "Sign in"}
            </button>
          </form>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link to="/forgot-password"
              className="text-xs font-mono uppercase tracking-wider underline hover:text-foreground"
            >
              Forgot password?
            </Link>
            <Link to="/setup"
              className="w-full border-2 border-outline bg-surface px-4 py-2 text-center font-mono text-sm text-foreground uppercase tracking-wider hover:bg-surface-container-low chamfer"
            >
              Setup New Instance
            </Link>
          </div>
          {showRegistration && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link to="/register"
                className="text-xs font-mono uppercase tracking-wider underline hover:text-foreground"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

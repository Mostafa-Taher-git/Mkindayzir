import { useNavigate } from "react-router-dom";
// src/app/(auth)/setup/page.tsx

import { useState } from "react";
import { SetupSchema } from "@/lib/validators";

type Mode = "personal" | "team" | "enterprise";

const MODES: { value: Mode; label: string; spec: string; description: string }[] = [
  {
    value: "personal",
    label: "Personal",
    spec: "1 USER · SQLITE",
    description: "Single user on a personal laptop. No Docker, no network, no team features.",
  },
  {
    value: "team",
    label: "Team",
    spec: "2–20 USERS · POSTGRES",
    description: "Local-network team. PostgreSQL, WebSocket sync, full role-based auth.",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    spec: "20+ USERS · POSTGRES",
    description: "Dedicated infrastructure. PostgreSQL, audit logging, reverse proxy.",
  },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!mode) {
      setError("Select a usage mode to continue");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const result = SetupSchema.safeParse({
      email,
      displayName,
      password,
      confirmPassword,
      mode,
    });

    if (!result.success) {
      setError(result.error.issues[0]?.message || "Invalid input");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/setup", {credentials: "include", 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Setup failed");
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full border-2 border-outline bg-surface px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="panel w-full max-w-2xl p-8 shadow-panel">
        <div className="mb-8 flex items-center gap-3 border-b-2 border-outline-strong pb-6">
          <img src="/MKINDAYZIR_logo.jpg" alt="Mkindayzir" className="h-11 w-11 object-cover border-2 border-outline-strong" />
          <div>
            <div className="font-display text-xl font-extrabold uppercase tracking-tight">System Setup</div>
            <div className="uppercase-label text-muted-foreground mt-1">Initialize your operations console</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
              {error}
            </div>
          )}

          {/* Step 1: Mode Selection */}
          <div>
            <h2 className="mb-4 font-mono text-sm font-semibold uppercase tracking-wider">
              01 · How will you use Mkindayzir?
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {MODES.map((m) => {
                const active = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={`border-2 p-4 text-left transition-all ${
                      active
                        ? "border-primary bg-primary/10 shadow-[inset_0_0_14px_-4px_var(--color-accent-bright)]"
                        : "border-outline hover:border-primary"
                    }`}
                  >
                    <div className={`font-display text-base font-bold uppercase ${active ? "text-primary-light" : "text-foreground"}`}>
                      {m.label}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.spec}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Admin Account */}
          <div>
            <h2 className="mb-4 font-mono text-sm font-semibold uppercase tracking-wider">
              02 · Create your admin account
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="email" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">
                  Email
                </label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} required />
              </div>
              <div>
                <label htmlFor="displayName" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">
                  Display Name
                </label>
                <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={fieldClass} required />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">
                  Password
                </label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} required />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">
                  Confirm Password
                </label>
                <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldClass} required />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full border-2 border-outline-strong bg-primary px-4 py-3 font-mono text-primary-foreground uppercase tracking-wider shadow-bevel-red chamfer hover:bg-primary-hover hover:shadow-glow-red active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Initializing system..." : "Complete Setup →"}
          </button>
        </form>
      </div>
    </div>
  );
}

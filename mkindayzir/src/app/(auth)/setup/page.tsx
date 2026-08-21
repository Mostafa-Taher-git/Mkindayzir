// src/app/(auth)/setup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SetupSchema } from "@/lib/validators";

type Mode = "personal" | "team" | "enterprise";

const MODES: { value: Mode; label: string; description: string }[] = [
  {
    value: "personal",
    label: "Personal",
    description: "Single user on a personal laptop. SQLite, no Docker, no team features.",
  },
  {
    value: "team",
    label: "Team",
    description: "2-20 users on a local network. PostgreSQL, WebSocket, full auth.",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "20+ users on dedicated infrastructure. PostgreSQL, WebSocket, audit logging.",
  },
];

export default function SetupPage() {
  const router = useRouter();
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
      setError("Please select a usage mode");
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
      mode,
    });

    if (!result.success) {
      setError(result.error.issues[0]?.message || "Invalid input");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/setup", {
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

      router.push("/login");
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl border-2 border-outline bg-surface-container p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-display uppercase tracking-wider">Welcome to Mkindayzir</h1>
          <p className="text-muted-foreground mt-2">Let's get you set up in 3 simple steps</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 border-2 border-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Mode Selection */}
          <div>
            <h2 className="text-lg font-semibold mb-4 font-mono uppercase tracking-wider">
              1. How will you use Mkindayzir?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`p-4 border-2 text-left transition-colors ${
                    mode === m.value
                      ? "border-primary bg-accent"
                      : "border-outline hover:border-primary"
                  }`}
                >
                  <h3 className="font-semibold">{m.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Admin Account */}
          <div>
            <h2 className="text-lg font-semibold mb-4 font-mono uppercase tracking-wider">
              2. Create your admin account
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2 font-mono uppercase tracking-wider">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-outline bg-surface text-foreground font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  required
                />
              </div>
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium mb-2 font-mono uppercase tracking-wider">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-outline bg-surface text-foreground font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2 font-mono uppercase tracking-wider">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-outline bg-surface text-foreground font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  required
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 font-mono uppercase tracking-wider">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-outline bg-surface text-foreground font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-primary-foreground border-2 border-outline hover:brightness-110 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed font-mono uppercase tracking-wider"
          >
            {loading ? "Setting up..." : "Complete Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}

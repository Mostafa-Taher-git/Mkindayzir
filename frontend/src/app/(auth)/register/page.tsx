import { useNavigate, Link } from "react-router-dom";

import { useState } from "react";
import { RegisterSchema } from "@/lib/validators";

export default function RegisterPage() {
  const navigate = useNavigate();
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

    const result = RegisterSchema.safeParse({
      email,
      displayName,
      password,
      confirmPassword,
    });

    if (!result.success) {
      setError(result.error.issues[0]?.message || "Invalid input");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {credentials: "include", 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: result.data.email,
          displayName: result.data.displayName,
          password: result.data.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      window.location.href = "/login";
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full border-2 border-outline bg-surface px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background";

  if (false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="panel w-full max-w-md p-8 text-center shadow-panel">
          <img src="/MKINDAYZIR_logo.jpg" alt="Mkindayzir" className="mx-auto h-12 w-12 object-cover border-2 border-outline-strong" />
          <h1 className="mt-4 font-display text-2xl font-extrabold uppercase">Registration Offline</h1>
          <p className="mt-2 text-sm text-muted-foreground">Account registration is currently disabled.</p>
          <Link to="/login" className="mt-6 inline-block border-2 border-outline-strong bg-primary text-primary-foreground hover:border-accent hover:bg-primary-hover hover:shadow-accent-ring px-5 py-2 font-mono text-foreground uppercase tracking-wider shadow-bevel chamfer">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="panel w-full max-w-md p-8 shadow-panel">
        <div className="mb-6 flex items-center gap-3 border-b-2 border-outline-strong pb-5">
          <img src="/MKINDAYZIR_logo.jpg" alt="Mkindayzir" className="h-10 w-10 object-cover border-2 border-outline-strong" />
          <div className="font-display text-lg font-extrabold uppercase tracking-tight">Create Account</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} required />
          </div>
          <div>
            <label htmlFor="displayName" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Display Name</label>
            <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={fieldClass} required />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} required />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Confirm Password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldClass} required />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full border-2 border-outline-strong bg-primary text-primary-foreground hover:border-accent hover:bg-primary-hover hover:shadow-accent-ring px-4 py-3 font-mono text-foreground uppercase tracking-wider shadow-bevel chamfer active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account →"}
          </button>
        </form>
        <div className="mt-5 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="text-primary-light hover:text-foreground underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

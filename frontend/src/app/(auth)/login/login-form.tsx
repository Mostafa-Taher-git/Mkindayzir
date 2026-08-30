import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useState, FormEvent, useEffect } from "react";
import { useSignIn, useAuth } from "@clerk/clerk-react";

function firstClerkMessage(err: unknown, fallback: string): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  return e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || fallback;
}

export function LoginForm() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const navigate = useNavigate();
  const { isSignedIn } = useAuth(); // detects active Clerk session
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Guard: if user already has an active Clerk session (e.g. from email verification),
  // skip the login form entirely and go straight to dashboard.
  useEffect(() => {
    if (isSignedIn) {
      navigate("/dashboard", { replace: true });
    }
  }, [isSignedIn, navigate]);

  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    // If Clerk already has an active session, redirect instead of calling
    // `signIn.create()` — that call throws "You're already signed in.".
    const alreadySigned =
      isSignedIn ||
      (typeof window !== "undefined" &&
        ((window as unknown as { Clerk?: { session?: unknown } }).Clerk?.session ||
          document.cookie.includes("__session")));
    if (alreadySigned) {
      navigate(callbackUrl, { replace: true });
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        if (result.createdSessionId && setActive) {
          await setActive({ session: result.createdSessionId });
        }
        // Let the useEffect watching isSignedIn handle navigation to avoid
        // racing Clerk's hydration. A full reload can cause ProtectedRoute bounce.
      }
      setError("Additional verification required. Please check your email.");
    } catch (err) {
      const msg = firstClerkMessage(err, "Invalid email or password");
      if (msg.toLowerCase().includes("already signed")) {
        navigate(callbackUrl, { replace: true });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r-2 border-outline-strong bg-surface-container-low p-12 lg:flex">
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "var(--metal-sheen)" }}
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
        <div className="relative flex flex-col gap-3">
          <nav className="flex flex-wrap items-center gap-x-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span className="text-primary-light">·</span>
            <a href="/" className="hover:text-foreground">Home</a>
            <span className="text-primary-light">·</span>
            <a href="/features.html" className="hover:text-foreground">Features</a>
            <span className="text-primary-light">·</span>
            <a href="/roadmap.html" className="hover:text-foreground">Roadmap</a>
            <span className="text-primary-light">·</span>
            <a href="/about.html" className="hover:text-foreground">About</a>
            <span className="text-primary-light">·</span>
            <a href="/dashboard" className="hover:text-foreground">Console</a>
            <span className="text-primary-light">·</span>
          </nav>
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
                Email or Username
              </label>
              <input
                id="email"
                type="text"
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
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !isLoaded}
              className="w-full border-2 border-outline-strong bg-primary px-4 py-2 font-mono text-primary-foreground uppercase tracking-wider shadow-bevel-red hover:bg-primary-hover hover:shadow-glow-red active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 chamfer"
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
          </div>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to="/register"
              className="text-xs font-mono uppercase tracking-wider underline hover:text-foreground"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

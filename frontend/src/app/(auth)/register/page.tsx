import { Link, useNavigate } from "react-router-dom";
import { useState, FormEvent, useEffect } from "react";
import { useSignUp, useSignIn, useAuth } from "@clerk/clerk-react";

function firstClerkMessage(err: unknown, fallback: string): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  return e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || fallback;
}

const FIELD_CLASS =
  "w-full border-2 border-outline bg-surface px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background";

const SUBMIT_CLASS =
  "w-full border-2 border-outline-strong bg-primary px-4 py-3 font-mono text-primary-foreground uppercase tracking-wider shadow-bevel-red chamfer hover:bg-primary-hover hover:shadow-glow-red active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

const ERROR_CLASS =
  "border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground";

export default function RegisterPage() {
  const { signUp, isLoaded, setActive } = useSignUp();
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (isSignedIn) {
      navigate("/dashboard", { replace: true });
    }
  }, [isSignedIn, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    const [firstName, ...rest] = displayName.trim().split(/\s+/);
    const lastName = rest.join(" ") || undefined;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        emailAddress: email,
        password,
        firstName: firstName || displayName,
        lastName,
      };
      if (username.trim()) payload.username = username.trim();
      await signUp.create(payload);
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      setError(firstClerkMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status !== "complete") {
        setError("Verification incomplete. Please restart sign-up.");
        return;
      }
      // Activate the post-verification session if Clerk provided one. If
      // `setActive` rejects (some dev instances refuse to activate a session
      // created via the signup path), fall through to signing in with the
      // same credentials to obtain a clean signin-style session.
      let activated = false;
      if (result.createdSessionId && setActive) {
        try {
          await setActive({ session: result.createdSessionId });
          activated = true;
        } catch {
          activated = false;
        }
      }
      if (!activated) {
        // Sign in with the same credentials. Clerk maps this to the existing
        // user and issues a fresh, signin-style session that activates
        // correctly. The signup session is replaced.
        const signInResult = await signIn.create({ identifier: email, password });
        if (signInResult.status === "complete" && signInResult.createdSessionId && setActive) {
          await setActive({ session: signInResult.createdSessionId });
        } else {
          setError("Account created but sign-in could not be completed. Please try the sign-in page.");
          return;
        }
      }
      navigate("/dashboard", { replace: true });
      // Also rely on useEffect watching isSignedIn as fallback — do NOT do a full reload
      // (window.location.href) which races Clerk hydration and causes ProtectedRoute bounce.
    } catch (err) {
      setError(firstClerkMessage(err, "Invalid verification code"));
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="panel w-full max-w-md p-8 shadow-panel">
          <div className="mb-6 flex items-center gap-3 border-b-2 border-outline-strong pb-5">
            <img src="/MKINDAYZIR_logo.jpg" alt="Mkindayzir" className="h-10 w-10 object-cover border-2 border-outline-strong" />
            <div className="font-display text-lg font-extrabold uppercase tracking-tight">Verify Email</div>
          </div>
          <p className="mb-4 text-sm text-muted-foreground font-mono">
            We sent a verification code to <span className="text-foreground">{email}</span>
          </p>
          <form onSubmit={handleVerify} className="space-y-4">
            {error && <div className={ERROR_CLASS}>{error}</div>}
            <div>
              <label htmlFor="code" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Verification Code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={FIELD_CLASS}
                placeholder="Enter 6-digit code"
                required
              />
            </div>
            <button type="submit" disabled={loading} className={SUBMIT_CLASS}>
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>
          </form>
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
          {error && <div className={ERROR_CLASS}>{error}</div>}
          <div>
            <label htmlFor="email" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLASS} required />
          </div>
          <div>
            <label htmlFor="username" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Username <span className="normal-case text-muted-foreground">(if required)</span></label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={FIELD_CLASS} placeholder="e.g. mostafa_taher" />
          </div>
          <div>
            <label htmlFor="displayName" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Display Name</label>
            <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={FIELD_CLASS} required />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD_CLASS} required />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Confirm Password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={FIELD_CLASS} required />
          </div>
          <button type="submit" disabled={loading || !isLoaded} className={SUBMIT_CLASS}>
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

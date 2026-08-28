import { Link } from "react-router-dom";
import { useState, FormEvent } from "react";
import { useSignUp } from "@clerk/clerk-react";

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
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

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
      await signUp.create({
        emailAddress: email,
        password,
        firstName: firstName || displayName,
        lastName,
      });
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
    if (!isLoaded || !signUp) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        window.location.href = "/dashboard";
        return;
      }
      setError("Verification incomplete. Please try again.");
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

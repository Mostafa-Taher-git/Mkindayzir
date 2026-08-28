import { Link } from "react-router-dom";
import { useState, FormEvent } from "react";
import { useSignIn } from "@clerk/clerk-react";

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

type Stage = "email" | "code" | "done";

export default function ForgotPasswordPage() {
  const { signIn, isLoaded } = useSignIn();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);
    setLoading(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      setStage("code");
    } catch (err) {
      setError(firstClerkMessage(err, "Could not send reset code"));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (result.status === "complete") {
        setStage("done");
        return;
      }
      setError("Reset incomplete. Please try again.");
    } catch (err) {
      setError(firstClerkMessage(err, "Reset failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="panel w-full max-w-md p-8 shadow-panel">
        <div className="mb-6 flex items-center gap-3 border-b-2 border-outline-strong pb-5">
          <img src="/MKINDAYZIR_logo.jpg" alt="Mkindayzir" className="h-10 w-10 object-cover border-2 border-outline-strong" />
          <div className="font-display text-lg font-extrabold uppercase tracking-tight">
            {stage === "done" ? "Password Reset" : "Reset Password"}
          </div>
        </div>

        {stage === "email" && (
          <form onSubmit={sendCode} className="space-y-4">
            <p className="text-sm text-muted-foreground font-mono">
              Enter your account email. We&apos;ll send a 6-digit reset code.
            </p>
            {error && <div className={ERROR_CLASS}>{error}</div>}
            <div>
              <label htmlFor="email" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLASS} required />
            </div>
            <button type="submit" disabled={loading || !isLoaded} className={SUBMIT_CLASS}>
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={submitReset} className="space-y-4">
            <p className="text-sm text-muted-foreground font-mono">
              We sent a code to <span className="text-foreground">{email}</span>. Enter the code and your new password below.
            </p>
            {error && <div className={ERROR_CLASS}>{error}</div>}
            <div>
              <label htmlFor="code" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">Verification Code</label>
              <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value)} className={FIELD_CLASS} placeholder="Enter 6-digit code" required />
            </div>
            <div>
              <label htmlFor="newPassword" className="mb-2 block font-mono text-xs font-medium uppercase tracking-wider">New Password</label>
              <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={FIELD_CLASS} required />
            </div>
            <button type="submit" disabled={loading} className={SUBMIT_CLASS}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {stage === "done" && (
          <>
            <p className="mb-4 text-sm text-muted-foreground font-mono">
              Your password has been reset. You can now sign in with your new password.
            </p>
            <Link to="/login" className={SUBMIT_CLASS + " block text-center"}>
              Go To Sign In
            </Link>
          </>
        )}

        <div className="mt-5 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="text-primary-light hover:text-foreground underline">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

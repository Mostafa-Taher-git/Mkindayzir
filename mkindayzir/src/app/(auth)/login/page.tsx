// src/app/(auth)/login/page.tsx
import { Suspense } from "react";
import { getConfig, isPersonalMode } from "@/lib/config";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  let registrationEnabled = false;
  let isPersonal = false;
  try {
    const config = getConfig();
    isPersonal = isPersonalMode();
    registrationEnabled = config.registrationEnabled;
  } catch {
    // Config invalid (e.g. secrets not generated yet) — defaults are safe.
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center font-mono uppercase tracking-wider text-muted-foreground">
          Initializing console...
        </div>
      }
    >
      <LoginForm
        registrationEnabled={registrationEnabled}
        isPersonal={isPersonal}
      />
    </Suspense>
  );
}

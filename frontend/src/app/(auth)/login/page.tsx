import { SignIn } from "@clerk/clerk-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SignIn routing="path" path="/login" signUpUrl="/register" afterSignInUrl="/dashboard" />
    </div>
  );
}

import { SignUp } from "@clerk/clerk-react";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SignUp routing="path" path="/register" signInUrl="/login" afterSignUpUrl="/dashboard" />
    </div>
  );
}

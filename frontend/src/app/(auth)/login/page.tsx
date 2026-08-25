
import { useConfig } from "@/hooks/use-config";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const { registrationEnabled, mode } = useConfig();
  const isPersonal = mode === "personal";

  return (
    <LoginForm registrationEnabled={registrationEnabled} isPersonal={isPersonal} />
  );
}

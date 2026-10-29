import { PublicShell } from "@/components/shell/PublicShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/app/login/actions";

export default function SignupPage() {
  return (
    <PublicShell>
      <AuthForm mode="signup" action={signUp} />
    </PublicShell>
  );
}

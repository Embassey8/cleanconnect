import { Suspense } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/app/login/actions";

async function Form({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" action={signUp} next={typeof next === "string" ? next : undefined} />;
}

export default function SignupPage(props: PageProps<"/signup">) {
  return (
    <PublicShell>
      <Suspense><Form searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}

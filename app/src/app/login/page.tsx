import { Suspense } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "./actions";

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={signIn} next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <PublicShell>
      <Suspense><Form searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}

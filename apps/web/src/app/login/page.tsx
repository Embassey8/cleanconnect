import { Suspense } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "./actions";

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next, confirmed } = await searchParams;
  return (
    <div className="space-y-4">
      {confirmed === "1" && (
        <p role="status" className="mx-auto w-full max-w-sm rounded-input bg-primary-tint px-3 py-2 text-sm font-semibold text-primary">
          Email confirmed. Sign in to continue.
        </p>
      )}
      <AuthForm mode="login" action={signIn} next={typeof next === "string" ? next : undefined} />
    </div>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <PublicShell>
      <Suspense><Form searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}

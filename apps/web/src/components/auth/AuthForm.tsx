"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "@/app/login/actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm";

export function AuthForm({
  mode, action, next,
}: { mode: "login" | "signup"; action: (s: AuthState, f: FormData) => Promise<AuthState>; next?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const login = mode === "login";
  return (
    <form action={formAction} className="mx-auto w-full max-w-sm space-y-4 rounded-card border border-border bg-surface p-6">
      <h1 className="text-xl font-extrabold">{login ? "Sign in" : "Create your account"}</h1>
      {next && <input type="hidden" name="next" value={next} />}
      {!login && (
        <label className="block text-sm font-semibold">Full name
          <input name="name" required autoComplete="name" className={input} />
        </label>
      )}
      <label className="block text-sm font-semibold">Email
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block text-sm font-semibold">Password
        <input name="password" type="password" required minLength={8}
          autoComplete={login ? "current-password" : "new-password"} className={input} />
      </label>
      {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button disabled={pending}
        className="min-h-11 w-full rounded-input bg-primary text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
        {pending ? "Please wait…" : login ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        {login ? "New here? " : "Already have an account? "}
        <Link href={login ? "/signup" : "/login"} className="font-semibold text-primary">
          {login ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}

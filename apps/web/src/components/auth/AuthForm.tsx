"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resendConfirmation, type AuthState } from "@/app/login/actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm";

export function AuthForm({
  mode, action, next,
}: { mode: "login" | "signup"; action: (s: AuthState, f: FormData) => Promise<AuthState>; next?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [resent, resendAction, resending] = useActionState(resendConfirmation, {});
  const login = mode === "login";
  const confirmEmail = resent.confirmEmail ?? state.confirmEmail;
  if (confirmEmail) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-card border border-border bg-surface p-6" role="status">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary-tint" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0b6b57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        </div>
        <h1 className="text-xl font-extrabold">Confirm your email address</h1>
        <p className="text-sm text-text-2">
          We sent a link to <strong className="break-all text-ink">{confirmEmail}</strong>. Open it to activate your account, then come back and sign in.
        </p>
        <p className="text-sm text-muted">Can&apos;t see it? Check your spam or promotions folder.</p>
        {resent.notice && <p className="rounded-input bg-primary-tint px-3 py-2 text-sm text-primary">{resent.notice}</p>}
        {resent.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{resent.error}</p>}
        <form action={resendAction} className="space-y-3">
          <input type="hidden" name="email" value={confirmEmail} />
          {next && <input type="hidden" name="next" value={next} />}
          <button disabled={resending}
            className="min-h-11 w-full rounded-input border border-border text-sm font-bold text-ink hover:border-primary disabled:opacity-60">
            {resending ? "Sending…" : "Send the email again"}
          </button>
        </form>
        <Link href="/login" className="block text-center text-sm font-semibold text-primary">Go to sign in</Link>
      </div>
    );
  }
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

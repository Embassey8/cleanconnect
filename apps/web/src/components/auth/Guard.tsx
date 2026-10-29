import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import type { Role } from "@cleanconnect/shared";

async function Check({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  await requireRole(roles);
  return <>{children}</>;
}

/** Wrap a layout's children so access is verified on the server without blocking the shell. */
export function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <Check roles={roles}>{children}</Check>
    </Suspense>
  );
}

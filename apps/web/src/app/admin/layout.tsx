import { Suspense } from "react";
import { Guard } from "@/components/auth/Guard";
import { AdminShell, type ShellInfo } from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { recentMonths } from "@/lib/time";

/** Loads the sidebar badge counts and the signed-in admin, then renders the console frame. */
async function Frame({ children }: { children: React.ReactNode }) {
  const [user, supabase] = await Promise.all([getSessionUser(), createClient()]);
  const { data } = await supabase.rpc("admin_overview");
  const o = (data ?? {}) as { pending_approvals?: number; requests_to_assign?: number; open_tickets?: number };
  const info: ShellInfo = {
    name: user?.name ?? "Admin", role: user?.adminRole ?? "super_admin",
    badges: { approvals: o.pending_approvals ?? 0, requests: o.requests_to_assign ?? 0, tickets: o.open_tickets ?? 0 },
    months: recentMonths(6).map(({ key, long }) => ({ key, long })),
  };
  return <AdminShell info={info}>{children}</AdminShell>;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Guard roles={["admin"]}>
      <Suspense fallback={<main className="p-8 text-muted">Loading…</main>}><Frame>{children}</Frame></Suspense>
    </Guard>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type AdminRole, type Role, type SessionUser } from "./roles";

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return null;
  const { data: row } = await supabase
    .from("users")
    .select("id, role, name, admin_role")
    .eq("id", id)
    .single();
  if (!row) return null;
  const { data: provider } = await supabase
    .from("providers")
    .select("service")
    .eq("owner_id", id)
    .limit(1)
    .maybeSingle();
  return {
    id: row.id,
    role: row.role as Role,
    name: row.name,
    adminRole: (row.admin_role as AdminRole | null) ?? undefined,
    providerService: provider?.service ?? undefined,
  };
}

/** Server-side authorization. Redirects signed-out users to /login and others to their home. */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user));
  return user;
}

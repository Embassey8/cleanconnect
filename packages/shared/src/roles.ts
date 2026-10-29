export type Role = "customer" | "provider" | "partner" | "admin";
export type ProviderService = "cleaning" | "laundry" | "carwash";
export type AdminRole = "super_admin" | "operations" | "support" | "finance";

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  providerService?: ProviderService;
  adminRole?: AdminRole;
}

/** Where each role lands after sign-in (BUILD_BRIEF §4). */
export const homeFor = (u: SessionUser): string =>
  u.role === "admin" ? "/admin/overview"
  : u.role === "partner" ? "/partner"
  : u.role === "provider" ? "/provider"
  : "/account";

/** Route prefix → roles allowed. First matching prefix wins. */
export const ROUTE_ACCESS: [prefix: string, roles: Role[]][] = [
  ["/admin", ["admin"]],
  ["/partner", ["partner"]],
  ["/provider", ["provider"]],
  ["/account", ["customer", "provider", "admin"]],
  ["/messages", ["customer", "provider", "admin"]],
];

export function canAccess(pathname: string, role: Role | null): boolean {
  const rule = ROUTE_ACCESS.find(([p]) => pathname === p || pathname.startsWith(p + "/"));
  if (!rule) return true;
  return role !== null && rule[1].includes(role);
}

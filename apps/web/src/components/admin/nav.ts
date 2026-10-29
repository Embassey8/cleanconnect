export interface AdminNavItem {
  href: string; label: string; title: string; sub: string; group?: string;
  /** Key in the badge counts passed to the shell. */
  badge?: "approvals" | "requests" | "tickets";
  /** Shows the month picker in the header. */
  period?: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/overview", label: "Overview", group: "DASHBOARD", title: "Overview", sub: "Everything at a glance · live data", period: true },
  { href: "/admin/approvals", label: "Provider approvals", group: "PEOPLE", badge: "approvals", title: "Provider approvals", sub: "Check CAC, NIN and BVN before providers go live" },
  { href: "/admin/registrations", label: "Registrations & logins", title: "Registrations & logins", sub: "Sign-ups and account activity" },
  { href: "/admin/applications", label: "Job applications", title: "Job applications", sub: "Car wash partners and staff applicants" },
  { href: "/admin/staff", label: "Staff & locations", title: "Staff & locations", sub: "Employees and service providers by area" },
  { href: "/admin/requests", label: "User requests", group: "OPERATIONS", badge: "requests", title: "User requests", sub: "Managed car wash requests waiting for a partner" },
  { href: "/admin/vip", label: "VIP calls", title: "VIP calls", sub: "Upgrades, renewals and promotion set-ups" },
  { href: "/admin/income", label: "Income & profit", group: "MONEY", title: "Income & profit", sub: "Revenue, payouts and how profit is calculated", period: true },
  { href: "/admin/payouts", label: "Payouts & disputes", title: "Payouts & disputes", sub: "Settle withdrawals and decide disputed orders" },
  { href: "/admin/support", label: "Support & help", group: "SUPPORT", badge: "tickets", title: "Support & help", sub: "Open tickets and live chat" },
  { href: "/admin/chat", label: "Chat", title: "Chat", sub: "Live conversations with customers and providers" },
];

const SEARCH: AdminNavItem = { href: "/admin/search", label: "Search", title: "Search results", sub: "Users, providers and orders matching your search" };

export function navFor(path: string): AdminNavItem {
  if (path.startsWith("/admin/search")) return SEARCH;
  return ADMIN_NAV.find((n) => path === n.href || path.startsWith(`${n.href}/`)) ?? ADMIN_NAV[0];
}

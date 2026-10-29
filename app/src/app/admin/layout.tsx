import { DashboardShell } from "@/components/shell/DashboardShell";

const NAV = [
  ["overview", "Overview"], ["approvals", "Provider approvals"], ["registrations", "Registrations & logins"],
  ["applications", "Job applications"], ["staff", "Staff & locations"], ["requests", "User requests"],
  ["vip", "VIP calls"], ["income", "Income & profit"], ["support", "Support & help"], ["chat", "Chat"],
].map(([s, label]) => ({ href: `/admin/${s}`, label }));

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <DashboardShell title="Admin" nav={NAV} dark>{children}</DashboardShell>;
}

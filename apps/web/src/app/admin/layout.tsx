import { Guard } from "@/components/auth/Guard";
import { DashboardShell } from "@/components/shell/DashboardShell";

const NAV = [
  ["overview", "Overview"], ["approvals", "Provider approvals"], ["payouts", "Payouts & disputes"], ["registrations", "Registrations & logins"],
  ["applications", "Job applications"], ["staff", "Staff & locations"], ["requests", "User requests"],
  ["vip", "VIP calls"], ["income", "Income & profit"], ["support", "Support & help"], ["chat", "Chat"],
].map(([s, label]) => ({ href: `/admin/${s}`, label }));

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <DashboardShell title="Admin" nav={NAV} dark><Guard roles={["admin"]}>{children}</Guard></DashboardShell>;
}

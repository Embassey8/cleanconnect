import { DashboardShell } from "@/components/shell/DashboardShell";

export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return (
    <DashboardShell title="Provider" nav={[{ href: "/provider", label: "Dashboard" }, { href: "/provider/prices", label: "Prices" }]}>
      {children}
    </DashboardShell>
  );
}

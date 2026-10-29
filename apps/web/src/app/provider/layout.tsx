import { Guard } from "@/components/auth/Guard";
import { DashboardShell } from "@/components/shell/DashboardShell";

export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return (
    <DashboardShell title="Provider" nav={[{ href: "/provider", label: "Dashboard" }, { href: "/provider/orders", label: "Orders" }, { href: "/messages", label: "Messages" }, { href: "/provider/prices", label: "Prices" }]}>
      <Guard roles={["provider"]}>{children}</Guard>
    </DashboardShell>
  );
}

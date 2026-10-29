import { Guard } from "@/components/auth/Guard";
import { DashboardShell } from "@/components/shell/DashboardShell";

export default function PartnerLayout({ children }: LayoutProps<"/partner">) {
  return (
    <DashboardShell title="Car wash partner" nav={[{ href: "/partner", label: "Jobs" }, { href: "/partner/wallet", label: "Payouts" }, { href: "/support", label: "Support" }]}>
      <Guard roles={["partner"]}>{children}</Guard>
    </DashboardShell>
  );
}

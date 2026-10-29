import { Guard } from "@/components/auth/Guard";
import { PartnerShell } from "@/components/partner/PartnerShell";

export default function PartnerLayout({ children }: LayoutProps<"/partner">) {
  return <PartnerShell><Guard roles={["partner"]}>{children}</Guard></PartnerShell>;
}

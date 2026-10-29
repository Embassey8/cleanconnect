import { Guard } from "@/components/auth/Guard";

export default function PartnerLayout({ children }: LayoutProps<"/partner">) {
  return <Guard roles={["partner"]}>{children}</Guard>;
}

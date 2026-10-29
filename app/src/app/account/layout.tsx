import { Guard } from "@/components/auth/Guard";

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return <Guard roles={["customer", "provider", "admin"]}>{children}</Guard>;
}

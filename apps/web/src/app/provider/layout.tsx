import { Suspense } from "react";
import { Guard } from "@/components/auth/Guard";
import { ProviderShell } from "@/components/provider/ProviderShell";
import { requireOwnProvider } from "@/lib/auth/provider";

async function Frame({ children }: { children: React.ReactNode }) {
  const p = await requireOwnProvider();
  return <ProviderShell subtitle={`Provider · ${p.service === "laundry" ? "Laundry" : "House cleaning"}`}>{children}</ProviderShell>;
}

export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return (
    <Guard roles={["provider"]}>
      <Suspense fallback={<main className="p-8 text-muted">Loading…</main>}><Frame>{children}</Frame></Suspense>
    </Guard>
  );
}

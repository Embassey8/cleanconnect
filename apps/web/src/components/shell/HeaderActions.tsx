import Link from "next/link";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

/** Right side of the header: wallet pill for signed-in users, sign-in otherwise. */
export async function HeaderActions() {
  const user = await getSessionUser();
  let balance: number | null = null;
  if (user) {
    const supabase = await createClient();
    const { data: w } = await supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle();
    if (w) {
      const { data: b } = await supabase.from("wallet_balances").select("available").eq("wallet_id", w.id).maybeSingle();
      balance = b?.available ?? 0;
    }
  }
  const walletHref = user?.role === "provider" ? "/provider/wallet" : user?.role === "partner" ? "/partner/wallet" : "/account/wallet";
  return (
    <div className="flex flex-wrap items-center gap-3">
      {user ? (
        <Link href={walletHref} className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-semibold">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B6B57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M16 13h2" /><path d="M3 10h18" /></svg>
          Wallet {formatNaira(balance ?? 0)}
        </Link>
      ) : (
        <Link href="/login" className="flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold">Sign in</Link>
      )}
      {user?.role !== "provider" && user?.role !== "partner" && (
        <Link href="/providers/join" className="flex min-h-11 items-center rounded-input bg-ink px-4 text-sm font-semibold text-white">Offer a service</Link>
      )}
    </div>
  );
}

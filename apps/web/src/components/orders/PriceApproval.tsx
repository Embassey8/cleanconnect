"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatNaira, shortfall } from "@cleanconnect/shared";
import { respondPriceChange } from "@/app/account/orders/actions";
import { isLowBalance } from "@/lib/money";

/** The shop counted your items and the total changed: approve to continue, or decline for a full refund. */
export function PriceApproval({ orderId, current, proposed, available }: { orderId: string; current: number; proposed: number; available: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const diff = proposed - current;
  const short = diff > 0 ? shortfall(diff, available) : 0;
  const answer = (approve: boolean) => start(async () => {
    if (!approve && !confirm("Decline the new total? The order will be cancelled and you'll be refunded in full.")) return;
    setError((await respondPriceChange(orderId, approve)).error);
  });
  return (
    <section className="rounded-card border border-warning bg-warning-bg p-4">
      <h2 className="font-extrabold text-warning">The shop counted your items: new total {formatNaira(proposed)}</h2>
      <p className="mt-1 text-sm text-text-2">
        It was {formatNaira(current)}. {diff > 0 ? `You'll pay ${formatNaira(diff)} more` : `You'll get ${formatNaira(Math.abs(diff))} back`} from your wallet if you approve. Cleaning starts once you answer.
      </p>
      {short > 0 && <p className="mt-2 text-sm font-semibold text-danger">Your wallet is {formatNaira(short)} short. <Link href="/account/wallet" className="underline">Top up</Link> to approve.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={pending || short > 0} onClick={() => answer(true)} className="min-h-11 rounded-input bg-primary px-5 text-sm font-bold text-white disabled:opacity-60">Approve {formatNaira(proposed)}</button>
        <button disabled={pending} onClick={() => answer(false)} className="min-h-11 rounded-input border border-border bg-surface px-4 text-sm font-bold text-danger disabled:opacity-60">Decline &amp; refund</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}{isLowBalance(error) ? " " : ""}</p>}
    </section>
  );
}

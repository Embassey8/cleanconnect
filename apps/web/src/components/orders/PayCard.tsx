"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatNaira, shortfall } from "@cleanconnect/shared";
import { payOrder } from "@/app/wallet/actions";

export function PayCard({ orderId, total, available }: { orderId: string; total: number; available: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const short = shortfall(total, available);
  return (
    <section className="rounded-card border border-primary bg-primary-tint p-4">
      <h2 className="font-extrabold">Pay to confirm your booking</h2>
      <p className="mt-1 text-sm text-text-2">
        {formatNaira(total)} is held safely until the job is done. The provider can accept once you&apos;ve paid, and you get a full refund if they decline.
      </p>
      <p className="mt-1 text-sm text-text-2">Wallet balance: {formatNaira(available)}</p>
      {short > 0 ? (
        <Link href="/account/wallet" className="mt-3 inline-flex min-h-11 items-center rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover">
          Add {formatNaira(short)} to your wallet
        </Link>
      ) : (
        <button disabled={pending} onClick={() => start(async () => setError((await payOrder(orderId)).error))}
          className="mt-3 min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60">
          {pending ? "Paying…" : `Pay ${formatNaira(total)} from wallet`}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

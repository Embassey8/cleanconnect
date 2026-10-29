"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cancelVip, subscribeVip } from "@/app/wallet/actions";
import { isLowBalance } from "@/lib/money";

export function VipButtons({ providerId, active, renewing }: { providerId: string; active: boolean; renewing: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      {!active && (
        <button disabled={pending} onClick={() => start(async () => setError((await subscribeVip(providerId)).error))}
          className="min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60">
          Upgrade to VIP
        </button>
      )}
      {active && renewing && (
        <button disabled={pending} onClick={() => start(async () => setError((await cancelVip(providerId)).error))}
          className="min-h-11 rounded-input border border-border bg-surface px-5 font-bold text-danger disabled:opacity-60">
          Stop auto-renewal
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error} {isLowBalance(error) || error.includes("balance") ? <Link href="/provider/wallet" className="font-bold underline">Open wallet</Link> : null}
        </p>
      )}
    </div>
  );
}

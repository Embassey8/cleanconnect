"use client";

import { useState, useTransition } from "react";
import { ACTION_LABEL, type OrderStatus } from "@cleanconnect/shared";
import { advanceOrder } from "@/app/account/orders/actions";

const DANGER: OrderStatus[] = ["declined", "cancelled", "disputed"];

export function ActionButtons({ orderId, actions }: { orderId: string; actions: OrderStatus[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a} disabled={pending}
            onClick={() => {
              if (DANGER.includes(a) && !confirm(`${ACTION_LABEL[a] ?? a}? This can't be undone.`)) return;
              start(async () => { const r = await advanceOrder(orderId, a); setError(r.error); });
            }}
            className={`min-h-11 rounded-input px-4 text-sm font-bold disabled:opacity-60 ${
              DANGER.includes(a) ? "border border-border bg-surface text-danger" : "bg-primary text-white hover:bg-primary-hover"}`}>
            {ACTION_LABEL[a] ?? a}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

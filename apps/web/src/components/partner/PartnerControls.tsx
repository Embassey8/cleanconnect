"use client";

import { useEffect, useState, useTransition } from "react";
import { setAvailability } from "@/app/ops/actions";

/** "Available for jobs" switch. When off, admins can't offer you new car wash jobs. */
export function AvailabilityToggle({ on, tone = "carwash", onLabel = "Available for jobs", offLabel = "Paused: not taking jobs" }: {
  on: boolean; tone?: "carwash" | "primary"; onLabel?: string; offLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" aria-pressed={on} disabled={pending}
        onClick={() => start(async () => setError((await setAvailability(!on)).error))}
        className={`flex min-h-11 items-center gap-2.5 rounded-full border px-3.5 text-sm font-bold disabled:opacity-60 ${on ? (tone === "primary" ? "border-primary bg-primary-tint text-primary" : "border-carwash bg-carwash-bg text-carwash") : "border-border bg-surface text-text-2"}`}>
        <span className={`flex h-5 w-9 items-center rounded-full p-0.5 ${on ? `justify-end ${tone === "primary" ? "bg-primary" : "bg-carwash"}` : "justify-start bg-[#a9b7b2]"}`}><span className="size-4 rounded-full bg-white" /></span>
        {on ? onLabel : offLabel}
      </button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** mm:ss until `until` (ISO). Shows "Expired" at zero. */
export function Countdown({ until, label = "Accept in" }: { until: string; label?: string }) {
  const target = new Date(until).getTime();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  if (left === null) return <span>{label} …</span>;
  if (left === 0) return <span>Offer expired</span>;
  return <span>{label} {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span>;
}

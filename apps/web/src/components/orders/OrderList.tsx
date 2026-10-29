import Link from "next/link";
import { STATUS_LABEL, TERMINAL, formatNaira, type OrderStatus } from "@cleanconnect/shared";
import { formatWhen } from "@/lib/time";

export interface OrderRow {
  id: string; service: string; status: string; total: number; created_at: string; scheduled_at: string | null;
  providers: { display_name: string } | { display_name: string }[] | null;
}

export function OrderList({ rows, base, empty }: { rows: OrderRow[]; base: string; empty: string }) {
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((o) => {
        const p = Array.isArray(o.providers) ? o.providers[0] : o.providers;
        const done = TERMINAL.includes(o.status as OrderStatus);
        return (
          <li key={o.id}>
            <Link href={`${base}/${o.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4 hover:border-primary">
              <div>
                <p className="font-bold capitalize">{o.service}{p ? ` · ${p.display_name}` : ""}</p>
                <p className="text-sm text-muted">{formatWhen(o.scheduled_at ?? o.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{formatNaira(o.total)}</p>
                <p className={`text-xs font-bold ${done ? "text-muted" : "text-primary"}`}>{STATUS_LABEL[o.status as OrderStatus]}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

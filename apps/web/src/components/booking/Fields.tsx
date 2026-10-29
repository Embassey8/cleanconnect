export const field = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm";

export function DeliveryFields() {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold">Address
        <input name="address" required autoComplete="street-address" className={field} placeholder="House number and street" />
      </label>
      <label className="block text-sm font-semibold">Area
        <input name="area" className={field} placeholder="e.g. Lekki Phase 1" />
      </label>
      <label className="block text-sm font-semibold">Preferred date and time
        <input name="when" type="datetime-local" className={field} />
      </label>
      <p className="text-xs text-muted">The provider only sees your exact address after they accept.</p>
    </div>
  );
}

export function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn = "grid size-11 place-items-center rounded-input border border-border bg-surface text-lg font-bold disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} aria-label={`Remove one ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span className="w-6 text-center font-semibold" aria-live="polite">{value}</span>
      <button type="button" className={btn} aria-label={`Add one ${label}`} disabled={value >= 99} onClick={() => onChange(Math.min(99, value + 1))}>+</button>
    </div>
  );
}

import type { SaveState } from "@/app/provider/prices/actions";

export function SaveBar({ state, pending }: { state: SaveState; pending: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <button disabled={pending} className="min-h-11 rounded-input bg-primary px-6 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
        {pending ? "Saving…" : "Save prices"}
      </button>
      {state.ok && <p role="status" className="text-sm font-semibold text-primary">Saved.</p>}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    </div>
  );
}

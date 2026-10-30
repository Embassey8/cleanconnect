/** Shown instantly while a provider page loads, so navigation feels immediate. */
export default function ProviderLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-border" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-[14px] bg-border/70" />)}</div>
      <div className="h-48 animate-pulse rounded-2xl bg-border/70" />
    </div>
  );
}

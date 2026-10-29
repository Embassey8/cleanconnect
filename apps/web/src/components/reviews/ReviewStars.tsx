import { CATEGORY_LABEL } from "@cleanconnect/shared";

export const Stars = ({ n }: { n: number }) => (
  <span aria-label={`${n} out of 5`} className="text-accent">{"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span></span>
);

export interface ReviewItem {
  id: string; rating: number; quality: number; punctuality: number; communication: number; value_score: number;
  body: string; reply: string | null; created_at: string; photos: { id: string; url: string }[];
}

export function ReviewCard({ r, actions }: { r: ReviewItem; actions?: React.ReactNode }) {
  const cats = { quality: r.quality, punctuality: r.punctuality, communication: r.communication, value: r.value_score };
  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between"><Stars n={r.rating} /><span className="text-xs text-muted">Verified customer</span></div>
      {r.body && <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>}
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
        {(Object.keys(cats) as (keyof typeof cats)[]).map((k) => <span key={k}>{CATEGORY_LABEL[k]} {cats[k]}/5</span>)}
      </p>
      {r.photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {r.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <li key={p.id}><img src={p.url} alt="Photo from this review" loading="lazy" className="aspect-square w-full rounded-input object-cover" /></li>
          ))}
        </ul>
      )}
      {r.reply && <p className="mt-3 rounded-input bg-primary-tint p-3 text-sm"><strong>Provider reply:</strong> {r.reply}</p>}
      {actions}
    </article>
  );
}

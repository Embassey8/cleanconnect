import { Suspense } from "react";
import Link from "next/link";
import { PHASE_LABEL, type MediaPhase } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { signedUrls } from "@/lib/media";

async function Saved() {
  const user = await getSessionUser();
  const supabase = await createClient();
  const [{ data: providers }, { data: photos }] = await Promise.all([
    supabase.from("saved_providers").select("provider_id, providers(display_name, slug)").eq("user_id", user!.id).order("created_at", { ascending: false }),
    supabase.from("saved_media").select("media_id, media(path, phase, providers(slug, display_name))").eq("user_id", user!.id).order("created_at", { ascending: false }),
  ]);
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const items = (photos ?? []).map((p) => {
    const m = one(p.media as { path: string; phase: string; providers: unknown } | { path: string; phase: string; providers: unknown }[] | null);
    const prov = m ? one(m.providers as { slug: string; display_name: string } | { slug: string; display_name: string }[] | null) : null;
    return m ? { id: p.media_id, path: m.path, phase: m.phase as MediaPhase, prov } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const urls = await signedUrls(items.map((i) => i.path));
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 font-extrabold">Saved providers</h2>
        {(providers ?? []).length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">Tap ♡ on a profile to save it here.</p> : (
          <ul className="space-y-2">
            {(providers ?? []).map((s) => {
              const p = one(s.providers as { display_name: string; slug: string } | { display_name: string; slug: string }[] | null);
              return p ? <li key={s.provider_id}><Link href={`/p/${p.slug}`} className="flex min-h-11 items-center rounded-card border border-border bg-surface p-4 font-bold hover:border-primary">{p.display_name}</Link></li> : null;
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-extrabold">Saved photos</h2>
        {items.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No saved photos yet.</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.filter((i) => urls[i.path]).map((i) => (
              <li key={i.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[i.path]} alt={`${PHASE_LABEL[i.phase]} photo`} loading="lazy" className="aspect-square w-full rounded-card object-cover" />
                {i.prov && <Link href={`/p/${i.prov.slug}`} className="text-xs font-semibold text-primary">{i.prov.display_name}</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function SavedPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 md:p-8">
      <Link href="/account" className="text-sm font-semibold text-primary">← My account</Link>
      <h1 className="mb-6 mt-2 text-2xl font-extrabold">Saved</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Saved /></Suspense>
    </main>
  );
}

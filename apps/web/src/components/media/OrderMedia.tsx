import { PHASES_FOR, PHASE_LABEL, type MediaPhase, type OrderService } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/media";
import { CameraCapture } from "./CameraCapture";
import { ShareToggle } from "./PhotoButtons";

/** Job photos on an order page: providers capture them, customers decide which may go public. */
export async function OrderMedia({
  orderId, service, status, viewer,
}: { orderId: string; service: OrderService; status: string; viewer: "customer" | "provider" }) {
  const supabase = await createClient();
  const [{ data: rows }, { data: canAdd }] = await Promise.all([
    supabase.from("media").select("id, path, phase, is_public").eq("order_id", orderId).is("review_id", null).order("created_at"),
    viewer === "provider" ? supabase.rpc("can_add_media", { p_order: orderId, p_review: null }) : Promise.resolve({ data: false }),
  ]);
  const photos = rows ?? [];
  if (photos.length === 0 && !canAdd) return null;
  const urls = await signedUrls(photos.map((p) => p.path));
  return (
    <section className="space-y-3">
      <h2 className="font-extrabold">Photos</h2>
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="space-y-1">
              {urls[p.path]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={urls[p.path]} alt={`${PHASE_LABEL[p.phase as MediaPhase]} photo`} loading="lazy" className="aspect-square w-full rounded-input object-cover" />
                : <div className="aspect-square rounded-input bg-bg-admin" />}
              <p className="text-xs font-semibold">{PHASE_LABEL[p.phase as MediaPhase]}</p>
              {viewer === "customer" && <ShareToggle mediaId={p.id} isPublic={p.is_public} canShare={status === "completed"} />}
            </li>
          ))}
        </ul>
      )}
      {viewer === "customer" && photos.length > 0 && status !== "completed" && (
        <p className="text-xs text-muted">Once the job is completed you can choose to show these photos on the provider&apos;s profile.</p>
      )}
      {canAdd && <CameraCapture orderId={orderId} phases={PHASES_FOR[service]} />}
    </section>
  );
}

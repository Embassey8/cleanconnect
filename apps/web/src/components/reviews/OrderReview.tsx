import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/media";
import { CameraCapture } from "@/components/media/CameraCapture";
import { ReviewCard } from "./ReviewStars";
import { ReplyForm, ReviewForm } from "./ReviewForms";

/** The review for an order: customers write it once the job is completed, providers reply publicly. */
export async function OrderReview({ orderId, status, viewer }: { orderId: string; status: string; viewer: "customer" | "provider" }) {
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("reviews").select("id, rating, quality, punctuality, communication, value_score, body, reply, created_at").eq("order_id", orderId).maybeSingle();
  if (!r) {
    if (viewer !== "customer" || status !== "completed") return null;
    return (
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-3 font-extrabold">How did it go?</h2>
        <ReviewForm orderId={orderId} />
      </section>
    );
  }
  const { data: photos } = await supabase.from("media").select("id, path").eq("review_id", r.id).order("created_at");
  const urls = await signedUrls((photos ?? []).map((p) => p.path));
  const item = { ...r, photos: (photos ?? []).filter((p) => urls[p.path]).map((p) => ({ id: p.id, url: urls[p.path] })) };
  return (
    <section className="space-y-3">
      <h2 className="font-extrabold">{viewer === "customer" ? "Your review" : "Customer review"}</h2>
      <ReviewCard r={item} />
      {viewer === "customer" && (photos ?? []).length < 4 && (
        <CameraCapture orderId={orderId} reviewId={r.id} phases={["general"]} label="Add a photo to your review" />
      )}
      {viewer === "provider" && !r.reply && <ReplyForm reviewId={r.id} />}
    </section>
  );
}

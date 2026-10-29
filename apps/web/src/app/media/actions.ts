"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_PHOTO_BYTES, PHASE_LABEL, isCleanJpeg, isStar, type MediaPhase } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/media";

export interface MediaState { error?: string; ok?: string; reviewId?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath("/account", "layout");
  revalidatePath("/provider", "layout");
  revalidatePath("/partner", "layout");
  revalidatePath("/p", "layout");
}

/**
 * Receives a photo taken with the in-app camera. The camera component re-encodes it from a canvas, which
 * removes EXIF/GPS and stamps it; here we re-check that, enforce the size limit, and only then store it.
 */
export async function uploadPhoto(form: FormData): Promise<MediaState> {
  const orderId = String(form.get("orderId") ?? "");
  const phase = String(form.get("phase") ?? "general") as MediaPhase;
  const reviewId = String(form.get("reviewId") ?? "") || null;
  const file = form.get("photo");
  if (!UUID.test(orderId) || (reviewId && !UUID.test(reviewId)) || !(phase in PHASE_LABEL)) return { error: "Something went wrong. Please try again." };
  if (!(file instanceof File)) return { error: "No photo received." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is too large." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isCleanJpeg(bytes)) return { error: "Photos must be taken with the CleanConnect camera." };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_add_media", { p_order: orderId, p_review: reviewId });
  if (!allowed) return { error: "You can't add photos to this order." };

  const path = `${orderId}/${crypto.randomUUID()}.jpg`;
  const admin = createAdminClient();
  const up = await admin.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (up.error) return { error: "Could not save the photo. Please try again." };
  const { error } = await supabase.rpc("register_media", { p_order: orderId, p_path: path, p_phase: phase, p_review: reviewId });
  if (error) {
    await admin.storage.from(MEDIA_BUCKET).remove([path]);
    return { error: error.message };
  }
  refresh();
  return { ok: "Photo saved." };
}

export async function setPhotoPublic(mediaId: string, isPublic: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_media_public", { p_media: mediaId, p_public: isPublic });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function createReview(_: MediaState, form: FormData): Promise<MediaState> {
  const n = (k: string) => Number(form.get(k));
  const scores = ["rating", "quality", "punctuality", "communication", "value"].map(n);
  if (!scores.every(isStar)) return { error: "Please choose a star rating for each row." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_review", {
    p_order: String(form.get("orderId")), p_rating: scores[0], p_quality: scores[1], p_punctuality: scores[2],
    p_communication: scores[3], p_value: scores[4], p_body: String(form.get("body") ?? ""),
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Thanks for your review!", reviewId: data as string };
}

export async function replyToReview(reviewId: string, _: MediaState, form: FormData): Promise<MediaState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_review", { p_review: reviewId, p_reply: String(form.get("reply") ?? "") });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Reply posted." };
}

export async function toggleSavedProvider(providerId: string, slug: string): Promise<{ saved?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_saved_provider", { p_provider: providerId });
  if (error) {
    if (error.message.includes("not signed in")) redirect(`/login?next=${encodeURIComponent(`/p/${slug}`)}`);
    return { error: error.message };
  }
  revalidatePath("/account/saved");
  return { saved: data as boolean };
}

export async function toggleSavedPhoto(mediaId: string, slug: string): Promise<{ saved?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_saved_media", { p_media: mediaId });
  if (error) {
    if (error.message.includes("not signed in")) redirect(`/login?next=${encodeURIComponent(`/p/${slug}`)}`);
    return { error: error.message };
  }
  revalidatePath("/account/saved");
  return { saved: data as boolean };
}

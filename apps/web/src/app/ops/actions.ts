"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkCacDocument, isCacNumber, parseNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KYC_BUCKET } from "@/lib/kyc-documents";

export interface OpsState { error?: string; ok?: string }

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/partner", "layout");
  revalidatePath("/account", "layout");
  revalidatePath("/support", "layout");
}

export async function assignCarwash(orderId: string, partnerId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_carwash", { p_order: orderId, p_partner: partnerId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function respondOffer(orderId: string, accept: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_carwash_offer", { p_order: orderId, p_accept: accept });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function submitApplication(_: OpsState, form: FormData): Promise<OpsState> {
  const kind = String(form.get("kind"));
  const supabase = await createClient();
  let cac: string | null = null;
  let documentPath: string | null = null;

  // Car wash partners must give the CAC number, the name as registered, and an image of the certificate.
  if (kind === "partner") {
    cac = String(form.get("cac") ?? "");
    if (String(form.get("name") ?? "").trim().length < 2) return { error: "Enter the business name exactly as it appears on your CAC certificate." };
    if (!isCacNumber(cac)) return { error: "Enter your RC or BN number, e.g. RC1234567." };
    const file = form.get("cacCertificate");
    if (!(file instanceof File) || file.size === 0) return { error: "Upload a photo or scan of your CAC certificate." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkCacDocument(bytes);
    if (!checked.ok) return { error: checked.reason };
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (!uid) return { error: "Sign in to continue." };
    documentPath = `cac/${uid}/${crypto.randomUUID()}.${checked.image.ext}`;
    const { error: uploadError } = await createAdminClient().storage.from(KYC_BUCKET)
      .upload(documentPath, bytes, { contentType: checked.image.type, upsert: false });
    if (uploadError) return { error: "We couldn't upload your certificate. Please try again." };
  }

  const { error } = await supabase.rpc("submit_application", {
    p_kind: kind, p_name: String(form.get("name") ?? ""), p_phone: String(form.get("phone") ?? ""),
    p_area: String(form.get("area") ?? ""), p_position: String(form.get("position") ?? ""), p_note: String(form.get("note") ?? ""),
    p_cac: cac, p_cac_document: documentPath,
  });
  if (error) {
    if (documentPath) await createAdminClient().storage.from(KYC_BUCKET).remove([documentPath]).catch(() => undefined);
    return { error: error.message };
  }
  return { ok: "Application received. We'll be in touch." };
}

export async function advanceApplication(id: string, stage: string, reason?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_application", { p_id: id, p_stage: stage, p_reason: reason ?? null });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function createTicket(_: OpsState, form: FormData): Promise<OpsState> {
  const supabase = await createClient();
  const order = String(form.get("order") ?? "");
  const { data, error } = await supabase.rpc("create_ticket", {
    p_subject: String(form.get("subject") ?? ""), p_body: String(form.get("body") ?? ""),
    p_category: String(form.get("category") ?? "general"), p_order: order || null,
  });
  if (error) return { error: error.message };
  redirect(`/support/${data}`);
}

export async function replyTicket(ticketId: string, _: OpsState, form: FormData): Promise<OpsState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_ticket", {
    p_ticket: ticketId, p_body: String(form.get("body") ?? ""), p_internal: form.get("internal") === "on",
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Sent." };
}

export async function updateTicket(ticketId: string, status: string | null, priority: string | null, assignee: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_ticket", { p_ticket: ticketId, p_status: status, p_priority: priority, p_assignee: assignee });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function addFinanceEntry(_: OpsState, form: FormData): Promise<OpsState> {
  const amount = parseNaira(String(form.get("amount") ?? ""));
  if (amount == null || amount <= 0) return { error: "Enter a valid amount." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_finance_entry", {
    p_kind: String(form.get("kind")), p_category: String(form.get("category")), p_amount: amount,
    p_on: String(form.get("on") ?? "") || null, p_note: String(form.get("note") ?? "") || null,
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Added." };
}

export async function settlePartners(): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_settle_partners");
  if (error) return { error: error.message };
  refresh();
  return { count: data as number };
}

export async function setAvailability(available: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_availability", { p_available: available });
  if (error) return { error: error.message };
  refresh();
  return {};
}

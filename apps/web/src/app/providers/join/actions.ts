"use server";

import { redirect } from "next/navigation";
import {
  checkCacDocument, mapBusinessResult, mapIdentityResult, splitName, validateRegistration,
  type KycStatus, type RegisterService, type ProviderKind,
} from "@cleanconnect/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { smileConfigured, verifyBusiness, verifyPerson } from "@/lib/smile";
import { createClient } from "@/lib/supabase/server";
import { KYC_BUCKET } from "@/lib/kyc-documents";

export interface JoinState { errors?: Record<string, string>; error?: string }

export async function registerProvider(_: JoinState, form: FormData): Promise<JoinState> {
  const type = String(form.get("type")) as ProviderKind;
  const service = String(form.get("service")) as RegisterService;
  if (!["business", "individual"].includes(type) || !["cleaning", "laundry"].includes(service)) {
    return { error: "Choose a service and how you're registering." };
  }
  const areas = String(form.get("areas") ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  const input = {
    type, service, areas,
    displayName: String(form.get("displayName") ?? ""),
    cac: String(form.get("cac") ?? ""),
    cacName: String(form.get("cacName") ?? ""),
    nin: String(form.get("nin") ?? ""),
    bvn: String(form.get("bvn") ?? ""),
  };
  const errors = validateRegistration(input);
  const phone = String(form.get("phone") ?? "").trim();
  if (phone && !/^\+?[0-9\s-]{7,15}$/.test(phone)) errors.phone = "Enter a valid phone number.";

  // Businesses must upload their CAC certificate (photo or scan). The file's real type is checked from its bytes.
  let certificate: { bytes: Uint8Array; type: string; ext: string } | null = null;
  if (type === "business") {
    const file = form.get("cacCertificate");
    if (!(file instanceof File) || file.size === 0) {
      errors.cacCertificate = "Upload a photo or scan of your CAC certificate.";
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = checkCacDocument(bytes);
      if (checked.ok) certificate = { bytes, type: checked.image.type, ext: checked.image.ext };
      else errors.cacCertificate = checked.reason;
    }
  }
  if (Object.keys(errors).length) return { errors };

  const supabase = await createClient();

  // Upload under the applicant's own folder first; the database refuses a path that isn't theirs.
  let documentPath: string | null = null;
  if (certificate) {
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (!uid) return { error: "Sign in to continue." };
    documentPath = `cac/${uid}/${crypto.randomUUID()}.${certificate.ext}`;
    const { error: uploadError } = await createAdminClient().storage.from(KYC_BUCKET)
      .upload(documentPath, certificate.bytes, { contentType: certificate.type, upsert: false });
    if (uploadError) return { errors: { cacCertificate: "We couldn't upload your certificate. Please try again." } };
  }

  const { data: providerId, error } = await supabase.rpc("register_provider", {
    p_type: type, p_service: service, p_display_name: input.displayName, p_areas: areas,
    p_plan: form.get("plan") === "vip" ? "vip" : "standard",
    p_cac: type === "business" ? input.cac : null,
    p_nin: type === "individual" ? input.nin : null,
    p_bvn: type === "individual" && service === "laundry" ? input.bvn : null,
    p_cac_name: type === "business" ? input.cacName.trim() : null,
    p_cac_document: documentPath,
  });
  if (error) {
    if (documentPath) await createAdminClient().storage.from(KYC_BUCKET).remove([documentPath]).catch(() => undefined);
    return { error: error.message };
  }
  if (phone) {
    const { data: claims } = await supabase.auth.getClaims();
    const id = claims?.claims?.sub;
    if (id) await supabase.from("users").update({ phone }).eq("id", id);
  }
  await runLiveChecks(providerId as string, type, service, input);
  redirect("/provider");
}

/** In live KYC mode the checks start pending; ask Smile ID and record the verdicts. A failed call stays pending for admin follow-up. */
async function runLiveChecks(
  providerId: string, type: ProviderKind, service: RegisterService,
  input: { displayName: string; cac: string; nin: string; bvn: string },
) {
  if (!smileConfigured()) return;
  const admin = createAdminClient();
  const { data: settings } = await admin.from("money_settings").select("kyc_mode").single();
  if (settings?.kyc_mode !== "live") return;
  const { data: claims } = await (await createClient()).auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const { data: me } = await admin.from("users").select("name").eq("id", userId).single();
  const { first, last } = splitName(me?.name ?? "");

  const record = async (kind: "cac" | "nin" | "bvn", run: () => Promise<KycStatus>) => {
    let status: KycStatus = "pending";
    try { status = await run(); } catch { /* leave pending */ }
    await admin.rpc("record_verification", { p_provider: providerId, p_kind: kind, p_status: status, p_result: { source: "smile_id" } });
  };
  const job = (kind: string) => `${providerId}-${kind}`;
  if (type === "business") {
    // Smile ID's CAC check is not live yet: until SMILE_ID_CAC_AUTO=1 the check stays pending and an admin looks the
    // company up on the CAC register and records the result (admin_set_cac_check).
    if (process.env.SMILE_ID_CAC_AUTO !== "1") return;
    await record("cac", async () => mapBusinessResult(await verifyBusiness({ cac: input.cac, userId, jobId: job("cac") }), input.displayName));
  } else {
    await record("nin", async () => mapIdentityResult(await verifyPerson({ idType: "NIN_V2", idNumber: input.nin, firstName: first, lastName: last, userId, jobId: job("nin") })));
    if (service === "laundry") {
      await record("bvn", async () => mapIdentityResult(await verifyPerson({ idType: "BVN", idNumber: input.bvn, firstName: first, lastName: last, userId, jobId: job("bvn") })));
    }
  }
}

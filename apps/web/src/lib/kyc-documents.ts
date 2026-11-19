import { createAdminClient } from "@/lib/supabase/admin";

/** Private bucket for CAC certificates. Server only: uploaded with the service role, viewed by admins via signed links. */
export const KYC_BUCKET = "kyc-documents";

/** A short-lived link to one certificate, or null if it can't be made. */
export async function signedDocumentUrl(path: string, seconds = 600): Promise<string | null> {
  try {
    const { data } = await createAdminClient().storage.from(KYC_BUCKET).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

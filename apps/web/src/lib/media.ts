import { createAdminClient } from "@/lib/supabase/admin";

export const MEDIA_BUCKET = "job-media";

/** Short-lived URLs for private photos. Returns a map of path -> URL; missing files are skipped. */
export async function signedUrls(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  try {
    const { data } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrls(paths, seconds);
    const out: Record<string, string> = {};
    for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
    return out;
  } catch {
    return {};
  }
}

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server only: never import this from a client component and never expose the key.
 * Used for the private `job-media` bucket after the user's own session has passed the database checks.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Photo storage is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

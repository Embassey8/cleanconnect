// Server only: Smile ID credentials. Never import from a client component.
import { createHmac } from "node:crypto";

const BASE = process.env.SMILE_ID_ENV === "production" ? "https://api.smileidentity.com/v1" : "https://testapi.smileidentity.com/v1";

export const smileConfigured = () => !!process.env.SMILE_ID_PARTNER_ID && !!process.env.SMILE_ID_API_KEY;

function signed() {
  const partner = process.env.SMILE_ID_PARTNER_ID!;
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", process.env.SMILE_ID_API_KEY!).update(timestamp + partner + "sid_request").digest("base64");
  return { partner_id: partner, timestamp, signature, source_sdk: "rest_api", source_sdk_version: "1.0.0" };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...signed(), country: "NG", ...body }), cache: "no-store",
  });
  if (!res.ok) throw new Error(`Smile ID error (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

/** NIN or BVN lookup, matched against the applicant's name. */
export function verifyPerson(args: { idType: "NIN_V2" | "BVN"; idNumber: string; firstName: string; lastName: string; userId: string; jobId: string }) {
  return post("/id_verification", {
    id_type: args.idType, id_number: args.idNumber, first_name: args.firstName, last_name: args.lastName,
    partner_params: { user_id: args.userId, job_id: args.jobId, job_type: 5 },
  });
}

/** CAC lookup (registered company). */
export function verifyBusiness(args: { cac: string; userId: string; jobId: string }) {
  return post("/business_verification", {
    id_type: "BUSINESS_REGISTRATION", business_type: "co", id_number: args.cac,
    partner_params: { user_id: args.userId, job_id: args.jobId, job_type: 5 },
  });
}

import { createAdminClient } from "@/lib/supabase/admin";
import { koboToNaira, validSignature } from "@/lib/paystack";

interface PaystackEvent {
  event: string;
  data: { reference?: string; amount?: number; transfer_code?: string; reason?: string; status?: string };
}

/**
 * Paystack calls this for every charge and transfer. The signature is checked on the raw body, then the
 * database functions credit or settle idempotently, so retried deliveries are harmless.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-paystack-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const { event, data } = JSON.parse(raw) as PaystackEvent;
  const ref = data.reference;
  if (!ref) return new Response("ok");
  const admin = createAdminClient();

  if (event === "charge.success" && ref.startsWith("cc_")) {
    const { error } = await admin.rpc("credit_payment", { p_reference: ref, p_amount: koboToNaira(data.amount ?? 0) });
    if (error) return new Response(error.message, { status: 500 }); // Paystack retries
  } else if (event === "charge.failed" && ref.startsWith("cc_")) {
    await admin.rpc("fail_payment", { p_reference: ref });
  } else if (event === "transfer.success") {
    const { error } = await admin.rpc("settle_payout", { p_payout: ref, p_status: "paid", p_transfer_code: data.transfer_code ?? null });
    if (error) return new Response(error.message, { status: 500 });
  } else if (event === "transfer.failed" || event === "transfer.reversed") {
    const { error } = await admin.rpc("settle_payout", {
      p_payout: ref, p_status: "failed", p_transfer_code: data.transfer_code ?? null, p_reason: data.reason ?? event,
    });
    if (error) return new Response(error.message, { status: 500 });
  }
  return new Response("ok");
}

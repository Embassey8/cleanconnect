import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { koboToNaira, verifyCharge } from "@/lib/paystack";

/**
 * Where Paystack sends the customer after paying. We verify the charge with Paystack ourselves (the webhook may
 * arrive later) and credit through the same idempotent function the webhook uses.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  const back = (result: string) => NextResponse.redirect(new URL(`/account/wallet?payment=${result}`, request.url));
  if (!reference?.startsWith("cc_")) return back("failed");

  // Only the customer who started the payment may trigger the check.
  const supabase = await createClient();
  const { data: own } = await supabase.from("payment_intents").select("reference").eq("reference", reference).maybeSingle();
  if (!own) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const charge = await verifyCharge(reference);
    if (charge.status === "success") {
      await createAdminClient().rpc("credit_payment", { p_reference: reference, p_amount: koboToNaira(charge.amount) });
      return back("success");
    }
    if (charge.status === "failed" || charge.status === "abandoned") {
      await createAdminClient().rpc("fail_payment", { p_reference: reference });
      return back("failed");
    }
    return back("pending");
  } catch {
    return back("pending");
  }
}

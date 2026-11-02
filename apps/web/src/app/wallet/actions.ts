"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkFunding, checkWithdrawal, parseNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { friendlyMoneyError } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRecipient, initializeCharge, initiateTransfer, listBanks, paystackConfigured, resolveAccount, siteUrl,
} from "@/lib/paystack";

export interface MoneyState { error?: string; ok?: string }

function refresh() {
  revalidatePath("/account", "layout");
  revalidatePath("/provider", "layout");
  revalidatePath("/admin", "layout");
}

async function isLive(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("money_settings").select("payments_mode").single();
  return data?.payments_mode === "live";
}

/** Live: send the customer to Paystack; the webhook and return link credit the wallet. Mock: credit instantly. */
export async function fundWallet(_: MoneyState, form: FormData): Promise<MoneyState> {
  const user = await getSessionUser();
  if (user?.role === "provider" || user?.role === "partner") return { error: "Providers can't add money to their wallet." };
  const amount = parseNaira(String(form.get("amount") ?? ""));
  if (amount == null) return { error: "Enter a valid amount." };
  const check = checkFunding(amount);
  if (!check.ok) return { error: check.reason };
  const supabase = await createClient();
  if (await isLive(supabase)) {
    if (!paystackConfigured()) return { error: "Payments are not set up yet. Please try again later." };
    const { data: ref, error: refError } = await supabase.rpc("create_payment_intent", { p_amount: amount });
    if (refError) return { error: refError.message };
    const { data: auth } = await supabase.auth.getUser();
    let url: string;
    try {
      const charge = await initializeCharge({
        email: auth.user?.email ?? `${user!.id}@users.cleanconnect.invalid`,
        naira: amount, reference: ref as string, callbackUrl: `${siteUrl()}/api/paystack/callback`,
      });
      url = charge.authorization_url;
    } catch (e) {
      await createAdminClient().rpc("fail_payment", { p_reference: ref as string });
      return { error: e instanceof Error ? e.message : "Could not start the payment." };
    }
    redirect(url);
  }
  const { error } = await supabase.rpc("mock_fund_wallet", { p_amount: amount });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Wallet topped up (test mode: no real money moved)." };
}

export async function payOrder(orderId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_order", { p_order: orderId });
  if (error) return { error: friendlyMoneyError(error.message) };
  refresh();
  return {};
}

export async function withdraw(_: MoneyState, form: FormData): Promise<MoneyState> {
  const amount = parseNaira(String(form.get("amount") ?? ""));
  if (amount == null) return { error: "Enter a valid amount." };
  const supabase = await createClient();
  const { data: bal } = await supabase.from("wallet_balances").select("available");
  const available = (bal ?? []).reduce((sum, r) => sum + (r.available as number), 0);
  const check = checkWithdrawal(amount, available);
  if (!check.ok) return { error: check.reason };
  const live = await isLive(supabase);
  let bank = String(form.get("bank") ?? "");
  let accountName = String(form.get("accountName") ?? "");
  const accountNumber = String(form.get("accountNumber") ?? "").replace(/\s/g, "");
  let bankCode = "";
  if (live) {
    if (!paystackConfigured()) return { error: "Payouts are not set up yet. Please try again later." };
    if (!/^[0-9]{10}$/.test(accountNumber)) return { error: "Account number must be 10 digits." };
    bankCode = bank;
    try {
      const [banks, resolved] = await Promise.all([listBanks(), resolveAccount(accountNumber, bankCode)]);
      bank = banks.find((b) => b.code === bankCode)?.name ?? "";
      accountName = resolved.account_name;
    } catch {
      return { error: "We couldn't verify that bank account. Check the bank and account number." };
    }
  }
  const { data: payoutId, error } = await supabase.rpc("request_withdrawal", {
    p_amount: amount, p_bank: bank, p_account_name: accountName, p_account_number: accountNumber,
  });
  if (error) return { error: friendlyMoneyError(error.message) };
  if (live) {
    // The money is already off the wallet; if Paystack refuses the transfer, give it back.
    const admin = createAdminClient();
    try {
      const recipient = await createRecipient({ name: accountName, accountNumber, bankCode });
      const t = await initiateTransfer({ naira: amount, recipient: recipient.recipient_code, reference: payoutId as string, reason: "CleanConnect withdrawal" });
      await admin.from("payouts").update({ transfer_code: t.transfer_code }).eq("id", payoutId as string);
    } catch (e) {
      await admin.rpc("settle_payout", { p_payout: payoutId as string, p_status: "failed", p_reason: e instanceof Error ? e.message : "transfer failed" });
      refresh();
      return { error: "The bank transfer could not be started, so your money is back in your wallet. Please try again." };
    }
  }
  refresh();
  return { ok: "Withdrawal requested. We'll pay it to your bank account." };
}

export async function subscribeVip(providerId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("subscribe_vip", { p_provider: providerId });
  if (error) return { error: friendlyMoneyError(error.message) };
  refresh();
  return {};
}

export async function cancelVip(providerId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_vip", { p_provider: providerId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function markPayout(payoutId: string, status: "paid" | "failed"): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_payout", { p_payout: payoutId, p_status: status });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function resolveDispute(orderId: string, outcome: "release" | "refund"): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute", { p_order: orderId, p_outcome: outcome });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function runJobs(): Promise<{ error?: string; summary?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_run_jobs");
  if (error) return { error: error.message };
  const r = data as { expired: number; auto_confirmed: number; vip_renewed: number };
  refresh();
  return { summary: `Expired ${r.expired} request(s), auto-confirmed ${r.auto_confirmed} order(s), renewed ${r.vip_renewed} VIP plan(s).` };
}

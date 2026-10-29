"use server";

import { revalidatePath } from "next/cache";
import { checkFunding, checkWithdrawal, parseNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { friendlyMoneyError } from "@/lib/money";

export interface MoneyState { error?: string; ok?: string }

function refresh() {
  revalidatePath("/account", "layout");
  revalidatePath("/provider", "layout");
  revalidatePath("/admin", "layout");
}

/** Mock payment provider: credits the wallet instantly. Swap for a Paystack/Flutterwave checkout later. */
export async function fundWallet(_: MoneyState, form: FormData): Promise<MoneyState> {
  const amount = parseNaira(String(form.get("amount") ?? ""));
  if (amount == null) return { error: "Enter a valid amount." };
  const check = checkFunding(amount);
  if (!check.ok) return { error: check.reason };
  const supabase = await createClient();
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
  const { error } = await supabase.rpc("request_withdrawal", {
    p_amount: amount,
    p_bank: String(form.get("bank") ?? ""),
    p_account_name: String(form.get("accountName") ?? ""),
    p_account_number: String(form.get("accountNumber") ?? "").replace(/\s/g, ""),
  });
  if (error) return { error: friendlyMoneyError(error.message) };
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

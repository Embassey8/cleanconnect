"use server";

import { friendlyMoneyError } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lagosToIso } from "@/lib/time";

export interface MsgState { error?: string }

export async function sendMessage(threadId: string, _: MsgState, form: FormData): Promise<MsgState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_message", { p_thread: threadId, p_body: String(form.get("body") ?? "") });
  if (error) return { error: error.message };
  revalidatePath(`/messages/${threadId}`);
  return {};
}

export async function sendQuote(threadId: string, _: MsgState, form: FormData): Promise<MsgState> {
  const amount = Math.round(Number(String(form.get("amount") ?? "").replace(/[,\s₦]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a quote amount in naira." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_quote", {
    p_thread: threadId, p_amount: amount, p_description: String(form.get("description") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath(`/messages/${threadId}`);
  return {};
}

export async function acceptQuote(messageId: number, _: MsgState, form: FormData): Promise<MsgState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_quote", {
    p_message: messageId, p_address: String(form.get("address") ?? ""),
    p_area: String(form.get("area") ?? "") || null, p_scheduled: lagosToIso(String(form.get("when") ?? "")),
  });
  if (error) return { error: friendlyMoneyError(error.message) };
  redirect(`/account/orders/${data}`);
}

export async function declineQuote(messageId: number, threadId: string) {
  const supabase = await createClient();
  await supabase.rpc("decline_quote", { p_message: messageId });
  revalidatePath(`/messages/${threadId}`);
}

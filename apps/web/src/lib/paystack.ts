// Server only: reads the secret key. Never import from a client component.
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

export const paystackConfigured = () => !!process.env.PAYSTACK_SECRET_KEY;

/** Public site URL used for Paystack's return link. */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const nairaToKobo = (naira: number) => naira * 100;
export const koboToNaira = (kobo: number) => Math.round(kobo / 100);

interface Envelope<T> { status: boolean; message: string; data: T }

async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Payments are not configured (PAYSTACK_SECRET_KEY).");
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.status) throw new Error(json?.message ?? `Paystack error (${res.status})`);
  return json.data;
}

export interface InitializedCharge { authorization_url: string; reference: string }

export function initializeCharge(args: { email: string; naira: number; reference: string; callbackUrl: string }) {
  return call<InitializedCharge>("/transaction/initialize", {
    method: "POST",
    body: {
      email: args.email,
      amount: nairaToKobo(args.naira),
      currency: "NGN",
      reference: args.reference,
      callback_url: args.callbackUrl,
      channels: ["card", "bank", "ussd", "bank_transfer"],
    },
  });
}

export interface VerifiedCharge { status: string; amount: number; reference: string }

export const verifyCharge = (reference: string) =>
  call<VerifiedCharge>(`/transaction/verify/${encodeURIComponent(reference)}`);

export interface Bank { name: string; code: string }

export const listBanks = () => call<Bank[]>("/bank?country=nigeria&currency=NGN&perPage=200");

export const resolveAccount = (accountNumber: string, bankCode: string) =>
  call<{ account_name: string }>(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);

export const createRecipient = (args: { name: string; accountNumber: string; bankCode: string }) =>
  call<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: { type: "nuban", name: args.name, account_number: args.accountNumber, bank_code: args.bankCode, currency: "NGN" },
  });

export const initiateTransfer = (args: { naira: number; recipient: string; reference: string; reason: string }) =>
  call<{ transfer_code: string; status: string }>("/transfer", {
    method: "POST",
    body: { source: "balance", amount: nairaToKobo(args.naira), recipient: args.recipient, reference: args.reference, reason: args.reason },
  });

/** Paystack signs the raw body with the secret key (HMAC SHA-512) in `x-paystack-signature`. */
export function validSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

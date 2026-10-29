// LOCAL DEVELOPMENT ONLY. Drives a full cleaning order through the real local Supabase stack as the demo
// users: book, pay, accept, work, confirm, review, reply, withdraw. Run after seed-demo.mjs.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anon || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("Needs the local env (apps/web/.env.local).");
const password = process.env.DEMO_PASSWORD ?? "Demo-Pass-1234";

async function as(email) {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}
const ok = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const check = (cond, what) => { if (!cond) throw new Error(`FAILED: ${what}`); console.log(`  ok  ${what}`); };
const balance = async (c) => ok(await c.from("wallet_balances").select("available, held").limit(1).single(), "balance");

const customer = await as("customer@demo.test");
const provider = await as("cleaning@demo.test");
const admin = await as("admin@demo.test");

const { data: prov } = await customer.from("providers").select("id").eq("slug", "shine-cleaners").single();
const start = await balance(customer);

console.log("Booking and paying");
const orderId = ok(await customer.rpc("create_cleaning_order", {
  p_provider: prov.id, p_property: "home", p_ctype: "deep", p_frequency: "week",
  p_areas: [{ area: "bed", qty: 3 }, { area: "sit", qty: 1 }, { area: "kit", qty: 1 }, { area: "bath", qty: 2 }],
  p_extras: ["fridge"], p_address: "5 Test Road", p_area: "Lekki", p_scheduled: null,
}), "create order");
const order = ok(await customer.from("orders").select("total, status").eq("id", orderId).single(), "order");
check(order.total === 51660, "server priced the order at ₦51,660 (matches the shared calculator)");
ok(await customer.rpc("pay_order", { p_order: orderId }), "pay");
const held = await balance(customer);
check(held.available === start.available - 51660 && held.held >= 51660, "wallet debited and escrow held");

console.log("Provider works the job");
const addrBefore = ok(await provider.from("order_addresses").select("address").eq("order_id", orderId), "address");
check(addrBefore.length === 0, "address hidden from the provider before accepting");
for (const s of ["accepted", "in_progress", "awaiting_confirmation"]) ok(await provider.rpc("advance_order", { p_order: orderId, p_status: s }), `provider -> ${s}`);
const addrAfter = ok(await provider.from("order_addresses").select("address").eq("order_id", orderId), "address");
check(addrAfter.length === 1, "address revealed after accepting");

console.log("Customer confirms, review, reply");
ok(await customer.rpc("advance_order", { p_order: orderId, p_status: "completed" }), "complete");
const done = ok(await customer.from("orders").select("escrow_status, commission_amount").eq("id", orderId).single(), "settled order");
check(done.escrow_status === "released" && done.commission_amount === 7749, "escrow released with 15% commission (₦7,749)");
const reviewId = ok(await customer.rpc("create_review", { p_order: orderId, p_rating: 5, p_quality: 5, p_punctuality: 4, p_communication: 5, p_value: 4, p_body: "Spotless!" }), "review");
ok(await provider.rpc("reply_review", { p_review: reviewId, p_reply: "Thank you!" }), "reply");
const stats = ok(await customer.from("provider_stats").select("rating_count, rating_avg").eq("provider_id", prov.id).single(), "stats");
check(stats.rating_count >= 1, "public rating stats updated");

console.log("Provider withdraws, admin settles");
const pb = await balance(provider);
check(pb.available >= 43911, "provider earned ₦43,911 net of commission");
const payoutId = ok(await provider.rpc("request_withdrawal", { p_amount: 5000, p_bank: "Test Bank", p_account_name: "Shine Cleaners", p_account_number: "0123456789" }), "withdraw");
ok(await admin.rpc("mark_payout", { p_payout: payoutId, p_status: "paid" }), "mark paid");
const finance = ok(await admin.rpc("admin_finance", { p_month: new Date().toISOString().slice(0, 10) }), "finance");
check(finance.marketplace_commission >= 7749, "admin income shows the commission");

console.log("\nAll checks passed against the local stack.");

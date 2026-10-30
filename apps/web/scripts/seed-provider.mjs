// LOCAL DEVELOPMENT ONLY. Gives the demo cleaning provider a new paid request, an accepted job and a quote
// request so every Overview tab has something to show. Run after seed-demo.mjs.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anon || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("Needs the local env (apps/web/.env.local).");
const password = process.env.DEMO_PASSWORD ?? "Demo-Pass-1234";
const as = async (email) => {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
};
const ok = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data; };

const customer = await as("customer@demo.test");
const cleaner = await as("cleaning@demo.test");
const prov = ok(await customer.from("providers").select("id").eq("slug", "shine-cleaners").single(), "provider").id;
ok(await customer.rpc("mock_fund_wallet", { p_amount: 80000 }), "top up");
const when = (days) => new Date(Date.now() + days * 86400000).toISOString();
const book = async (ctype, areas, extras, days) => {
  const id = ok(await customer.rpc("create_cleaning_order", {
    p_provider: prov, p_property: "home", p_ctype: ctype, p_frequency: "once", p_areas: areas, p_extras: extras,
    p_address: "22 Admiralty Way", p_area: "Lekki Phase 1", p_scheduled: when(days),
  }), "order");
  ok(await customer.rpc("pay_order", { p_order: id }), "pay");
  return id;
};
await book("deep", [{ area: "bed", qty: 3 }, { area: "bath", qty: 2 }, { area: "kit", qty: 1 }], ["fridge"], 2);
await book("regular", [{ area: "bed", qty: 2 }], [], 5);
const accepted = await book("regular", [{ area: "sit", qty: 1 }, { area: "bath", qty: 1 }], [], 1);
ok(await cleaner.rpc("advance_order", { p_order: accepted, p_status: "accepted" }), "accept");

// A customer asking for a quote in chat (no quote sent yet)
const t = ok(await customer.rpc("start_thread", { p_provider: prov }), "thread");
ok(await customer.rpc("send_message", { p_thread: t, p_body: "Can you quote for cleaning a 4-bedroom duplex after renovation?" }), "message");
console.log("Provider has new requests, an accepted job and a quote request.");

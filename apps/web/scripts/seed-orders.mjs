// LOCAL DEVELOPMENT ONLY. Adds an in-progress cleaning order and a mid-way laundry order for the demo
// customer so the account page has ongoing orders to show. Run after seed-demo.mjs.
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
const laundry = await as("laundry@demo.test");
const id = async (slug) => ok(await customer.from("providers").select("id").eq("slug", slug).single(), slug).id;

const clean = ok(await customer.rpc("create_cleaning_order", {
  p_provider: await id("shine-cleaners"), p_property: "home", p_ctype: "regular", p_frequency: "once",
  p_areas: [{ area: "bed", qty: 2 }, { area: "bath", qty: 1 }], p_extras: [], p_address: "12 Demo Street", p_area: "Lekki",
  p_scheduled: new Date(Date.now() + 86400000).toISOString(),
}), "cleaning order");
ok(await customer.rpc("pay_order", { p_order: clean }), "pay cleaning");
for (const s of ["accepted", "in_progress"]) ok(await cleaner.rpc("advance_order", { p_order: clean, p_status: s }), s);

const wash = ok(await customer.rpc("create_laundry_order", {
  p_provider: await id("sparkle-laundry"),
  p_lines: [{ item: "shirt", service: "dry", qty: 4 }, { item: "suit", service: "dry", qty: 2 }],
  p_express: false, p_address: "12 Demo Street", p_area: "Lekki", p_scheduled: null,
}), "laundry order");
ok(await customer.rpc("pay_order", { p_order: wash }), "pay laundry");
for (const s of ["accepted", "pickup_scheduled", "received", "cleaning"]) ok(await laundry.rpc("advance_order", { p_order: wash, p_status: s }), s);

// A third order the customer cancelled
const spare = ok(await customer.rpc("create_cleaning_order", {
  p_provider: await id("shine-cleaners"), p_property: "home", p_ctype: "regular", p_frequency: "once",
  p_areas: [{ area: "bath", qty: 1 }], p_extras: [], p_address: "12 Demo Street", p_area: "Lekki", p_scheduled: null,
}), "spare order");
ok(await customer.rpc("advance_order", { p_order: spare, p_status: "cancelled" }), "cancel");
console.log("Added: cleaning in progress, laundry being cleaned, one cancelled order.");

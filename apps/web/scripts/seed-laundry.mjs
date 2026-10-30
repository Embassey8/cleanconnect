// LOCAL DEVELOPMENT ONLY. Fills the demo laundry shop's orders board: one order at each stage, including one
// received and waiting for item intake. Run after seed-demo.mjs.
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
const shop = await as("laundry@demo.test");
const prov = ok(await customer.from("providers").select("id").eq("slug", "sparkle-laundry").single(), "shop").id;
ok(await customer.rpc("mock_fund_wallet", { p_amount: 150000 }), "top up");
const at = (hours) => new Date(Date.now() + hours * 3600000).toISOString();

const book = async (lines, express, hours, area) => {
  const id = ok(await customer.rpc("create_laundry_order", { p_provider: prov, p_lines: lines, p_express: express, p_address: "9 Seed Avenue", p_area: area, p_scheduled: at(hours) }), "order");
  ok(await customer.rpc("pay_order", { p_order: id }), "pay");
  return id;
};
const go = async (id, ...steps) => { for (const s of steps) ok(await shop.rpc("advance_order", { p_order: id, p_status: s }), s); };

const three = [{ item: "shirt", service: "dry", qty: 3 }, { item: "native", service: "dry", qty: 2 }, { item: "trousers", service: "iron", qty: 4 }];
await book([{ item: "shirt", service: "dry", qty: 8 }], false, 3, "Lekki");                       // new request
await book([{ item: "suit", service: "dry", qty: 2 }, { item: "shirt", service: "dry", qty: 2 }], true, 5, "Yaba"); // new express request
const p1 = await book([{ item: "shirt", service: "iron", qty: 12 }], false, 4, "Yaba"); await go(p1, "accepted", "pickup_scheduled");
const rec = await book(three, true, -1, "Lekki"); await go(rec, "accepted", "pickup_scheduled", "received"); // waits for intake
const c1 = await book([{ item: "towel", service: "wash", qty: 7 }], false, -3, "Ikoyi"); await go(c1, "accepted", "pickup_scheduled", "received");
ok(await shop.rpc("submit_intake", { p_order: c1, p_counts: {} }), "intake");               // same counts -> cleaning
const c2 = await book([{ item: "shirt", service: "iron", qty: 15 }], false, -4, "VI"); await go(c2, "accepted", "pickup_scheduled", "received");
ok(await shop.rpc("submit_intake", { p_order: c2, p_counts: {} }), "intake"); await go(c2, "ironing");
const r1 = await book([{ item: "native", service: "dry", qty: 3 }], false, -6, "Yaba"); await go(r1, "accepted", "pickup_scheduled", "received");
ok(await shop.rpc("submit_intake", { p_order: r1, p_counts: {} }), "intake"); await go(r1, "ready");
console.log("Laundry board filled: new, pickup, received (needs intake), cleaning, ironing, ready.");

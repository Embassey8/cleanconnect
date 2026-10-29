// LOCAL DEVELOPMENT ONLY. Creates a demo conversation (with a quote) between the demo customer and the
// cleaning provider, and a second one with the laundry shop. Run after seed-demo.mjs.
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
const prov = async (slug) => ok(await customer.from("providers").select("id").eq("slug", slug).single(), slug).id;

const t1 = ok(await customer.rpc("start_thread", { p_provider: await prov("shine-cleaners") }), "thread 1");
ok(await customer.rpc("send_message", { p_thread: t1, p_body: "Hi, I need a deep clean for a 3-bedroom flat. Are you available this weekend?" }), "m1");
ok(await cleaner.rpc("send_message", { p_thread: t1, p_body: "Hello! Yes, we can come on Saturday morning. A team of 3, about 5 hours, supplies included." }), "m2");
ok(await cleaner.rpc("send_quote", { p_thread: t1, p_amount: 45000, p_description: "Deep cleaning · 3-bedroom · Sat 9:00 am · supplies included" }), "quote");

const t2 = ok(await customer.rpc("start_thread", { p_provider: await prov("sparkle-laundry") }), "thread 2");
ok(await customer.rpc("send_message", { p_thread: t2, p_body: "Do you do same-day ironing for 12 shirts?" }), "m3");
ok(await laundry.rpc("send_message", { p_thread: t2, p_body: "Yes, drop them before noon and they'll be ready by 6 pm." }), "m4");
console.log("Demo conversations ready.");

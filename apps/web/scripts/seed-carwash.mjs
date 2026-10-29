// LOCAL DEVELOPMENT ONLY. Gives the demo car wash partner a job offer and an active job for today, using the
// real flow (customer requests, admin offers, partner accepts). Run after seed-demo.mjs.
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
const admin = await as("admin@demo.test");
const partner = await as("partner@demo.test");
const partnerId = ok(await partner.from("providers").select("id").eq("service", "carwash").single(), "partner").id;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

// An active job scheduled today: request -> offer -> accept -> on the way
const wash = ok(await customer.rpc("create_carwash_request", {
  p_package: "full", p_vehicle: "saloon", p_mobile: true, p_address: "14 Marina Road", p_area: "Lekki Phase 1",
  p_scheduled: new Date(`${today}T14:00:00+01:00`).toISOString(), p_notes: "Black Toyota Camry · gate code 4821",
}), "request");
ok(await admin.rpc("assign_carwash", { p_order: wash, p_partner: partnerId }), "assign");
ok(await partner.rpc("respond_carwash_offer", { p_order: wash, p_accept: true }), "accept");
ok(await partner.rpc("advance_order", { p_order: wash, p_status: "en_route" }), "en route");

// An open offer for any other waiting request
const { data: waiting } = await admin.from("orders").select("id").eq("service", "carwash").eq("status", "requested").limit(1);
if (waiting?.[0]) ok(await admin.rpc("assign_carwash", { p_order: waiting[0].id, p_partner: partnerId }), "offer");
console.log("Partner has an active job today" + (waiting?.[0] ? " and an open offer." : "."));

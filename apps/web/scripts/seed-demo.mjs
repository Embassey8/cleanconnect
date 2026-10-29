// LOCAL DEVELOPMENT ONLY. Creates demo accounts, approved providers, prices and a funded wallet in a
// local Supabase so every screen can be clicked through. Safe to re-run. Never run against production.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (see apps/web/.env.local).");
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Refusing to seed a non-local Supabase.");
const password = process.env.DEMO_PASSWORD ?? "Demo-Pass-1234";

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const ACCOUNTS = [
  { email: "admin@demo.test", name: "Demo Admin", role: "admin" },
  { email: "customer@demo.test", name: "Demo Customer", role: "customer" },
  { email: "laundry@demo.test", name: "Sparkle Laundry", role: "provider" },
  { email: "cleaning@demo.test", name: "Shine Cleaners", role: "provider" },
  { email: "partner@demo.test", name: "Speedy Wash", role: "partner" },
];

const ids = {};
const existing = must(await db.auth.admin.listUsers({ perPage: 200 }), "list users").users;
for (const a of ACCOUNTS) {
  let u = existing.find((x) => x.email === a.email);
  if (!u) u = must(await db.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { name: a.name } }), `create ${a.email}`).user;
  ids[a.email] = u.id;
  must(await db.from("users").update({ role: a.role, name: a.name }).eq("id", u.id), `role ${a.email}`);
}

async function provider(email, row) {
  const found = must(await db.from("providers").select("id").eq("slug", row.slug).maybeSingle(), "find provider");
  if (found) return found.id;
  return must(await db.from("providers").insert({ owner_id: ids[email], status: "approved", approved_at: new Date().toISOString(), ...row }).select("id").single(), `provider ${row.slug}`).id;
}

const laundryId = await provider("laundry@demo.test", { type: "business", service: "laundry", slug: "sparkle-laundry", display_name: "Sparkle Laundry", areas: ["Lekki", "Yaba"] });
const cleaningId = await provider("cleaning@demo.test", { type: "business", service: "cleaning", slug: "shine-cleaners", display_name: "Shine Cleaners", areas: ["Lekki", "Ikeja"] });
const partnerId = await provider("partner@demo.test", { type: "business", service: "carwash", slug: "cw-speedy-wash", display_name: "Speedy Wash", areas: ["Lekki"] });
must(await db.from("partner_scores").upsert({ provider_id: partnerId }), "partner score");

// Laundry prices (naira) and settings
must(await db.from("laundry_prices").delete().eq("provider_id", laundryId), "clear laundry prices");
const L = { shirt: [1500, 1200, 400], trousers: [1800, 1500, 450], native: [3500, 3000, 800], suit: [4500, 3800, 1000], towel: [1000, 800, 300] };
const laundryRows = Object.entries(L).flatMap(([item, [dry, wash, iron]]) => [
  { provider_id: laundryId, item_id: item, service: "dry", price: dry },
  { provider_id: laundryId, item_id: item, service: "wash", price: wash },
  { provider_id: laundryId, item_id: item, service: "iron", price: iron },
]);
must(await db.from("laundry_prices").insert(laundryRows), "laundry prices");
must(await db.from("laundry_settings").upsert({ provider_id: laundryId }), "laundry settings");

// Cleaning prices and settings
must(await db.from("cleaning_prices").delete().eq("provider_id", cleaningId), "clear cleaning prices");
const C = { bed: 5000, sit: 6000, kit: 6000, bath: 3500, din: 4000, bal: 2500, stair: 3000 };
must(await db.from("cleaning_prices").insert(Object.entries(C).map(([area, price]) => ({ provider_id: cleaningId, property_type: "home", area_id: area, price, offered: true }))), "cleaning prices");
must(await db.from("cleaning_settings").upsert({ provider_id: cleaningId }), "cleaning settings");

// Fund the customer's wallet once
const wallet = must(await db.from("wallets").select("id").eq("user_id", ids["customer@demo.test"]).single(), "wallet");
const funded = must(await db.from("ledger_entries").select("id").eq("reference", "demo-seed-funding").maybeSingle(), "funding check");
if (!funded) {
  must(await db.from("ledger_entries").insert({ wallet_id: wallet.id, group_id: crypto.randomUUID(), bucket: "available", amount: 100000, kind: "fund", reference: "demo-seed-funding" }), "fund wallet");
}

console.log("Demo data ready. Accounts (password in apps/web/scripts/seed-demo.mjs):");
for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(9)} ${a.email}`);

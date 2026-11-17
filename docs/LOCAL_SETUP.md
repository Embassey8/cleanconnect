# Running CleanConnect locally

Local only. Nothing here touches a hosted Supabase project.

## Quick start: test environment
With Docker running:
```bash
pnpm test-env          # starts Supabase in Docker, writes apps/web/.env.local, seeds the test accounts
pnpm dev               # http://localhost:3000
pnpm test-env reset    # wipe and re-seed      |  pnpm test-env stop
```
| Role | Email | Password |
|---|---|---|
| Test user (customer, wallet ₦100,000) | `testuser@cleanconnect.test` | `Demo-Pass-1234` |
| Test service (approved cleaning provider) | `testservice@cleanconnect.test` | `Demo-Pass-1234` |
| Test admin | `testadmin@cleanconnect.test` | `Demo-Pass-1234` |

The longer manual steps below do the same thing.

## Start
1. Open Docker Desktop and wait until it says it is running.
2. From the repo root:
   ```bash
   npx supabase@latest start      # first run downloads images; applies supabase/migrations and seed.sql
   ```
3. Copy the printed `API URL`, `anon key` and `service_role key` into `apps/web/.env.local`
   (see `apps/web/.env.example`). Never commit that file.
4. Load demo accounts, providers, prices and a funded wallet:
   ```bash
   cd apps/web && node --env-file=.env.local scripts/seed-demo.mjs
   ```
5. Run the app: `pnpm --filter web dev`, then open http://localhost:3000.

Reset everything: `npx supabase@latest db reset`, then repeat step 4. Stop: `npx supabase@latest stop`.

## Demo accounts
`admin@demo.test`, `customer@demo.test`, `laundry@demo.test`, `cleaning@demo.test`, `partner@demo.test`.
The shared password is set at the top of `apps/web/scripts/seed-demo.mjs` (local use only).

## Click-through
1. **Customer** → `/marketplace` → Shine Cleaners → price a clean → Book. On the order page choose **Pay from wallet**.
2. **Cleaning provider** → `/provider/orders` → Accept → Start job → Mark finished. Take a photo (needs a camera; allowed on localhost).
3. **Customer** → order page → Confirm completion → leave a review, tick "Show on the provider's profile" on a photo.
4. **Provider** → reply to the review; `/provider/wallet` shows earnings after 15% commission; withdraw some money.
5. **Admin** → `/admin/payouts` to mark the withdrawal paid; `/admin/income` for profit.
6. **Car wash**: customer → `/car-wash` → request. Admin → `/admin/requests` → Offer job to Speedy Wash.
   Partner → `/partner` → Accept job → step through to sign-off. Customer signs off. Admin → `/admin/income` → Pay partners now.
7. **Support**: any user → `/support` → raise a ticket; admin → `/admin/support` to reply.
8. **VIP**: provider → `/provider/vip` (fund the provider's wallet first via `/provider/wallet`).

## Automated check against the local stack
```bash
cd apps/web && node --env-file=.env.local scripts/e2e-local.mjs
```
Books, pays, completes, reviews and pays out an order as the demo users through the real local auth, REST and
database. Re-runnable.

## Notes
- The in-app camera needs a camera and a secure context; `http://localhost` counts. Photos are stored in the
  private `job-media` bucket and shown through short-lived signed URLs.
- Local email lands in Mailpit at http://127.0.0.1:54324 (no real email is sent).

## Test accounts on a hosted Supabase project
`supabase/test/seed_test_accounts.sql` creates the same three test accounts (and funds the test user) in a hosted
project; run it in the SQL editor. `supabase/test/cleanup_test_accounts.sql` removes them again.
Point `apps/web/.env.local` at the project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(Project Settings, API) and `SUPABASE_SERVICE_ROLE_KEY`.

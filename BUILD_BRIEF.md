# CleanConnect — Build Brief

A two-sided marketplace in Nigeria where customers book **house & commercial cleaning**, **laundry** (dry clean, wash & fold, iron only) and **car wash**, and where cleaners and laundry shops offer their services.

> "CleanConnect" is a working name. Everything in `[square brackets]` in the designs is a placeholder. Numbers in the admin dashboard and sample prices are made up so the screens and calculators work — real values come from the database.

---

## 1. How to use the design files

`design/desktop/` and `design/mobile/` hold one file per screen (`*.dc.html`). Treat them as the **visual and behavioural spec**: match layout, copy, colours and interactions.

How to read a `.dc.html` file:

- It is ordinary HTML with **inline styles** — every colour, size, radius and spacing value is written on the element.
- `{{name}}` is a value computed in the `<script type="text/x-dc">` block at the bottom (`renderVals()` returns it).
- `<sc-for list="{{items}}" as="x">` = a loop; `<sc-if value="{{flag}}">` = a conditional.
- `onClick="{{handler}}"` / `onChange="{{handler}}"` = event handlers defined in the same script.
- `<a href="OtherScreen.dc.html">` = navigation between screens.
- `./support.js` is the design tool's runtime. It is **not included and not needed** — don't try to load it.
- The scripts contain the **real pricing logic** (laundry calculator, cleaning calculator, laundry intake, provider price editors). Port that logic to shared, unit-tested functions (see §6).
- `design/canvas.json` lists every screen with its title and size (desktop pages 1440 wide and fluid; mobile screens 390 wide).

---

## 2. Users and roles

| Role | Who | Notes |
|---|---|---|
| **Customer** | Anyone booking services | Has a wallet. Can message providers, book, track, rate. |
| **Provider – business/shop** | Registered company | Verified with **CAC** (certificate + RC/BN number). Can have **team members** (staff). |
| **Provider – individual** | Self-employed cleaner / launderer | Cleaning: verified with **NIN**. Laundry: **BVN + NIN**. Selfie face-match against NIN. |
| **Car wash partner** | Hand-picked car wash business | CAC + site inspection. **Does not set prices**; receives jobs assigned by CleanConnect at a fixed payout. Not listed in the marketplace. |
| **Admin** | CleanConnect staff | Roles suggested: super admin, operations (assign car washes, approve providers), support agent, finance. |

A provider is not visible to customers until an admin **approves** their verification.

### Plans

- **Standard** — free, platform takes a commission per job (placeholder **15%**).
- **VIP** — monthly fee `[₦ price]`: top placement in search, homepage feature, promoted to high-value customers on the website and **by email**, gold VIP badge, priority support, faster payouts. VIP providers see performance stats (profile views, search appearances, email reach, bookings from VIP).

---

## 3. Services and how they're booked

| Service | Model | Who sets price |
|---|---|---|
| **House & commercial cleaning** (homes, offices, schools, shops) | Marketplace — customer picks a provider | Provider |
| **Laundry** (dry clean, wash & fold, iron only) | Marketplace — customer picks a provider | Provider |
| **Car wash** (exterior, full wash, detailing) | **Managed** — customer requests, CleanConnect assigns a partner | CleanConnect (admin) |

---

## 4. Screen map

Desktop and mobile versions exist for every customer and provider screen. Suggested routes:

| Design file | Purpose | Route |
|---|---|---|
| `Main` / `MobileHome` | Home: search, service categories, ongoing order, featured VIP providers | `/` |
| `Marketplace` / `MobileMarketplace` | Search + filters (price, provider type, cleaning type, rating, distance, date), results with VIP first | `/marketplace?service=` |
| `LaundryProfile` / `MobileLaundryProfile` | Laundry provider public profile + **order calculator** | `/p/[slug]` (laundry) |
| `CleaningProfile` / `MobileCleaningProfile` | Cleaning provider public profile + **price calculator** | `/p/[slug]` (cleaning) |
| `CarWash` / `MobileCarWash` | Managed car wash request form | `/car-wash` |
| `Messages` / `MobileMessages` | Customer ↔ provider chat, quotes inside chat | `/messages/[threadId]` |
| `Profile` / `MobileProfile` | Customer account: wallet, ongoing orders with progress, completed orders | `/account` |
| `ProviderSignup` / `MobileProviderSignup` | Provider registration + verification + plan choice | `/providers/join` |
| `ProviderCleaning` / `MobileProviderCleaning` | Cleaning provider dashboard: orders, in-progress checklist, team, earnings, **price editor**, VIP stats | `/provider` |
| `MobileCleaningPrices` | Cleaning price editor (mobile) | `/provider/prices` |
| `ProviderLaundry` / `MobileProviderLaundry` | Laundry dashboard: orders board, **item intake**, **price list editor**, pickups, earnings | `/provider` |
| `MobileLaundryPrices` | Laundry price list editor (mobile) | `/provider/prices` |
| `ProviderCarWash` / `MobileProviderCarWash` | Car wash partner: assigned jobs (accept window), schedule, active job steps, partner score, payout rates | `/partner` |
| `Admin` / `MobileAdmin` | Admin console with sidebar / tab navigation (see §9) | `/admin/[section]` |

The provider dashboard is **different per service** (cleaning vs laundry vs car wash) — pick the layout from the provider's service type.

---

## 5. Profiles (public provider page)

- Header: name, business/individual, verification badges (show "CAC verified" / "NIN verified" — **never** show the numbers), VIP badge, earned badges (Top rated, Fast responder, 500+ orders), rating, jobs completed, completion rate, reply time, areas covered. Buttons: Save provider, Share, Message, Book.
- **Photos & videos: captured in the app only** — the provider app opens the camera; no gallery uploads. Each item is stamped "Taken on CleanConnect · Month Year", linked to a real completed job, and saveable by customers (♡ → "Saved" collection). Strip EXIF/GPS, never show exact locations. Plan for automatic blurring of faces, house numbers and documents (can be a later phase). Customer consent before job photos go public.
- Before/after pairs for cleaning; albums by service; short videos (≤ 60 s).
- Ratings: overall, 5→1 distribution, category scores (quality, punctuality/on time, communication/trust, value). **Only customers with a completed order can review.** Reviews can include in-app photos; providers can reply publicly. Filters by service and "with photos".
- Cleaning profiles show **team members** (first name, photo, NIN-verified badge).
- Policies: payment held until confirmation, count/size check at pickup/arrival, damage/loss, cancellation. "Report this profile" link.

---

## 6. Pricing logic (port to shared, tested functions)

All amounts in **₦ (NGN)**, integers. Format with `en-NG` thousands separators.

### 6.1 Laundry (provider-set)

Provider price list: `price[item][service]` where service ∈ `dry | wash | iron`. **Empty = not offered** (hide that option from customers).

Default item list: shirt/blouse, trousers/skirt, native wear (2-pc), agbada (3-pc), suit (2-pc), gown/dress, bedsheet set, duvet, towel. Providers should be able to add their own items later.

Provider settings: `expressPct` (default 50), `deliveryFee` (default 1,500), `freeDeliveryOver` (default 20,000), standard turnaround (48 h), areas covered.

```
subtotal   = Σ qty[item][service] × price[item][service]
express    = isExpress ? subtotal × expressPct / 100 : 0
cleaning   = subtotal + express
delivery   = (items == 0 || cleaning >= freeDeliveryOver) ? 0 : deliveryFee
total      = cleaning + delivery
commission = cleaning × commissionRate          // 15% placeholder; not on delivery
providerEarns = cleaning − commission + delivery
```

The customer calculator shows a hint: "Add ₦X more for free pickup & delivery".

**Item intake at pickup:** the shop counts what it received against what was booked. Each line shows booked vs counted (±N badge). Tag numbers are assigned sequentially across lines (e.g. 0412–0416). Stain/damage notes per line, with photo. If the recalculated total ≠ booked total, the customer must **approve the new total in the app** before cleaning starts; otherwise "Confirm & move to Cleaning".

### 6.2 Cleaning (provider-set)

Property types, each with its own areas and units:

- **Home:** bedroom (per room), sitting room, kitchen, bathroom/toilet, dining area, balcony/terrace, staircase (per flight)
- **Office:** private office, open-plan (per 50 m²), meeting room, reception/lobby, restroom, kitchenette
- **School:** classroom, staff room/office, assembly hall, library/lab, restroom block, corridor (per floor)
- **Shop:** shop floor (per 50 m²), storeroom, display window (per window), fitting room, restroom

Provider settings: offers this property type (on/off), offers each area (on/off) + price per area, **cleaning-type multipliers** (regular 1.0, deep 1.6, move-in/out 1.8, post-construction 2.2), minimum order (default 10,000). The editor shows a "nearby" price range per area (median ±20% of similar providers — can be computed later).

Customer options: property type, cleaning type, area quantities, extras (inside fridge & oven 3,000; inside windows 4,000; carpet/rug shampoo 5,000; disinfection 10,000; floor scrub & polish 15,000), frequency (one-off; weekly −10%; monthly −5%).

```
areaSub   = Σ qty[area] × price[area]                 // current property type only
typeExtra = areaSub × (multiplier − 1)
before    = areaSub × multiplier + extrasSum
discount  = before × frequencyDiscount
total     = areaCount == 0 ? 0 : max(minOrder, before − discount)   // per visit if recurring
```

Size check on arrival works like laundry intake: if rooms differ from the booking, the new price is sent for customer approval.

**Decision needed:** should extras prices also be provider-set? (Designs currently show fixed values.)

### 6.3 Car wash (managed, admin-set)

- Admin sets **customer price** per `package × vehicle type` (packages: exterior, full wash, detailing; vehicles: saloon, SUV/jeep, bus/van, pickup/truck) plus a service fee.
- Admin sets **partner payout** per `package × vehicle type`, plus an optional mobile call-out bonus.
- Customer chooses "come to my location" or "drop off", address, date, time window, notes.
- Customer is **only charged when a partner is assigned.**
- Assignment: admin picks a partner, or the job is offered to the best-ranked nearby partner with a **10-minute accept window**, then the next partner.
- **Partner score** (rating, on-time arrival, acceptance rate, photo compliance) drives job priority and tiers (e.g. Gold).

---

## 7. Orders and statuses

**Cleaning:** `requested` (provider has a countdown, e.g. 15 min) → `accepted` | `declined` | `expired` → `upcoming` → `in_progress` (room checklist, before/after photos, assigned team) → `awaiting_confirmation` → `completed` · also `cancelled`, `disputed`. Plus **quote requests**: the customer asks in chat, the provider sends a quote card ("Accept & pay").

**Laundry:** `requested` → `accepted` → `pickup_scheduled` → `received` (intake) → [`awaiting_price_approval`] → `cleaning` → `ironing` → `ready` → `out_for_delivery` → `delivered` → `completed`. Express orders are flagged with a due time. Walk-in orders can be created by the shop.

**Car wash:** `requested` → `assigning` → `assigned` → `en_route` → `arrived` → `condition_checked` (existing damage photos) → `washing` → `awaiting_signoff` → `completed`.

The customer sees a progress bar or steps for every active order, can message the provider and report an issue. The provider address is revealed only after acceptance; the customer's exact address is revealed to the provider only after acceptance.

---

## 8. Wallet and payments

- Customers fund the wallet by card, bank transfer or USSD, and can withdraw.
- Booking places the amount **on hold (escrow)**; it is released to the provider when the customer confirms completion (or auto-confirms after N hours — decide N). Refunds go back to the wallet.
- Providers see: available to withdraw, held amount, commission per job, payout history; withdraw to bank. Car wash partners are paid weekly (Friday) at the fixed rates.
- Use a Nigerian payment provider (e.g. Paystack or Flutterwave) for funding, virtual accounts and payouts. Keep a double-entry ledger table — never store a balance as a single mutable number without a transaction history.

---

## 9. Admin console

Sections (sidebar on desktop; bottom tabs + menu on mobile), as in `Admin` / `MobileAdmin`:

- **Overview** — totals: users, users online now, providers (shops vs individuals), employees, monthly income, net profit + margin.
- **Provider approvals** — queue with type, service, verification result per check (CAC matched / name mismatch, NIN ✓, BVN pending, face match), plan; view documents, approve, reject (with reason).
- **Registrations & logins** — sign-ups, logins, failed attempts, lockouts.
- **Job applications** — car wash partner applications (site inspection) and staff applicants (interview stages).
- **Staff & locations** — employees and providers by city/area, map.
- **User requests** — managed car wash requests; assign a partner.
- **VIP calls** — upgrade enquiries, email campaign set-ups, renewal reminders.
- **Income & profit** — monthly income vs profit chart; profit calculation (marketplace commission + car wash revenue + VIP subscriptions + advertising − partner payouts − staff salaries − marketing/payments/ops).
- **Support & help** — tickets with priority and assignee.
- **Chat** — live chat with customers and providers.

---

## 10. Data model (starting point)

`users` (role, name, phone, email) · `customer_profiles` · `providers` (type business|individual, service cleaning|laundry|carwash, status pending|approved|rejected|suspended, plan standard|vip, slug, areas) · `provider_members` (staff) · `verifications` (kind cac|nin|bvn|selfie, status, provider_ref, result json) · `laundry_items` + `laundry_prices` (provider, item, service, price nullable) · `laundry_settings` · `cleaning_areas` (property type, area, unit) + `cleaning_prices` (provider, area, price, offered) · `cleaning_settings` (multipliers, min order, property types offered) · `carwash_rates` (package, vehicle, customer price, partner payout) · `orders` (service, customer, provider, status, scheduled_at, address, totals snapshot) · `order_lines` (booked qty, counted qty, unit price snapshot, tags, notes) · `order_events` (status history) · `media` (order, kind photo|video, captured_in_app, taken_at, public, blurred) · `reviews` (+ category scores, reply) · `threads` / `messages` (+ quote messages) · `wallets` · `ledger_entries` · `payouts` · `vip_subscriptions` · `support_tickets` · `job_applications` · `partner_scores`.

Snapshot prices onto `order_lines` at booking time so later price changes don't alter existing orders.

---

## 11. Integrations to choose

- **Identity verification (CAC, NIN, BVN, face match):** a Nigerian KYC provider (e.g. Smile ID, Dojah, Prembly).
- **Payments, wallet funding, payouts:** e.g. Paystack or Flutterwave.
- **SMS / WhatsApp / push** for new-job alerts and OTP; **email** for VIP promotions to high-value customers.
- **Maps / geocoding** for distance filters, coverage areas and the admin map.
- **Media storage** (object storage + image/video processing) for in-app photos and videos.

---

## 12. Design tokens

Font: **Plus Jakarta Sans** (400–800).

| Token | Hex | Use |
|---|---|---|
| primary | `#0B6B57` | Buttons, active states, links |
| primary-hover | `#084F40` | |
| primary-tint | `#E3F1EC` | Selected chips, icon backgrounds |
| primary-tint-2 | `#F2F9F6` | Selected form options |
| accent | `#F2A93B` | Search/Fund buttons, "in progress", highlights |
| ink | `#10201B` | Text, dark cards, admin sidebar |
| text-2 | `#3E4D47` | Secondary text |
| muted | `#4F5E58` | Labels, meta text |
| bg | `#F5F7F6` | Page background |
| bg-admin | `#EEF2F0` | Admin background, dividers |
| surface | `#FFFFFF` | Cards |
| border | `#DCE3E0` | Borders |
| carwash / info | `#1F5FAF` on `#E8EEF8` | Car wash (managed) identity |
| laundry | `#6A3FA0` on `#F1ECF8` | Laundry identity |
| vip | `#8A5A00` on `#FBF1DC`, border `#E9D6A8` | VIP |
| warning | `#7A4B00` on `#FDF0DA` | Pending / in progress |
| danger | `#A23A1E` on `#FBE6E0` | Errors, reject, costs |

Radii: 8–10 (inputs, small buttons), 12–14 (cards, tiles), 16–20 (large panels), 999 (pills). Minimum touch target 44 px. Body text ≥ 14 px; keep the contrast levels used in the designs.

---

## 13. Suggested stack and phases

Stack (suggestion): Next.js (App Router) + TypeScript + Tailwind, Postgres (e.g. Supabase) with an ORM, server actions/API routes, background jobs for timers (accept windows, auto-confirm). Build the web app **responsive first** so the mobile designs work in the browser; add a React Native (Expo) app later if needed, sharing the pricing package.

1. **Foundation** — auth, roles, design tokens, layout shells, shared pricing package with unit tests matching §6.
2. **Providers** — sign-up, verification (mocked first), admin approvals, price editors, public profiles.
3. **Booking** — marketplace search/filters, laundry and cleaning calculators, car wash requests, order statuses, messaging + quotes.
4. **Money** — wallet, escrow, commission, payouts, VIP subscriptions.
5. **Operations** — admin console sections, car wash assignment, partner score, support tickets.
6. **Trust & media** — in-app camera capture, stamping, saving, reviews with photos, blurring.

---

## 14. Open decisions (fill these in)

- Real brand name.
- Commission rate (placeholder 15%) — same for cleaning and laundry?
- VIP monthly price and exactly which customers count as "high value".
- Car wash customer prices, service fee and partner payouts.
- Express %, delivery fee, free-delivery threshold — platform defaults vs fully provider-set.
- Whether cleaning extras are provider-set.
- Auto-confirm window before escrow is released.
- Cancellation and damage/loss policies (platform-wide minimums).
- Cities at launch.

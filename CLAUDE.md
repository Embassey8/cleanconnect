# CleanConnect — instructions for Claude Code

You are building the CleanConnect marketplace (cleaning, laundry, car wash) for Nigeria.

- **Read `BUILD_BRIEF.md` first.** It defines roles, services, statuses, pricing formulas, the data model and open decisions.
- **The designs in `design/` are the spec.** `design/desktop/*.dc.html` and `design/mobile/*.dc.html` are HTML screens with inline styles. Match their layout, copy, colours, spacing and interactions. `{{x}}`, `<sc-for>` and `<sc-if>` are template syntax explained in BUILD_BRIEF §1; the `./support.js` they reference is not needed.
- Use the design tokens in BUILD_BRIEF §12 as Tailwind theme values instead of hard-coding hex values in components.
- Put all pricing logic (BUILD_BRIEF §6) in one shared module with unit tests. The scripts at the bottom of `LaundryProfile`, `CleaningProfile`, `ProviderLaundry` and `ProviderCleaning` are the reference implementation.
- Text in `[square brackets]` is a placeholder; admin numbers and sample prices are made up. Load real values from the database.
- Never display NIN, BVN or CAC numbers on public pages — only "verified" badges.
- Money: integers in naira, a ledger for every wallet movement, prices snapshotted on order lines.
- Work in the phases in BUILD_BRIEF §13. Ask before choosing between options listed in BUILD_BRIEF §14 (open decisions); use the placeholder values meanwhile.

## Web + mobile layout

- Monorepo (pnpm workspace): `apps/web` (Next.js), `packages/shared` (pure TypeScript), `supabase/` (migrations, shared by web and the future Expo app in `apps/mobile`).
- Put pricing, roles, validation and types in `packages/shared`. It must not import DOM, Node, Next or React Native modules.
- Keep data access behind the Supabase client and database rules (RLS) so the mobile app can reuse it; avoid logic that exists only in Next server actions.
- Build UI responsive-first with 44 px touch targets (BUILD_BRIEF §12).

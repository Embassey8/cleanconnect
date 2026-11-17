-- Identity gates.
--  * Customers must verify their identity (NIN or BVN) before they can add money to or withdraw from a wallet.
--  * Providers must pass their identity checks (CAC for businesses; NIN for individuals, plus BVN for laundry)
--    before they can be approved, and they drop back to 'pending' (hidden from the marketplace) if a check
--    stops being verified. Every public query already requires status = 'approved', so keeping that status
--    honest is what keeps unverified providers out of sight. Car wash partners are never listed and are
--    onboarded by an admin through job applications, so they are exempt.
-- Raw ID numbers are never stored: only the last 4 digits and non-identifying flags.

-- ───────────────────────── Customers ─────────────────────────
create table public.user_verifications (
  user_id uuid primary key references public.users (id) on delete cascade,
  kind public.verification_kind not null check (kind in ('nin', 'bvn')),
  status public.verification_status not null default 'pending',
  provider_ref text,                       -- last 4 digits only
  result jsonb not null default '{}',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_verifications enable row level security;
create policy user_verifications_read on public.user_verifications for select
  using (user_id = auth.uid() or public.current_role_is('admin'));
-- No insert/update/delete policies: writes go through the functions below.

create function public.identity_verified(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_verifications where user_id = p_user and status = 'verified');
$$;

-- Raises for a customer who has not verified. Providers, partners and admins are not gated here.
create function public.identity_gate(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.users where id = p_user and role = 'customer')
     and not public.identity_verified(p_user) then
    raise exception 'identity verification required';
  end if;
end $$;

-- A customer submits an ID number. Mock mode decides immediately (same stand-in rule as provider sign-up: a
-- number ending in 0 is a mismatch); live mode leaves it pending until the server records Smile ID's verdict.
create function public.submit_identity(p_kind public.verification_kind, p_number text)
returns public.verification_status
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_status public.verification_status;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('nin', 'bvn') then raise exception 'choose NIN or BVN'; end if;
  if p_number is null or p_number !~ '^[0-9]{11}$' then raise exception 'enter your 11-digit % number', upper(p_kind::text); end if;
  if public.identity_verified(uid) then raise exception 'identity already verified'; end if;
  if exists (select 1 from public.money_settings where kyc_mode = 'live') then
    v_status := 'pending';
  else
    v_status := case when right(p_number, 1) = '0' then 'mismatch' else 'verified' end;
  end if;
  insert into public.user_verifications (user_id, kind, status, provider_ref, result, verified_at)
  values (uid, p_kind, v_status, right(p_number, 4), '{}', case when v_status = 'verified' then now() end)
  on conflict (user_id) do update
    set kind = excluded.kind, status = excluded.status, provider_ref = excluded.provider_ref,
        result = '{}', verified_at = excluded.verified_at, updated_at = now();
  return v_status;
end $$;

-- Server only (service role): store Smile ID's verdict for a customer.
create function public.record_user_verification(p_user uuid, p_status public.verification_status, p_result jsonb)
returns void
language sql security definer set search_path = '' as $$
  update public.user_verifications
     set status = p_status, result = coalesce(p_result, '{}'), updated_at = now(),
         verified_at = case when p_status = 'verified' then now() end
   where user_id = p_user;
$$;

revoke all on function public.identity_verified(uuid), public.identity_gate(uuid) from public, anon;
grant execute on function public.identity_verified(uuid), public.identity_gate(uuid) to authenticated;
revoke all on function public.submit_identity(public.verification_kind, text) from public, anon;
grant execute on function public.submit_identity(public.verification_kind, text) to authenticated;
revoke all on function public.record_user_verification(uuid, public.verification_status, jsonb) from public, anon, authenticated;
grant execute on function public.record_user_verification(uuid, public.verification_status, jsonb) to service_role;

-- Money entry points: same bodies as before plus the identity gate.
create or replace function public.mock_fund_wallet(p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.users where id = uid and role in ('provider', 'partner')) then
    raise exception 'providers cannot add money to their wallet';
  end if;
  perform public.identity_gate(uid);
  select * into s from public.money_settings;
  if s.payments_mode <> 'mock' then raise exception 'mock payments are disabled'; end if;
  if p_amount is null or p_amount < s.min_funding or p_amount > s.max_funding then
    raise exception 'amount must be between % and %', s.min_funding, s.max_funding;
  end if;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
  values (public.wallet_of(uid), gen_random_uuid(), 'available', p_amount, 'fund', 'mock_' || gen_random_uuid()::text);
end $$;

create or replace function public.create_payment_intent(p_amount integer) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype; v_ref text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.users where id = uid and role in ('provider', 'partner')) then
    raise exception 'providers cannot add money to their wallet';
  end if;
  perform public.identity_gate(uid);
  select * into s from public.money_settings;
  if s.payments_mode <> 'live' then raise exception 'live payments are not enabled'; end if;
  if p_amount is null or p_amount < s.min_funding or p_amount > s.max_funding then
    raise exception 'amount must be between % and %', s.min_funding, s.max_funding;
  end if;
  v_ref := 'cc_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.payment_intents (reference, user_id, amount) values (v_ref, uid, p_amount);
  return v_ref;
end $$;

create or replace function public.request_withdrawal(p_amount integer, p_bank text, p_account_name text, p_account_number text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype; v_plan public.plan_kind; v_id uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.identity_gate(uid);
  select * into s from public.money_settings;
  if p_amount is null or p_amount < s.min_withdrawal then raise exception 'minimum withdrawal is %', s.min_withdrawal; end if;
  if coalesce(trim(p_bank), '') = '' or coalesce(trim(p_account_name), '') = '' then raise exception 'bank details required'; end if;
  if p_account_number is null or p_account_number !~ '^[0-9]{10}$' then raise exception 'account number must be 10 digits'; end if;
  select plan into v_plan from public.providers where owner_id = uid order by (plan = 'vip') desc limit 1;
  insert into public.payouts (user_id, amount, bank_name, account_name, account_last4, eta_hours)
  values (uid, p_amount, trim(p_bank), trim(p_account_name), right(p_account_number, 4),
          case when v_plan = 'vip' then s.vip_payout_eta_hours else s.standard_payout_eta_hours end)
  returning id into v_id;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
  values (public.wallet_of(uid), gen_random_uuid(), 'available', -p_amount, 'withdraw', 'payout_' || v_id::text);
  return v_id;
end $$;

-- ───────────────────────── Providers ─────────────────────────
-- Mock mode now verifies BVN like the other numbers (it used to stay pending), because approval requires it.
create or replace function public.mock_verify(kind public.verification_kind, ref text)
returns public.verification_status
language plpgsql stable set search_path = '' as $$
begin
  if exists (select 1 from public.money_settings where kyc_mode = 'live') then
    return 'pending'; -- a real provider decides
  end if;
  return case
    when ref is null or ref = '' then 'failed'::public.verification_status
    when right(ref, 1) = '0' then 'mismatch'::public.verification_status
    else 'verified'::public.verification_status
  end;
end $$;

-- Are all the identity checks this provider needs verified? (The selfie match is not enforced yet: nothing
-- captures it.)
create function public.provider_checks_pass(p_provider uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p.type
    when 'business' then exists (select 1 from public.verifications v where v.provider_id = p.id and v.kind = 'cac' and v.status = 'verified')
    else exists (select 1 from public.verifications v where v.provider_id = p.id and v.kind = 'nin' and v.status = 'verified')
         and (p.service <> 'laundry' or exists (select 1 from public.verifications v where v.provider_id = p.id and v.kind = 'bvn' and v.status = 'verified'))
  end
  from public.providers p where p.id = p_provider;
$$;
revoke all on function public.provider_checks_pass(uuid) from public, anon;
grant execute on function public.provider_checks_pass(uuid) to authenticated;

-- Approval requires passing checks.
create function public.providers_require_verification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and new.service <> 'carwash'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved')
     and not public.provider_checks_pass(new.id) then
    raise exception 'identity verification must pass before this provider can be approved';
  end if;
  return new;
end $$;
create trigger providers_require_verification before insert or update of status on public.providers
for each row execute function public.providers_require_verification();

-- A check that stops being verified takes the provider out of the marketplace until it is fixed.
create function public.verifications_hide_unverified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.status <> 'verified' then
    update public.providers set status = 'pending', approved_at = null
     where id = coalesce(new.provider_id, old.provider_id) and status = 'approved' and service <> 'carwash'
       and coalesce(new.kind, old.kind) in ('cac', 'nin', 'bvn');
  end if;
  return coalesce(new, old);
end $$;
create trigger verifications_hide_unverified after update of status or delete on public.verifications
for each row execute function public.verifications_hide_unverified();

-- Providers that are listed today without passing checks go back to the approval queue.
update public.providers set status = 'pending', approved_at = null
 where status = 'approved' and service <> 'carwash' and not public.provider_checks_pass(id);

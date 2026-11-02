-- Paystack integration. Funding and payouts only move money here after the provider confirms it.
-- The database stays in payments_mode = 'mock' until an admin flips it to 'live' (and Paystack keys are set).

-- A top-up the customer has started at Paystack. The reference is what Paystack echoes back.
create table public.payment_intents (
  reference text primary key,
  user_id uuid not null references public.users (id),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payment_intents_user_idx on public.payment_intents (user_id, created_at desc);
alter table public.payment_intents enable row level security;
create policy payment_intents_own on public.payment_intents for select using (user_id = auth.uid());

alter table public.payouts add column transfer_code text, add column failure_reason text;

-- Customer (or admin) starts a top-up. Returns the reference to send to Paystack.
create function public.create_payment_intent(p_amount integer) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype; v_ref text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.users where id = uid and role in ('provider', 'partner')) then
    raise exception 'providers cannot add money to their wallet';
  end if;
  select * into s from public.money_settings;
  if s.payments_mode <> 'live' then raise exception 'live payments are not enabled'; end if;
  if p_amount is null or p_amount < s.min_funding or p_amount > s.max_funding then
    raise exception 'amount must be between % and %', s.min_funding, s.max_funding;
  end if;
  v_ref := 'cc_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.payment_intents (reference, user_id, amount) values (v_ref, uid, p_amount);
  return v_ref;
end $$;

-- Server only (service role): credit the wallet once Paystack confirms the charge. Safe to call twice.
create function public.credit_payment(p_reference text, p_amount integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare i public.payment_intents%rowtype;
begin
  select * into i from public.payment_intents where reference = p_reference for update;
  if not found then raise exception 'unknown payment reference'; end if;
  if i.status = 'success' then return false; end if;
  if p_amount <> i.amount then raise exception 'amount mismatch: expected %, got %', i.amount, p_amount; end if;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
  values (public.wallet_of(i.user_id), gen_random_uuid(), 'available', i.amount, 'fund', 'paystack_' || p_reference);
  update public.payment_intents set status = 'success', paid_at = now() where reference = p_reference;
  return true;
end $$;

create function public.fail_payment(p_reference text) returns void
language sql security definer set search_path = '' as $$
  update public.payment_intents set status = 'failed' where reference = p_reference and status = 'pending';
$$;

-- Server only (service role): settle a withdrawal from a Paystack transfer result. A failed transfer
-- returns the money to the wallet. Safe to call twice.
create function public.settle_payout(p_payout uuid, p_status text, p_transfer_code text default null, p_reason text default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if p_status not in ('paid', 'failed') then raise exception 'status must be paid or failed'; end if;
  select * into p from public.payouts where id = p_payout for update;
  if not found then raise exception 'unknown payout'; end if;
  if p.status <> 'pending' then return false; end if;
  if p_status = 'failed' then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
    values (public.wallet_of(p.user_id), gen_random_uuid(), 'available', p.amount, 'adjustment', 'payout_failed_' || p_payout::text);
  end if;
  update public.payouts
     set status = p_status, settled_at = now(),
         transfer_code = coalesce(p_transfer_code, transfer_code), failure_reason = p_reason
   where id = p_payout;
  return true;
end $$;

-- In live mode payouts are settled by Paystack, not by hand.
create or replace function public.mark_payout(p_payout uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  if exists (select 1 from public.money_settings where payments_mode = 'live') then
    raise exception 'payouts are settled automatically by Paystack';
  end if;
  if p_status not in ('paid', 'failed') then raise exception 'status must be paid or failed'; end if;
  select * into p from public.payouts where id = p_payout for update;
  if not found or p.status <> 'pending' then raise exception 'payout is not pending'; end if;
  if p_status = 'failed' then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
    values (public.wallet_of(p.user_id), gen_random_uuid(), 'available', p.amount, 'adjustment', 'payout_failed_' || p_payout::text);
  end if;
  update public.payouts set status = p_status, settled_at = now() where id = p_payout;
end $$;

revoke all on function public.create_payment_intent(integer) from public, anon;
grant execute on function public.create_payment_intent(integer) to authenticated;
revoke all on function public.credit_payment(text, integer) from public, anon, authenticated;
revoke all on function public.fail_payment(text) from public, anon, authenticated;
revoke all on function public.settle_payout(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.credit_payment(text, integer) to service_role;
grant execute on function public.fail_payment(text) to service_role;
grant execute on function public.settle_payout(uuid, text, text, text) to service_role;

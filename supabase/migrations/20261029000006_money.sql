-- Phase 4: money. Wallet funding (mocked provider), escrow, commission, payouts, VIP subscriptions.
-- Every movement is an append-only ledger row; balances are derived. Internal movements (hold,
-- release, refund, commission, vip_fee) net to zero per group_id; only fund/withdraw/adjustment
-- cross the boundary to the outside world.

-- ---------- Platform wallet ----------
alter table public.wallets alter column user_id drop not null;
alter table public.wallets add column kind text not null default 'user' check (kind in ('user', 'platform'));
alter table public.wallets add constraint wallets_kind_owner check ((kind = 'platform') = (user_id is null));
create unique index wallets_one_platform on public.wallets (kind) where kind = 'platform';
insert into public.wallets (kind) values ('platform');

-- ---------- Settings (all placeholders until BUILD_BRIEF §14 is decided) ----------
create table public.money_settings (
  id boolean primary key default true check (id),
  payments_mode text not null default 'mock' check (payments_mode in ('mock', 'live')),
  auto_confirm_hours integer not null default 48 check (auto_confirm_hours > 0),
  vip_price integer not null default 20000 check (vip_price > 0),
  vip_period_days integer not null default 30 check (vip_period_days > 0),
  min_withdrawal integer not null default 1000 check (min_withdrawal > 0),
  min_funding integer not null default 100 check (min_funding > 0),
  max_funding integer not null default 5000000,
  vip_payout_eta_hours integer not null default 24,
  standard_payout_eta_hours integer not null default 72
);
insert into public.money_settings default values;
alter table public.money_settings enable row level security;
create policy money_settings_read on public.money_settings for select using (true);
create policy money_settings_admin on public.money_settings for update
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));

-- ---------- Order escrow columns ----------
alter table public.orders
  add column escrow_status text not null default 'unpaid' check (escrow_status in ('unpaid', 'held', 'released', 'refunded')),
  add column commission_amount integer,
  add column paid_at timestamptz,
  add column settled_at timestamptz;

-- ---------- Payouts and VIP ----------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  amount integer not null check (amount > 0),
  bank_name text not null,
  account_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'), -- full number is never stored
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  eta_hours integer not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index payouts_user_idx on public.payouts (user_id, created_at desc);

create table public.vip_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id),
  status text not null default 'active' check (status in ('active', 'expired')),
  price integer not null check (price > 0),
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null,
  auto_renew boolean not null default true
);
create unique index vip_one_active on public.vip_subscriptions (provider_id) where status = 'active';

alter table public.payouts enable row level security;
alter table public.vip_subscriptions enable row level security;
create policy payouts_read on public.payouts for select
  using (user_id = auth.uid() or public.current_role_is('admin'));
create policy vip_read on public.vip_subscriptions for select
  using (public.owns_provider(provider_id) or public.current_role_is('admin'));

-- ---------- Internal ledger helpers (no client access) ----------
create function public.wallet_of(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.wallets where user_id = p_user;
$$;
create function public.platform_wallet() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.wallets where kind = 'platform';
$$;
revoke all on function public.wallet_of(uuid) from public, anon, authenticated;
revoke all on function public.platform_wallet() from public, anon, authenticated;

-- Customer pays: available -> held.
create function public.escrow_hold(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; w uuid; g uuid := gen_random_uuid();
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.escrow_status <> 'unpaid' then raise exception 'this order is already paid'; end if;
  if o.total <= 0 then raise exception 'nothing to pay'; end if;
  w := public.wallet_of(o.customer_id);
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
  values (w, g, 'available', -o.total, 'hold', p_order),
         (w, g, 'held', o.total, 'hold', p_order);
  update public.orders set escrow_status = 'held', paid_at = now() where id = p_order;
end $$;

-- Completion: held money goes to the provider less commission. Car wash has no provider, so the
-- whole amount is platform revenue (partner payouts arrive with the operations phase).
create function public.escrow_release(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; g uuid := gen_random_uuid(); v_comm integer; v_provider_wallet uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.escrow_status <> 'held' then return; end if;
  v_comm := case o.service
    when 'laundry' then round((o.subtotal + o.surcharge) * o.commission_rate)::integer
    when 'cleaning' then round(o.total * o.commission_rate)::integer
    else o.total end;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
  values (public.wallet_of(o.customer_id), g, 'held', -o.total, 'release', p_order);
  if o.provider_id is not null and o.total - v_comm > 0 then
    select public.wallet_of(owner_id) into v_provider_wallet from public.providers where id = o.provider_id;
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (v_provider_wallet, g, 'available', o.total - v_comm, 'release', p_order);
  end if;
  if v_comm > 0 then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (public.platform_wallet(), g, 'available', v_comm, 'commission', p_order);
  end if;
  update public.orders set escrow_status = 'released', commission_amount = v_comm, settled_at = now() where id = p_order;
end $$;

-- Cancelled / declined / expired: held money goes back to the customer's wallet.
create function public.escrow_refund(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; w uuid; g uuid := gen_random_uuid();
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.escrow_status <> 'held' then return; end if;
  w := public.wallet_of(o.customer_id);
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
  values (w, g, 'held', -o.total, 'refund', p_order),
         (w, g, 'available', o.total, 'refund', p_order);
  update public.orders set escrow_status = 'refunded', settled_at = now() where id = p_order;
end $$;
revoke all on function public.escrow_hold(uuid) from public, anon, authenticated;
revoke all on function public.escrow_release(uuid) from public, anon, authenticated;
revoke all on function public.escrow_refund(uuid) from public, anon, authenticated;

-- ---------- Customer-facing money ----------
-- Mock payment provider. In production, a webhook handler using the service role inserts the
-- 'fund' ledger row with the provider's reference (the unique `reference` column makes it
-- idempotent) and this function stays disabled by payments_mode = 'live'.
create function public.mock_fund_wallet(p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into s from public.money_settings;
  if s.payments_mode <> 'mock' then raise exception 'mock payments are disabled'; end if;
  if p_amount is null or p_amount < s.min_funding or p_amount > s.max_funding then
    raise exception 'amount must be between % and %', s.min_funding, s.max_funding;
  end if;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
  values (public.wallet_of(uid), gen_random_uuid(), 'available', p_amount, 'fund', 'mock_' || gen_random_uuid()::text);
end $$;

create function public.pay_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status not in ('requested', 'accepted', 'assigning') then raise exception 'this order can no longer be paid'; end if;
  perform public.escrow_hold(p_order);
end $$;

create function public.request_withdrawal(p_amount integer, p_bank text, p_account_name text, p_account_number text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype; v_plan public.plan_kind; v_id uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
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

-- Admin settles a payout (mock). A failed payout returns the money to the wallet.
create function public.mark_payout(p_payout uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  if p_status not in ('paid', 'failed') then raise exception 'status must be paid or failed'; end if;
  select * into p from public.payouts where id = p_payout for update;
  if not found or p.status <> 'pending' then raise exception 'payout is not pending'; end if;
  if p_status = 'failed' then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
    values (public.wallet_of(p.user_id), gen_random_uuid(), 'available', p.amount, 'adjustment', 'payout_failed_' || p_payout::text);
  end if;
  update public.payouts set status = p_status, settled_at = now() where id = p_payout;
end $$;

-- Admin decides a disputed order.
create function public.resolve_dispute(p_order uuid, p_outcome text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  if p_outcome not in ('release', 'refund') then raise exception 'outcome must be release or refund'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'disputed' then raise exception 'order is not disputed'; end if;
  if p_outcome = 'release' then
    update public.orders set status = 'completed' where id = p_order;
    perform public.record_event(p_order, 'completed');
    perform public.escrow_release(p_order);
  else
    update public.orders set status = 'cancelled' where id = p_order;
    perform public.record_event(p_order, 'cancelled');
    perform public.escrow_refund(p_order);
  end if;
end $$;

-- ---------- Status machine now moves money ----------
create or replace function public.advance_order(p_order uuid, p_status public.order_status) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); o public.orders%rowtype; v_actor text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;

  if public.current_role_is('admin') then
    v_actor := 'admin';
  elsif o.customer_id = uid then
    v_actor := 'customer';
  elsif o.provider_id is not null and public.owns_provider(o.provider_id) then
    v_actor := 'provider';
  else
    raise exception 'not allowed';
  end if;

  if v_actor <> 'admin' and not exists (
    select 1 from public.order_transitions t
    where t.service = o.service and t.from_status = o.status and t.to_status = p_status and t.actor = v_actor
  ) then
    raise exception 'cannot move from % to %', o.status, p_status;
  end if;

  if v_actor = 'provider' and p_status = 'accepted' and o.escrow_status <> 'held' then
    raise exception 'waiting for the customer to pay';
  end if;

  update public.orders set status = p_status where id = p_order;
  perform public.record_event(p_order, p_status);

  if p_status = 'completed' then
    perform public.escrow_release(p_order);
  elsif p_status in ('cancelled', 'declined', 'expired') then
    perform public.escrow_refund(p_order);
  end if;
end $$;

-- A quote is "Accept & pay": the order is created and paid in one step.
create or replace function public.accept_quote(p_message bigint, p_address text, p_area text, p_scheduled timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.messages%rowtype; t public.threads%rowtype; v_oid uuid;
begin
  select * into m from public.messages where id = p_message for update;
  if not found or m.kind <> 'quote' then raise exception 'quote not found'; end if;
  select * into t from public.threads where id = m.thread_id;
  if t.customer_id <> auth.uid() then raise exception 'not allowed'; end if;
  if m.quote_status <> 'open' then raise exception 'this quote is no longer open'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'address required'; end if;

  insert into public.orders (service, customer_id, provider_id, status, scheduled_at, subtotal, total)
  values ('cleaning', t.customer_id, t.provider_id, 'accepted', p_scheduled, m.quote_amount, m.quote_amount)
  returning id into v_oid;
  insert into public.order_lines (order_id, kind, label, qty, unit_price)
  values (v_oid, 'quote', coalesce(nullif(m.body, ''), 'Custom quote'), 1, m.quote_amount);
  insert into public.order_addresses (order_id, address, area) values (v_oid, trim(p_address), p_area);
  perform public.record_event(v_oid, 'accepted');
  perform public.escrow_hold(v_oid); -- fails (and rolls everything back) if the wallet is short
  update public.messages set quote_status = 'accepted', order_id = v_oid where id = p_message;
  return v_oid;
end $$;

-- ---------- Scheduled jobs (call with the service role / pg_cron; never from clients) ----------
create or replace function public.expire_stale_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select id from public.orders
     where status = 'requested' and accept_by is not null and accept_by < now() and service <> 'carwash'
       for update
  loop
    update public.orders set status = 'expired' where id = r.id;
    insert into public.order_events (order_id, status) values (r.id, 'expired');
    perform public.escrow_refund(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Customer did not confirm in time: complete the order and release escrow.
create function public.auto_confirm_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; v_hours integer;
begin
  select auto_confirm_hours into v_hours from public.money_settings;
  for r in
    select o.id from public.orders o
     where o.escrow_status = 'held'
       and ((o.service = 'cleaning' and o.status = 'awaiting_confirmation')
         or (o.service = 'laundry' and o.status = 'delivered'))
       and (select max(e.created_at) from public.order_events e where e.order_id = o.id and e.status = o.status)
           < now() - make_interval(hours => v_hours)
       for update of o
  loop
    update public.orders set status = 'completed' where id = r.id;
    insert into public.order_events (order_id, status) values (r.id, 'completed');
    perform public.escrow_release(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- VIP subscriptions ----------
create function public.vip_charge(p_provider uuid, p_price integer) returns void
language plpgsql security definer set search_path = '' as $$
declare g uuid := gen_random_uuid(); v_owner uuid;
begin
  select owner_id into v_owner from public.providers where id = p_provider;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind)
  values (public.wallet_of(v_owner), g, 'available', -p_price, 'vip_fee'),
         (public.platform_wallet(), g, 'available', p_price, 'vip_fee');
end $$;
revoke all on function public.vip_charge(uuid, integer) from public, anon, authenticated;

create function public.subscribe_vip(p_provider uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.providers%rowtype; s public.money_settings%rowtype;
begin
  select * into p from public.providers where id = p_provider for update;
  if not found or p.owner_id is distinct from auth.uid() then raise exception 'only the provider owner can do this'; end if;
  if p.status <> 'approved' then raise exception 'your account must be approved first'; end if;
  if p.plan = 'vip' then raise exception 'already a VIP provider'; end if;
  select * into s from public.money_settings;
  perform public.vip_charge(p_provider, s.vip_price);
  insert into public.vip_subscriptions (provider_id, price, current_period_end)
  values (p_provider, s.vip_price, now() + make_interval(days => s.vip_period_days));
  update public.providers set plan = 'vip' where id = p_provider;
end $$;

-- Cancelling stops renewal; VIP stays until the paid period ends.
create function public.cancel_vip(p_provider uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.providers where id = p_provider and owner_id = auth.uid()) then
    raise exception 'only the provider owner can do this';
  end if;
  update public.vip_subscriptions set auto_renew = false where provider_id = p_provider and status = 'active';
end $$;

create function public.renew_vip_subscriptions() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; s public.money_settings%rowtype; n integer := 0;
begin
  select * into s from public.money_settings;
  for r in select * from public.vip_subscriptions where status = 'active' and current_period_end <= now() for update
  loop
    begin
      if not r.auto_renew then raise exception 'not renewing'; end if;
      perform public.vip_charge(r.provider_id, s.vip_price);
      update public.vip_subscriptions
         set price = s.vip_price, current_period_end = r.current_period_end + make_interval(days => s.vip_period_days)
       where id = r.id;
      n := n + 1;
    exception when others then
      update public.vip_subscriptions set status = 'expired' where id = r.id;
      update public.providers set plan = 'standard' where id = r.provider_id;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.auto_confirm_orders() from public, anon, authenticated;
revoke all on function public.renew_vip_subscriptions() from public, anon, authenticated;

-- Admin button that runs every scheduled job once (until a real scheduler is wired up).
create function public.admin_run_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'expired', public.expire_stale_orders(),
    'auto_confirmed', public.auto_confirm_orders(),
    'vip_renewed', public.renew_vip_subscriptions());
end $$;

-- ---------- Client grants ----------
revoke all on function public.mock_fund_wallet(integer) from public, anon;
revoke all on function public.pay_order(uuid) from public, anon;
revoke all on function public.request_withdrawal(integer, text, text, text) from public, anon;
revoke all on function public.mark_payout(uuid, text) from public, anon;
revoke all on function public.resolve_dispute(uuid, text) from public, anon;
revoke all on function public.subscribe_vip(uuid) from public, anon;
revoke all on function public.cancel_vip(uuid) from public, anon;
revoke all on function public.admin_run_jobs() from public, anon;
grant execute on function public.mock_fund_wallet(integer) to authenticated;
grant execute on function public.pay_order(uuid) to authenticated;
grant execute on function public.request_withdrawal(integer, text, text, text) to authenticated;
grant execute on function public.mark_payout(uuid, text) to authenticated;
grant execute on function public.resolve_dispute(uuid, text) to authenticated;
grant execute on function public.subscribe_vip(uuid) to authenticated;
grant execute on function public.cancel_vip(uuid) to authenticated;
grant execute on function public.admin_run_jobs() to authenticated;

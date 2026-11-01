-- Money audit fixes.
-- 1. Orders snapshot the express %, delivery fee and free-delivery threshold they were quoted, so the shop's
--    intake recount never re-derives them from a rounded surcharge or from settings that changed since.
-- 2. The cleaning minimum-order top-up becomes visible (parts now always add up to the total).
-- 3. Releasing escrow writes the service fee as its own ledger row on the provider's wallet:
--    provider +gross, provider -fee, admin +fee. Each provider statement then shows the deduction.
-- 4. admin_money(): per-provider earnings and fees, car wash margin, platform totals, customer wallets.

alter table public.orders
  add column express_pct integer check (express_pct between 0 and 300),
  add column quoted_delivery_fee integer check (quoted_delivery_fee >= 0),
  add column quoted_free_over integer check (quoted_free_over >= 0),
  add column min_topup integer generated always as (
    case when min_applied then greatest(0, total - (subtotal + surcharge + extras_total - discount + delivery_fee)) else 0 end
  ) stored;

-- Backfill laundry orders from what they were quoted (surcharge / subtotal) and the shop's current terms.
update public.orders o set
  express_pct = case when o.is_express and o.subtotal > 0 then round(o.surcharge * 100.0 / o.subtotal)::int else 0 end,
  quoted_delivery_fee = coalesce((select s.delivery_fee from public.laundry_settings s where s.provider_id = o.provider_id), 1500),
  quoted_free_over = coalesce((select s.free_delivery_over from public.laundry_settings s where s.provider_id = o.provider_id), 20000)
 where o.service = 'laundry';

create or replace function public.create_laundry_order(
  p_provider uuid, p_lines jsonb, p_express boolean, p_address text, p_area text, p_scheduled timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  l jsonb; v_qty int; v_price int; v_name text;
  v_sub int := 0; v_count int := 0; v_exp int := 0; v_cleaning int; v_del int;
  v_pct int := 50; v_fee int := 1500; v_free int := 20000;
  v_oid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'approved' and service = 'laundry') then
    raise exception 'provider not available';
  end if;
  if public.owns_provider(p_provider) then raise exception 'you cannot book your own service'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'address required'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'no items selected'; end if;

  select express_pct, delivery_fee, free_delivery_over into v_pct, v_fee, v_free
    from public.laundry_settings where provider_id = p_provider;
  if not found then v_pct := 50; v_fee := 1500; v_free := 20000; end if;

  insert into public.orders (service, customer_id, provider_id, is_express, scheduled_at, accept_by)
  values ('laundry', uid, p_provider, coalesce(p_express, false), p_scheduled, now() + interval '15 minutes')
  returning id into v_oid;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l ->> 'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'invalid quantity'; end if;
    select lp.price, li.name into v_price, v_name
      from public.laundry_prices lp join public.laundry_items li on li.id = lp.item_id
      where lp.provider_id = p_provider and lp.item_id = l ->> 'item'
        and lp.service = (l ->> 'service')::public.laundry_service;
    if v_price is null then raise exception 'not offered: % %', l ->> 'item', l ->> 'service'; end if;
    insert into public.order_lines (order_id, kind, item_id, service, label, qty, unit_price)
    values (v_oid, 'laundry', l ->> 'item', l ->> 'service', v_name, v_qty, v_price);
    v_sub := v_sub + v_qty * v_price;
    v_count := v_count + v_qty;
  end loop;

  if coalesce(p_express, false) then v_exp := round(v_sub::numeric * v_pct / 100); end if;
  v_cleaning := v_sub + v_exp;
  v_del := case when v_count = 0 or v_cleaning >= v_free then 0 else v_fee end;

  update public.orders set subtotal = v_sub, surcharge = v_exp, delivery_fee = v_del, total = v_cleaning + v_del,
         express_pct = case when coalesce(p_express, false) then v_pct else 0 end,
         quoted_delivery_fee = v_fee, quoted_free_over = v_free
   where id = v_oid;
  insert into public.order_addresses (order_id, address, area) values (v_oid, trim(p_address), p_area);
  perform public.record_event(v_oid, 'requested');
  return v_oid;
end $$;


create or replace function public.submit_intake(p_order uuid, p_counts jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype; l record; c int; v_sub int := 0; v_items int := 0; v_pct numeric := 0;
  v_fee int := 1500; v_free int := 20000; v_exp int; v_clean int; v_del int; v_total int;
  v_tag int; v_start int; v_new text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.service <> 'laundry' or o.provider_id is null or not public.owns_provider(o.provider_id) then
    raise exception 'not allowed';
  end if;
  if o.status <> 'received' then raise exception 'intake can only be recorded for a received order'; end if;

  insert into public.provider_tag_counters (provider_id) values (o.provider_id) on conflict do nothing;
  select next_tag into v_tag from public.provider_tag_counters where provider_id = o.provider_id for update;
  v_start := v_tag;

  for l in select * from public.order_lines where order_id = p_order and kind = 'laundry' order by id loop
    c := coalesce((p_counts ->> l.id::text)::int, l.qty);
    if c < 0 or c > 99 then raise exception 'invalid count'; end if;
    update public.order_lines
       set counted_qty = c,
           tag = case when c = 0 then null when c = 1 then lpad(v_tag::text, 4, '0')
                      else lpad(v_tag::text, 4, '0') || '–' || lpad((v_tag + c - 1)::text, 4, '0') end
     where id = l.id;
    v_tag := v_tag + c;
    v_sub := v_sub + c * l.unit_price;
    v_items := v_items + c;
  end loop;
  if v_items = 0 then raise exception 'count at least one item'; end if;
  update public.provider_tag_counters set next_tag = v_tag where provider_id = o.provider_id;

  -- Re-price with the terms quoted at booking, so a later change to the shop's settings cannot move the total.
  v_pct := coalesce(o.express_pct, 0);
  v_fee := coalesce(o.quoted_delivery_fee, 1500);
  v_free := coalesce(o.quoted_free_over, 20000);
  v_exp := round(v_sub::numeric * v_pct / 100);
  v_clean := v_sub + v_exp;
  v_del := case when v_clean >= v_free then 0 else v_fee end;
  v_total := v_clean + v_del;

  if v_total = o.total then
    update public.orders set status = 'cleaning', proposed_subtotal = null, proposed_surcharge = null,
           proposed_delivery_fee = null, proposed_total = null where id = p_order;
    v_new := 'cleaning';
  else
    update public.orders set status = 'awaiting_price_approval', proposed_subtotal = v_sub, proposed_surcharge = v_exp,
           proposed_delivery_fee = v_del, proposed_total = v_total where id = p_order;
    v_new := 'awaiting_price_approval';
  end if;
  perform public.record_event(p_order, v_new::public.order_status);
  return v_new;
end $$;


-- Marketplace orders: provider is credited the full amount, then the service fee is deducted and added to
-- the platform wallet. Car wash: the partner's fixed payout is set aside (held) until the weekly settlement;
-- the rest is platform revenue.
create or replace function public.escrow_release(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; g uuid := gen_random_uuid(); v_comm integer; v_payout integer; v_pw uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.escrow_status <> 'held' then return; end if;
  if o.service = 'carwash' then
    select partner_payout into v_payout from public.carwash_jobs where order_id = p_order;
    v_comm := o.total - coalesce(v_payout, 0);
  else
    v_comm := case o.service
      when 'laundry' then round((o.subtotal + o.surcharge) * o.commission_rate)::integer
      else round(o.total * o.commission_rate)::integer end;
  end if;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
  values (public.wallet_of(o.customer_id), g, 'held', -o.total, 'release', p_order);
  if o.provider_id is not null then select public.wallet_of(owner_id) into v_pw from public.providers where id = o.provider_id; end if;
  if v_pw is not null and o.service = 'carwash' then
    if o.total - v_comm > 0 then
      insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
      values (v_pw, g, 'held', o.total - v_comm, 'release', p_order);
    end if;
  elsif v_pw is not null then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (v_pw, g, 'available', o.total, 'release', p_order);
    if v_comm > 0 then
      insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
      values (v_pw, g, 'available', -v_comm, 'commission', p_order);
    end if;
  end if;
  if v_comm > 0 then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (public.platform_wallet(), g, 'available', v_comm, 'commission', p_order);
  end if;
  update public.orders set escrow_status = 'released', commission_amount = v_comm, settled_at = now() where id = p_order;
  if o.service = 'carwash' and o.provider_id is not null then perform public.record_partner_result(p_order); end if;
end $$;

-- Admin money overview for one month: what each provider billed, the fee taken, what they kept; car wash
-- revenue, payouts and margin; platform totals; customer wallets.
create or replace function public.admin_money(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_from timestamptz := date_trunc('month', p_month)::timestamptz;
  v_to timestamptz := (date_trunc('month', p_month) + interval '1 month')::timestamptz;
  v_providers jsonb; v_partners jsonb; v_customers jsonb; v_totals jsonb;
begin
  if not public.admin_can('finance') then raise exception 'not allowed'; end if;

  select coalesce(jsonb_agg(r order by r.gross desc, r.name), '[]'::jsonb) into v_providers from (
    select p.id, p.display_name as name, p.service, p.plan,
           count(o.id)::int as orders, coalesce(sum(o.total), 0)::int as gross,
           coalesce(sum(o.commission_amount), 0)::int as fee,
           coalesce(sum(o.total - o.commission_amount), 0)::int as net,
           coalesce((select -sum(le.amount) from public.ledger_entries le where le.wallet_id = public.wallet_of(p.owner_id)
                      and le.kind = 'vip_fee' and le.created_at >= v_from and le.created_at < v_to), 0)::int as vip_paid,
           coalesce((select b.available from public.wallet_balances b where b.wallet_id = public.wallet_of(p.owner_id)), 0)::int as available,
           coalesce((select b.held from public.wallet_balances b where b.wallet_id = public.wallet_of(p.owner_id)), 0)::int as held
      from public.providers p
      left join public.orders o on o.provider_id = p.id and o.escrow_status = 'released'
                               and o.settled_at >= v_from and o.settled_at < v_to
     where p.service <> 'carwash' and p.status = 'approved'
     group by p.id) r;

  select coalesce(jsonb_agg(r order by r.revenue desc, r.name), '[]'::jsonb) into v_partners from (
    select p.id, p.display_name as name, count(o.id)::int as jobs,
           coalesce(sum(o.total), 0)::int as revenue,
           coalesce(sum(j.partner_payout), 0)::int as payouts,
           coalesce(sum(o.total - j.partner_payout), 0)::int as margin,
           coalesce((select b.available from public.wallet_balances b where b.wallet_id = public.wallet_of(p.owner_id)), 0)::int as available,
           coalesce((select b.held from public.wallet_balances b where b.wallet_id = public.wallet_of(p.owner_id)), 0)::int as held
      from public.providers p
      left join public.orders o on o.provider_id = p.id and o.escrow_status = 'released' and o.service = 'carwash'
                               and o.settled_at >= v_from and o.settled_at < v_to
      left join public.carwash_jobs j on j.order_id = o.id
     where p.service = 'carwash'
     group by p.id) r;

  select coalesce(jsonb_agg(r order by r.spent desc, r.name), '[]'::jsonb) into v_customers from (
    select u.id, coalesce(u.name, 'Customer') as name,
           coalesce((select b.available from public.wallet_balances b where b.wallet_id = w.id), 0)::int as available,
           coalesce((select b.held from public.wallet_balances b where b.wallet_id = w.id), 0)::int as held,
           coalesce((select sum(le.amount) from public.ledger_entries le where le.wallet_id = w.id and le.kind = 'fund'
                      and le.created_at >= v_from and le.created_at < v_to), 0)::int as deposited,
           coalesce((select sum(o.total) from public.orders o where o.customer_id = u.id and o.escrow_status = 'released'
                      and o.settled_at >= v_from and o.settled_at < v_to), 0)::int as spent
      from public.users u join public.wallets w on w.user_id = u.id
     where u.role = 'customer'
     order by 5 desc limit 50) r;

  v_totals := jsonb_build_object(
    'commission', (select coalesce(sum(commission_amount), 0)::int from public.orders
                    where escrow_status = 'released' and service <> 'carwash' and settled_at >= v_from and settled_at < v_to),
    'carwash_margin', (select coalesce(sum(commission_amount), 0)::int from public.orders
                    where escrow_status = 'released' and service = 'carwash' and settled_at >= v_from and settled_at < v_to),
    'provider_net', (select coalesce(sum(total - commission_amount), 0)::int from public.orders
                    where escrow_status = 'released' and service <> 'carwash' and settled_at >= v_from and settled_at < v_to),
    'held_in_escrow', (select coalesce(sum(total), 0)::int from public.orders where escrow_status = 'held'),
    'platform_wallet', (select coalesce(b.available, 0)::int from public.wallet_balances b where b.wallet_id = public.platform_wallet()),
    'customer_wallets', (select coalesce(sum(b.available), 0)::int from public.wallet_balances b join public.wallets w on w.id = b.wallet_id join public.users u on u.id = w.user_id where u.role = 'customer'),
    'provider_wallets', (select coalesce(sum(b.available + b.held), 0)::int from public.wallet_balances b join public.wallets w on w.id = b.wallet_id join public.users u on u.id = w.user_id where u.role in ('provider', 'partner')));

  return jsonb_build_object('providers', v_providers, 'partners', v_partners, 'customers', v_customers, 'totals', v_totals);
end $$;
revoke all on function public.admin_money(date) from public, anon;
grant execute on function public.admin_money(date) to authenticated;

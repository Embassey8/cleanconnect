-- Laundry: item intake at pickup, tag numbers, price changes the customer must approve, and shop settings.

alter table public.orders
  add column proposed_subtotal integer,
  add column proposed_surcharge integer,
  add column proposed_delivery_fee integer,
  add column proposed_total integer;

alter table public.laundry_settings
  add column capacity_items integer not null default 100 check (capacity_items > 0),
  add column opening_hours text;

-- Tag numbers continue across orders (0412, 0413, ...). Only the server reads or writes this.
create table public.provider_tag_counters (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  next_tag integer not null default 412
);
alter table public.provider_tag_counters enable row level security;

-- Moving on from intake, and approving a changed total, can no longer be plain status changes: they go through
-- submit_intake / respond_price_change (tags, recalculation, and the money held in escrow).
delete from public.order_transitions
 where service = 'laundry'
   and ((from_status = 'received' and to_status in ('awaiting_price_approval', 'cleaning'))
     or (from_status = 'awaiting_price_approval' and to_status = 'cleaning'));
insert into public.order_transitions values ('laundry', 'awaiting_price_approval', 'cancelled', 'customer')
  on conflict do nothing;

-- Shop counts what it received. Same total as booked -> straight to cleaning; otherwise the new total waits
-- for the customer. p_counts maps order_line id -> counted quantity (missing = as booked).
create function public.submit_intake(p_order uuid, p_counts jsonb) returns text
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

  select delivery_fee, free_delivery_over into v_fee, v_free from public.laundry_settings where provider_id = o.provider_id;
  if not found then v_fee := 1500; v_free := 20000; end if;
  -- Keep the express percentage the customer was quoted.
  if o.is_express and o.subtotal > 0 then v_pct := round(o.surcharge * 100.0 / o.subtotal); end if;
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

-- Customer answers a proposed total. Approving moves the difference in or out of escrow; declining cancels
-- and refunds everything (placeholder policy until the cancellation rules are decided).
create function public.respond_price_change(p_order uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_diff int; g uuid := gen_random_uuid(); w uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status <> 'awaiting_price_approval' or o.proposed_total is null then raise exception 'there is no new total to answer'; end if;

  if not p_approve then
    update public.orders set status = 'cancelled', proposed_subtotal = null, proposed_surcharge = null,
           proposed_delivery_fee = null, proposed_total = null where id = p_order;
    perform public.record_event(p_order, 'cancelled');
    perform public.escrow_refund(p_order);
    return;
  end if;

  v_diff := o.proposed_total - o.total;
  w := public.wallet_of(o.customer_id);
  if o.escrow_status = 'held' and v_diff > 0 then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (w, g, 'available', -v_diff, 'hold', p_order), (w, g, 'held', v_diff, 'hold', p_order);
  elsif o.escrow_status = 'held' and v_diff < 0 then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (w, g, 'held', v_diff, 'refund', p_order), (w, g, 'available', -v_diff, 'refund', p_order);
  end if;
  update public.orders set subtotal = proposed_subtotal, surcharge = proposed_surcharge, delivery_fee = proposed_delivery_fee,
         total = proposed_total, status = 'cleaning', proposed_subtotal = null, proposed_surcharge = null,
         proposed_delivery_fee = null, proposed_total = null where id = p_order;
  perform public.record_event(p_order, 'cleaning');
end $$;

revoke all on function public.submit_intake(uuid, jsonb) from public, anon;
revoke all on function public.respond_price_change(uuid, boolean) from public, anon;
grant execute on function public.submit_intake(uuid, jsonb) to authenticated;
grant execute on function public.respond_price_change(uuid, boolean) to authenticated;

-- The next tag number the shop will hand out, so the intake sheet can preview tags while counting.
create function public.my_next_tag(p_provider uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select next_tag from public.provider_tag_counters where provider_id = p_provider and public.owns_provider(p_provider)), 412);
$$;
revoke all on function public.my_next_tag(uuid) from public, anon;
grant execute on function public.my_next_tag(uuid) to authenticated;

-- Phase 3: orders (priced server-side), status transitions, messaging and quotes.
-- No payments yet: orders are created unpaid; escrow/holds arrive in the Money phase.

create type order_status as enum (
  'requested','accepted','declined','expired','upcoming','in_progress','awaiting_confirmation',
  'completed','cancelled','disputed',
  'pickup_scheduled','received','awaiting_price_approval','cleaning','ironing','ready',
  'out_for_delivery','delivered',
  'assigning','assigned','en_route','arrived','condition_checked','washing','awaiting_signoff'
);

create table public.cleaning_extras (
  id text primary key, name text not null, price integer not null check (price >= 0)
);
insert into public.cleaning_extras values
  ('fridge','Inside fridge & oven',3000), ('win','Inside windows',4000),
  ('carpet','Carpet / rug shampoo',5000), ('disinfect','Disinfection',10000),
  ('polish','Floor scrub & polish',15000);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  service service_kind not null,
  customer_id uuid not null references public.users (id),
  provider_id uuid references public.providers (id), -- null for car wash until assigned
  status order_status not null default 'requested',
  scheduled_at timestamptz,
  is_express boolean not null default false,
  property_type property_type,
  cleaning_type cleaning_type,
  frequency text check (frequency in ('once','week','month')),
  carwash_package carwash_package,
  vehicle vehicle_type,
  is_mobile boolean,
  notes text,
  subtotal integer not null default 0,    -- items / areas
  surcharge integer not null default 0,   -- express fee or cleaning-type uplift
  extras_total integer not null default 0,
  discount integer not null default 0,
  delivery_fee integer not null default 0, -- also the car wash service fee
  total integer not null default 0,
  min_applied boolean not null default false,
  commission_rate numeric(4,3) not null default 0.15, -- placeholder, snapshotted per order
  accept_by timestamptz,
  created_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_provider_idx on public.orders (provider_id, created_at desc);

create table public.order_lines (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('laundry','area','extra','quote')),
  item_id text,
  service text,
  label text not null,
  qty integer not null check (qty > 0),
  counted_qty integer,
  unit_price integer not null check (unit_price >= 0), -- snapshot at booking time
  tag text,
  note text
);
create index order_lines_order_idx on public.order_lines (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status order_status not null,
  actor uuid references public.users (id),
  created_at timestamptz not null default now()
);

-- Customer address lives apart so it can be hidden from providers until acceptance.
create table public.order_addresses (
  order_id uuid primary key references public.orders (id) on delete cascade,
  address text not null,
  area text
);

create table public.order_transitions (
  service service_kind not null,
  from_status order_status not null,
  to_status order_status not null,
  actor text not null check (actor in ('provider','customer')),
  primary key (service, from_status, to_status, actor)
);
insert into public.order_transitions values
  ('cleaning','requested','accepted','provider'), ('cleaning','requested','declined','provider'),
  ('cleaning','accepted','in_progress','provider'), ('cleaning','in_progress','awaiting_confirmation','provider'),
  ('cleaning','awaiting_confirmation','completed','customer'), ('cleaning','awaiting_confirmation','disputed','customer'),
  ('cleaning','requested','cancelled','customer'), ('cleaning','accepted','cancelled','customer'),
  ('laundry','requested','accepted','provider'), ('laundry','requested','declined','provider'),
  ('laundry','accepted','pickup_scheduled','provider'), ('laundry','pickup_scheduled','received','provider'),
  ('laundry','received','cleaning','provider'), ('laundry','received','awaiting_price_approval','provider'),
  ('laundry','awaiting_price_approval','cleaning','customer'),
  ('laundry','cleaning','ironing','provider'), ('laundry','cleaning','ready','provider'),
  ('laundry','ironing','ready','provider'), ('laundry','ready','out_for_delivery','provider'),
  ('laundry','out_for_delivery','delivered','provider'), ('laundry','delivered','completed','customer'),
  ('laundry','delivered','disputed','customer'),
  ('laundry','requested','cancelled','customer'), ('laundry','accepted','cancelled','customer'),
  ('laundry','pickup_scheduled','cancelled','customer'),
  ('carwash','requested','cancelled','customer'), ('carwash','assigning','cancelled','customer');

create function public.can_see_order(oid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = oid and (
      o.customer_id = auth.uid()
      or (o.provider_id is not null and public.owns_provider(o.provider_id))
      or public.current_role_is('admin'))
  );
$$;

-- Providers learn the customer's address only after accepting.
create function public.can_see_address(oid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = oid and (
      o.customer_id = auth.uid()
      or public.current_role_is('admin')
      or (o.provider_id is not null and public.owns_provider(o.provider_id)
          and o.status not in ('requested','declined','expired','cancelled')))
  );
$$;

alter table public.cleaning_extras enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.order_addresses enable row level security;
alter table public.order_transitions enable row level security;

create policy extras_read on public.cleaning_extras for select using (true);
create policy transitions_read on public.order_transitions for select using (true);
create policy orders_read on public.orders for select using (public.can_see_order(id));
create policy lines_read on public.order_lines for select using (public.can_see_order(order_id));
create policy events_read on public.order_events for select using (public.can_see_order(order_id));
create policy addresses_read on public.order_addresses for select using (public.can_see_address(order_id));
-- No insert/update policies: orders change only through the functions below.

create function public.record_event(oid uuid, st order_status) returns void
language sql security definer set search_path = '' as $$
  insert into public.order_events (order_id, status, actor) values (oid, st, auth.uid());
$$;
revoke all on function public.record_event(uuid, order_status) from public, anon, authenticated;

-- ---------- Laundry ----------
create function public.create_laundry_order(
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

  update public.orders set subtotal = v_sub, surcharge = v_exp, delivery_fee = v_del, total = v_cleaning + v_del
   where id = v_oid;
  insert into public.order_addresses (order_id, address, area) values (v_oid, trim(p_address), p_area);
  perform public.record_event(v_oid, 'requested');
  return v_oid;
end $$;

-- ---------- Cleaning ----------
create function public.create_cleaning_order(
  p_provider uuid, p_property public.property_type, p_ctype public.cleaning_type, p_frequency text,
  p_areas jsonb, p_extras text[], p_address text, p_area text, p_scheduled timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.cleaning_settings%rowtype;
  a jsonb; x text; v_qty int; v_price int; v_name text; v_xprice int; v_xname text;
  v_mult numeric; v_area_sub int := 0; v_extras int := 0; v_uplift int; v_before int; v_disc int; v_after int; v_total int;
  v_count int := 0; v_oid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'approved' and service = 'cleaning') then
    raise exception 'provider not available';
  end if;
  if public.owns_provider(p_provider) then raise exception 'you cannot book your own service'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'address required'; end if;
  if p_frequency not in ('once','week','month') then raise exception 'invalid frequency'; end if;
  if jsonb_typeof(p_areas) <> 'array' or jsonb_array_length(p_areas) = 0 then raise exception 'no areas selected'; end if;

  select * into s from public.cleaning_settings where provider_id = p_provider;
  if not found then raise exception 'provider has not set prices'; end if;
  if not (p_property = any (s.property_types)) then raise exception 'provider does not clean this property type'; end if;
  v_mult := case p_ctype when 'regular' then s.mult_regular when 'deep' then s.mult_deep
                         when 'move' then s.mult_move else s.mult_post end;

  insert into public.orders (service, customer_id, provider_id, property_type, cleaning_type, frequency, scheduled_at, accept_by)
  values ('cleaning', uid, p_provider, p_property, p_ctype, p_frequency, p_scheduled, now() + interval '15 minutes')
  returning id into v_oid;

  for a in select * from jsonb_array_elements(p_areas) loop
    v_qty := (a ->> 'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'invalid quantity'; end if;
    select cp.price, ca.name into v_price, v_name
      from public.cleaning_prices cp
      join public.cleaning_areas ca on ca.property_type = cp.property_type and ca.id = cp.area_id
      where cp.provider_id = p_provider and cp.property_type = p_property and cp.area_id = a ->> 'area' and cp.offered;
    if v_price is null then raise exception 'not offered: %', a ->> 'area'; end if;
    insert into public.order_lines (order_id, kind, item_id, label, qty, unit_price)
    values (v_oid, 'area', a ->> 'area', v_name, v_qty, v_price);
    v_area_sub := v_area_sub + v_qty * v_price;
    v_count := v_count + v_qty;
  end loop;

  foreach x in array coalesce(p_extras, '{}') loop
    select price, name into v_xprice, v_xname from public.cleaning_extras where id = x;
    if v_xprice is null then raise exception 'unknown extra: %', x; end if;
    insert into public.order_lines (order_id, kind, item_id, label, qty, unit_price)
    values (v_oid, 'extra', x, v_xname, 1, v_xprice);
    v_extras := v_extras + v_xprice;
  end loop;

  v_uplift := round(v_area_sub * (v_mult - 1));
  v_before := round(v_area_sub * v_mult) + v_extras;
  v_disc := round(v_before * case p_frequency when 'week' then 0.10 when 'month' then 0.05 else 0 end);
  v_after := v_before - v_disc;
  v_total := greatest(s.min_order, v_after);

  update public.orders set subtotal = v_area_sub, surcharge = v_uplift, extras_total = v_extras,
         discount = v_disc, total = v_total, min_applied = v_after < s.min_order
   where id = v_oid;
  insert into public.order_addresses (order_id, address, area) values (v_oid, trim(p_address), p_area);
  perform public.record_event(v_oid, 'requested');
  return v_oid;
end $$;

-- ---------- Car wash (managed; not charged until a partner is assigned) ----------
create function public.create_carwash_request(
  p_package public.carwash_package, p_vehicle public.vehicle_type, p_mobile boolean,
  p_address text, p_area text, p_scheduled timestamptz, p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_price int; v_fee int; v_oid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'address required'; end if;
  select customer_price into v_price from public.carwash_rates where package = p_package and vehicle = p_vehicle;
  if v_price is null then raise exception 'this package is not available for that vehicle yet'; end if;
  select service_fee into v_fee from public.carwash_settings;
  insert into public.orders (service, customer_id, carwash_package, vehicle, is_mobile, scheduled_at, notes,
                             subtotal, delivery_fee, total)
  values ('carwash', uid, p_package, p_vehicle, coalesce(p_mobile, true), p_scheduled, p_notes,
          v_price, coalesce(v_fee, 0), v_price + coalesce(v_fee, 0))
  returning id into v_oid;
  insert into public.order_addresses (order_id, address, area) values (v_oid, trim(p_address), p_area);
  perform public.record_event(v_oid, 'requested');
  return v_oid;
end $$;

-- ---------- Status changes ----------
create function public.advance_order(p_order uuid, p_status order_status) returns void
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

  update public.orders set status = p_status where id = p_order;
  perform public.record_event(p_order, p_status);
end $$;

-- Expire unanswered requests (call from a scheduled job with the service role).
create function public.expire_stale_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with e as (
    update public.orders set status = 'expired'
     where status = 'requested' and accept_by is not null and accept_by < now() and service <> 'carwash'
    returning id)
  insert into public.order_events (order_id, status) select id, 'expired' from e;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;

-- ---------- Messaging and quotes ----------
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  unique (customer_id, provider_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null references public.users (id),
  kind text not null default 'text' check (kind in ('text','quote')),
  body text not null default '',
  quote_amount integer check (quote_amount is null or quote_amount > 0),
  quote_status text check (quote_status in ('open','accepted','declined')),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now(),
  check (kind = 'text' or (quote_amount is not null and quote_status is not null))
);
create index messages_thread_idx on public.messages (thread_id, created_at);

create function public.in_thread(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (t.customer_id = auth.uid() or public.owns_provider(t.provider_id))
  );
$$;

alter table public.threads enable row level security;
alter table public.messages enable row level security;
create policy threads_read on public.threads for select using (public.in_thread(id));
create policy messages_read on public.messages for select using (public.in_thread(thread_id));

create function public.start_thread(p_provider uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'approved' and service <> 'carwash') then
    raise exception 'provider not available';
  end if;
  if public.owns_provider(p_provider) then raise exception 'you cannot message yourself'; end if;
  insert into public.threads (customer_id, provider_id) values (uid, p_provider)
  on conflict (customer_id, provider_id) do update set customer_id = excluded.customer_id
  returning id into tid;
  return tid;
end $$;

create function public.send_message(p_thread uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.in_thread(p_thread) then raise exception 'not allowed'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'message is empty'; end if;
  insert into public.messages (thread_id, sender_id, body) values (p_thread, auth.uid(), left(trim(p_body), 2000));
  update public.threads set last_message_at = now() where id = p_thread;
end $$;

create function public.send_quote(p_thread uuid, p_amount integer, p_description text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.threads%rowtype;
begin
  select * into t from public.threads where id = p_thread;
  if not found or auth.uid() is null or not public.owns_provider(t.provider_id) then raise exception 'only the provider can send a quote'; end if;
  if not exists (select 1 from public.providers where id = t.provider_id and service = 'cleaning') then
    raise exception 'quotes are for cleaning providers';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'enter a quote amount'; end if;
  insert into public.messages (thread_id, sender_id, kind, body, quote_amount, quote_status)
  values (p_thread, auth.uid(), 'quote', left(trim(coalesce(p_description, '')), 500), p_amount, 'open');
  update public.threads set last_message_at = now() where id = p_thread;
end $$;

-- Customer accepts a quote: creates an already-accepted cleaning order at the quoted price.
create function public.accept_quote(p_message bigint, p_address text, p_area text, p_scheduled timestamptz)
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
  update public.messages set quote_status = 'accepted', order_id = v_oid where id = p_message;
  return v_oid;
end $$;

create function public.decline_quote(p_message bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages m set quote_status = 'declined'
   where m.id = p_message and m.kind = 'quote' and m.quote_status = 'open'
     and exists (select 1 from public.threads t where t.id = m.thread_id and t.customer_id = auth.uid());
  if not found then raise exception 'quote not found'; end if;
end $$;

-- ---------- Marketplace listing ----------
create view public.provider_listing with (security_invoker = true) as
  select p.id, p.slug, p.display_name, p.type, p.service, p.plan, p.areas,
    case p.service
      when 'laundry' then (select min(price) from public.laundry_prices lp where lp.provider_id = p.id and lp.price is not null)
      else (select min(price) from public.cleaning_prices cp where cp.provider_id = p.id and cp.offered and cp.price is not null)
    end as min_price
  from public.providers p;
grant select on public.provider_listing to anon, authenticated;

-- Execute rights: signed-in users only
do $$
declare f text;
begin
  foreach f in array array[
    'create_laundry_order(uuid, jsonb, boolean, text, text, timestamptz)',
    'create_cleaning_order(uuid, public.property_type, public.cleaning_type, text, jsonb, text[], text, text, timestamptz)',
    'create_carwash_request(public.carwash_package, public.vehicle_type, boolean, text, text, timestamptz, text)',
    'advance_order(uuid, public.order_status)',
    'start_thread(uuid)', 'send_message(uuid, text)', 'send_quote(uuid, integer, text)',
    'accept_quote(bigint, text, text, timestamptz)', 'decline_quote(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Customers read car wash customer prices via the existing view; settings readable by all (fee display).

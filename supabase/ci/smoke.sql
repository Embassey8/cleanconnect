\set ON_ERROR_STOP on
insert into auth.users (email, raw_user_meta_data) values ('a@b.c', '{"name":"Ada"}');
do $$ begin
  assert (select role from users) = 'customer', 'new users must be customers';
  assert (select count(*) from wallets) = 1, 'wallet not created';
end $$;
insert into ledger_entries (wallet_id, group_id, bucket, amount, kind)
  select id, gen_random_uuid(), 'available', 5000, 'fund' from wallets;
do $$ begin
  assert (select available from wallet_balances) = 5000, 'balance wrong';
  begin
    insert into ledger_entries (wallet_id, group_id, bucket, amount, kind)
      select id, gen_random_uuid(), 'available', -9000, 'withdraw' from wallets;
    raise exception 'overdraft was allowed';
  exception when others then
    if sqlerrm not like 'insufficient%' then raise; end if;
  end;
  begin
    update ledger_entries set amount = 1;
    raise exception 'ledger update was allowed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end $$;

-- Phase 2: provider registration + admin review
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'p1@x.ng', '{"name":"Shine"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'p2@x.ng', '{"name":"Shine Two"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@x.ng', '{"name":"Admin"}');
update users set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a1', false);
select register_provider('business', 'cleaning', 'Shine Cleaners', array['Lekki'], 'standard', 'RC1234567');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a2', false);
select register_provider('individual', 'laundry', 'Shine Cleaners', array['Yaba'], 'vip', null, '12345678901', '10987654321');

do $$
declare p1 uuid; p2 uuid;
begin
  select id into p1 from providers where owner_id = '00000000-0000-0000-0000-0000000000a1';
  select id into p2 from providers where owner_id = '00000000-0000-0000-0000-0000000000a2';
  assert (select role from users where id = '00000000-0000-0000-0000-0000000000a1') = 'provider', 'role not elevated';
  assert (select slug from providers where id = p1) = 'shine-cleaners', 'slug 1';
  assert (select slug from providers where id = p2) = 'shine-cleaners-1', 'slug must be made unique';
  assert (select status from providers where id = p1) = 'pending', 'must start pending';
  assert (select plan from providers where id = p2) = 'standard', 'VIP must not be granted at sign-up';
  assert (select status from verifications where provider_id = p1 and kind = 'cac') = 'verified', 'cac';
  assert (select status from verifications where provider_id = p2 and kind = 'bvn') = 'pending', 'bvn pending';
  assert (select provider_ref from verifications where provider_id = p1 and kind = 'cac') = '4567', 'only last 4 stored';
  assert exists (select 1 from cleaning_settings where provider_id = p1), 'cleaning settings';
  assert exists (select 1 from laundry_settings where provider_id = p2), 'laundry settings';

  -- non-admin cannot review
  perform set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a1', false);
  begin
    perform review_provider(p1, true);
    raise exception 'non-admin review allowed';
  exception when others then
    if sqlerrm <> 'admin only' then raise; end if;
  end;

  -- admin: reject needs reason, approve works
  perform set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000ad', false);
  begin
    perform review_provider(p2, false, '');
    raise exception 'rejection without reason allowed';
  exception when others then
    if sqlerrm not like '%reason%' then raise; end if;
  end;
  perform review_provider(p1, true);
  perform review_provider(p2, false, 'Name mismatch');
  assert (select status from providers where id = p1) = 'approved', 'approve';
  assert (select rejection_reason from providers where id = p2) = 'Name mismatch', 'reject reason';

  -- duplicate registration blocked
  perform set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a1', false);
  begin
    perform register_provider('business', 'cleaning', 'Again', '{}', 'standard', 'RC1234567');
    raise exception 'duplicate registration allowed';
  exception when others then
    if sqlerrm not like '%already%' then raise; end if;
  end;
end $$;

-- ===== Phase 3: orders, pricing parity with packages/shared, status rules, privacy, quotes =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'cust@x.ng', '{"name":"Cust"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'p3@x.ng', '{"name":"Wash"}');

select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a3', false);
select register_provider('individual', 'laundry', 'Wash Co', array['Yaba'], 'standard', null, '12345678901', '10987654321');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000ad', false);
select review_provider((select id from providers where slug = 'wash-co'), true);

-- Laundry prices (same numbers as pricing.test.ts)
insert into laundry_prices (provider_id, item_id, service, price)
select p.id, v.item, v.svc::laundry_service, v.price
from providers p, (values ('shirt','dry',1500), ('native','dry',3500), ('trousers','iron',400)) as v(item, svc, price)
where p.slug = 'wash-co';

select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000c1', false);
select create_laundry_order((select id from providers where slug = 'wash-co'),
  '[{"item":"shirt","service":"dry","qty":3},{"item":"native","service":"dry","qty":2},{"item":"trousers","service":"iron","qty":4}]',
  false, '12 Test Street', 'Yaba', now() + interval '1 day') as laundry_std \gset
select set_config('t.laundry_std', :'laundry_std', false);
select create_laundry_order((select id from providers where slug = 'wash-co'),
  '[{"item":"shirt","service":"dry","qty":3},{"item":"native","service":"dry","qty":2},{"item":"trousers","service":"iron","qty":4}]',
  true, '12 Test Street', 'Yaba', null) as laundry_exp \gset
select set_config('t.laundry_exp', :'laundry_exp', false);

do $$ begin
  assert (select total from orders where id = current_setting('t.laundry_std')::uuid) = 14600, 'laundry standard total (TS: 14600)';
  assert (select delivery_fee from orders where id = current_setting('t.laundry_std')::uuid) = 1500, 'delivery fee';
  assert (select total from orders where id = current_setting('t.laundry_exp')::uuid) = 21150, 'laundry express total (TS: 19650 + 1500)';
  assert (select surcharge from orders where id = current_setting('t.laundry_exp')::uuid) = 6550, 'express fee';
  assert (select status from orders where id = current_setting('t.laundry_std')::uuid) = 'requested', 'starts requested';
  assert (select count(*) from order_events where order_id = current_setting('t.laundry_std')::uuid) = 1, 'event recorded';
end $$;

-- A service the provider does not offer must be refused
do $$ begin
  begin
    perform create_laundry_order((select id from providers where slug = 'wash-co'), '[{"item":"agbada","service":"wash","qty":1}]', false, 'x', null, null);
    raise exception 'unoffered item was accepted';
  exception when others then
    if sqlerrm not like 'not offered%' then raise; end if;
  end;
end $$;

-- Cleaning parity: 3 bed @5000, 1 sit @6000, 1 kit @6000, 2 bath @3500; deep + fridge + weekly = 51660
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000ad', false);
insert into cleaning_prices (provider_id, property_type, area_id, price, offered)
select p.id, 'home', v.area, v.price, true
from providers p, (values ('bed',5000), ('sit',6000), ('kit',6000), ('bath',3500)) as v(area, price)
where p.slug = 'shine-cleaners';
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000c1', false);
select create_cleaning_order((select id from providers where slug = 'shine-cleaners'), 'home', 'deep', 'week',
  '[{"area":"bed","qty":3},{"area":"sit","qty":1},{"area":"kit","qty":1},{"area":"bath","qty":2}]',
  array['fridge'], '5 Test Road', 'Lekki', null) as clean_deep \gset
select set_config('t.clean_deep', :'clean_deep', false);
select create_cleaning_order((select id from providers where slug = 'shine-cleaners'), 'home', 'regular', 'once',
  '[{"area":"bath","qty":1}]', '{}', '5 Test Road', 'Lekki', null) as clean_min \gset
select set_config('t.clean_min', :'clean_min', false);
do $$ begin
  assert (select total from orders where id = current_setting('t.clean_deep')::uuid) = 51660, 'cleaning deep+extra+weekly (TS: 51660)';
  assert (select discount from orders where id = current_setting('t.clean_deep')::uuid) = 5740, 'discount';
  assert (select surcharge from orders where id = current_setting('t.clean_deep')::uuid) = 20400, 'deep uplift';
  assert (select total from orders where id = current_setting('t.clean_min')::uuid) = 10000, 'minimum order applies';
  assert (select min_applied from orders where id = current_setting('t.clean_min')::uuid), 'min_applied flag';
end $$;

-- Status rules
do $$ begin
  begin  -- customer cannot accept
    perform advance_order(current_setting('t.clean_deep')::uuid, 'accepted');
    raise exception 'customer accepted own order';
  exception when others then if sqlerrm not like 'cannot move%' then raise; end if; end;
end $$;

-- Row-level security as real users
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select count(*) as n_addr_before from order_addresses where order_id = :'clean_deep' \gset
select count(*) as n_orders_seen from orders \gset
select count(*) as n_other_orders from orders where provider_id <> (select id from providers where slug = 'shine-cleaners') \gset
reset role;
select 1 / (case when :n_addr_before = 0 then 1 else 0 end) as address_hidden_until_accepted;
select 1 / (case when :n_other_orders = 0 then 1 else 0 end) as provider_sees_only_own_orders;

select advance_order(:'clean_deep', 'accepted');  -- provider accepts
set role authenticated;
select count(*) as n_addr_after from order_addresses where order_id = :'clean_deep' \gset
reset role;
select 1 / (case when :n_addr_after = 1 then 1 else 0 end) as address_revealed_after_accept;

-- Other customers cannot see someone else's order
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
select count(*) as n_foreign from orders where id = :'clean_deep' \gset
reset role;
select 1 / (case when :n_foreign = 0 then 1 else 0 end) as orders_are_private;

-- Messaging + quote flow
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000c1', false);
select start_thread((select id from providers where slug = 'shine-cleaners')) as tid \gset
select set_config('t.tid', :'tid', false);
select send_message(:'tid', 'Hello, can you do a 4-bedroom flat?');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a1', false);
select send_quote(:'tid', 45000, '4-bed deep clean');
select id as qid from messages where kind = 'quote' \gset
select set_config('t.qid', :'qid', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000c1', false);
select accept_quote(:qid, '9 Quote Close', 'Lekki', null) as quote_order \gset
select set_config('t.quote_order', :'quote_order', false);
do $$ begin
  assert (select total from orders where id = current_setting('t.quote_order')::uuid) = 45000, 'quote order total';
  assert (select status from orders where id = current_setting('t.quote_order')::uuid) = 'accepted', 'quote order accepted';
  assert (select quote_status from messages where id = current_setting('t.qid')::bigint) = 'accepted', 'quote marked accepted';
  begin
    perform accept_quote(current_setting('t.qid')::bigint, 'again', null, null);
    raise exception 'quote accepted twice';
  exception when others then if sqlerrm not like '%no longer open%' then raise; end if; end;
  begin  -- customers cannot send quotes
    perform send_quote(current_setting('t.tid')::uuid, 1000, 'x');
    raise exception 'customer sent a quote';
  exception when others then if sqlerrm not like 'only the provider%' then raise; end if; end;
end $$;

-- Car wash: rejected until admin sets rates, then priced from the rate table
do $$ begin
  begin
    perform create_carwash_request('full', 'saloon', true, '1 Test', null, null, null);
    raise exception 'car wash allowed without rates';
  exception when others then if sqlerrm not like '%not available%' then raise; end if; end;
end $$;
insert into carwash_rates values ('full', 'saloon', 6000, 4000);
update carwash_settings set service_fee = 500;
select create_carwash_request('full', 'saloon', true, '1 Test', 'Yaba', null, 'gate code 1234') as wash \gset
select set_config('t.wash', :'wash', false);
do $$ begin
  assert (select total from orders where id = current_setting('t.wash')::uuid) = 6500, 'car wash total = price + fee';
  assert (select provider_id from orders where id = current_setting('t.wash')::uuid) is null, 'unassigned';
end $$;

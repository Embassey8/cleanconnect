\set ON_ERROR_STOP on
insert into auth.users (email, raw_user_meta_data) values ('a@b.c', '{"name":"Ada"}');
do $$ begin
  assert (select role from users) = 'customer', 'new users must be customers';
  assert (select count(*) from wallets where kind = 'user') = 1, 'wallet not created';
  assert (select count(*) from wallets where kind = 'platform') = 1, 'platform wallet missing';
end $$;
insert into ledger_entries (wallet_id, group_id, bucket, amount, kind)
  select id, gen_random_uuid(), 'available', 5000, 'fund' from wallets where kind = 'user';
do $$ begin
  assert (select available from wallet_balances where wallet_id = (select id from wallets where kind = 'user')) = 5000, 'balance wrong';
  begin
    insert into ledger_entries (wallet_id, group_id, bucket, amount, kind)
      select id, gen_random_uuid(), 'available', -9000, 'withdraw' from wallets where kind = 'user';
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

-- Phase 4: provider cannot accept until the customer has paid
create function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.sub', u::text, false) $$;
create function pg_temp.bal(u uuid, b text) returns integer language sql as $$
  select coalesce(sum(le.amount), 0)::integer from ledger_entries le join wallets w on w.id = le.wallet_id
  where w.user_id = u and le.bucket = b $$;
create function pg_temp.pbal() returns integer language sql as $$
  select coalesce(sum(le.amount), 0)::integer from ledger_entries le join wallets w on w.id = le.wallet_id
  where w.kind = 'platform' $$;
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  begin
    perform advance_order(current_setting('t.clean_deep')::uuid, 'accepted');
    raise exception 'provider accepted an unpaid order';
  exception when others then if sqlerrm not like 'waiting for the customer%' then raise; end if; end;
end $$;
select set_config('request.jwt.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  begin
    perform pay_order(current_setting('t.clean_deep')::uuid);
    raise exception 'paid with an empty wallet';
  exception when others then if sqlerrm not like 'insufficient%' then raise; end if; end;
end $$;
select mock_fund_wallet(100000);
select pay_order(:'clean_deep');
do $$ begin
  assert (select escrow_status from orders where id = current_setting('t.clean_deep')::uuid) = 'held', 'escrow held';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'available') = 100000 - 51660, 'available reduced by order total';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'held') = 51660, 'held equals order total';
  begin
    perform pay_order(current_setting('t.clean_deep')::uuid);
    raise exception 'paid twice';
  exception when others then if sqlerrm not like '%already paid%' then raise; end if; end;
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
  assert (select escrow_status from orders where id = current_setting('t.quote_order')::uuid) = 'held', 'quote is paid on acceptance';
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

-- ---------- Phase 4: settlement ----------
-- Cleaning: provider works, customer confirms, escrow releases less 15% (7749 of 51660)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select advance_order(:'clean_deep', 'in_progress');
select advance_order(:'clean_deep', 'awaiting_confirmation');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select advance_order(:'clean_deep', 'completed');
do $$ begin
  assert (select commission_amount from orders where id = current_setting('t.clean_deep')::uuid) = 7749, 'cleaning commission (TS: 7749)';
  assert (select escrow_status from orders where id = current_setting('t.clean_deep')::uuid) = 'released', 'released';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'held') = 45000, 'only the quote order is still held';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000a1', 'available') = 51660 - 7749, 'provider credited net of commission';
  assert pg_temp.pbal() = 7749, 'platform earned commission';
end $$;

-- Cancelling a paid order refunds the wallet in full
select advance_order(:'quote_order', 'cancelled');
do $$ begin
  assert (select escrow_status from orders where id = current_setting('t.quote_order')::uuid) = 'refunded', 'refunded';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'held') = 0, 'nothing held';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'available') = 100000 - 51660, 'refund restored balance';
end $$;

-- Laundry: commission only on items, never on delivery (1965 of 14600)
select pay_order(:'laundry_std');
select pg_temp.as_user((select owner_id from providers where slug = 'wash-co'));
select advance_order(:'laundry_std', 'accepted');
select advance_order(:'laundry_std', 'pickup_scheduled');
select advance_order(:'laundry_std', 'received');
select submit_intake(:'laundry_std', '{}');
select advance_order(:'laundry_std', 'ready');
select advance_order(:'laundry_std', 'out_for_delivery');
select advance_order(:'laundry_std', 'delivered');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select advance_order(:'laundry_std', 'completed');
do $$ declare w uuid := (select owner_id from providers where slug = 'wash-co'); begin
  assert (select commission_amount from orders where id = current_setting('t.laundry_std')::uuid) = 1965, 'laundry commission (TS: 1965)';
  assert pg_temp.bal(w, 'available') = 14600 - 1965, 'laundry provider earns net of commission, delivery included';
  assert pg_temp.pbal() = 7749 + 1965, 'platform commission total';
end $$;

-- Provider declines a paid order: refunded
select pay_order(:'laundry_exp');
select pg_temp.as_user((select owner_id from providers where slug = 'wash-co'));
select advance_order(:'laundry_exp', 'declined');
do $$ begin
  assert (select escrow_status from orders where id = current_setting('t.laundry_exp')::uuid) = 'refunded', 'declined order refunded';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'available') = 100000 - 51660 - 14600, 'balance after laundry';
end $$;

-- Auto-confirm releases escrow when the customer stays silent
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select pay_order(:'clean_min');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select advance_order(:'clean_min', 'accepted');
select advance_order(:'clean_min', 'in_progress');
select advance_order(:'clean_min', 'awaiting_confirmation');
do $$ begin
  assert auto_confirm_orders() = 0, 'too early to auto-confirm';
end $$;
update order_events set created_at = now() - interval '3 days'
 where order_id = :'clean_min' and status = 'awaiting_confirmation';
do $$ begin
  assert auto_confirm_orders() = 1, 'auto-confirmed after the window';
  assert (select status from orders where id = current_setting('t.clean_min')::uuid) = 'completed', 'completed';
  assert (select commission_amount from orders where id = current_setting('t.clean_min')::uuid) = 1500, 'commission on minimum order';
  assert auto_confirm_orders() = 0, 'idempotent';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000a1', 'available') = 51660 - 7749 + 10000 - 1500, 'provider total after auto-confirm';
end $$;

-- Disputes: money stays held until an admin decides
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select mock_fund_wallet(50000);
select create_cleaning_order((select id from providers where slug = 'shine-cleaners'), 'home', 'regular', 'once',
  '[{"area":"bath","qty":1}]', '{}', '5 Test Road', 'Lekki', null) as dispute_order \gset
select set_config('t.dispute_order', :'dispute_order', false);
select pay_order(:'dispute_order');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select advance_order(:'dispute_order', 'accepted');
select advance_order(:'dispute_order', 'in_progress');
select advance_order(:'dispute_order', 'awaiting_confirmation');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select advance_order(:'dispute_order', 'disputed');
do $$ begin
  assert (select escrow_status from orders where id = current_setting('t.dispute_order')::uuid) = 'held', 'held while disputed';
  begin
    perform resolve_dispute(current_setting('t.dispute_order')::uuid, 'refund');
    raise exception 'customer resolved a dispute';
  exception when others then if sqlerrm not like 'admin only%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select resolve_dispute(:'dispute_order', 'refund');
do $$ begin
  assert (select escrow_status from orders where id = current_setting('t.dispute_order')::uuid) = 'refunded', 'dispute refunded';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'held') = 0, 'nothing held after dispute';
end $$;

-- Withdrawals (mock payouts)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
do $$ begin
  begin
    perform request_withdrawal(500, 'Test Bank', 'Shine Ltd', '0123456789');
    raise exception 'withdrew below minimum';
  exception when others then if sqlerrm not like 'minimum withdrawal%' then raise; end if; end;
  begin
    perform request_withdrawal(10000000, 'Test Bank', 'Shine Ltd', '0123456789');
    raise exception 'withdrew more than available';
  exception when others then if sqlerrm not like 'insufficient%' then raise; end if; end;
  begin
    perform request_withdrawal(5000, 'Test Bank', 'Shine Ltd', '12345');
    raise exception 'bad account number accepted';
  exception when others then if sqlerrm not like 'account number%' then raise; end if; end;
end $$;
select request_withdrawal(5000, 'Test Bank', 'Shine Ltd', '0123456789') as payout1 \gset
select set_config('t.payout1', :'payout1', false);
do $$ begin
  assert (select account_last4 from payouts where id = current_setting('t.payout1')::uuid) = '6789', 'only last 4 digits stored';
  assert (select eta_hours from payouts where id = current_setting('t.payout1')::uuid) = 72, 'standard payout eta';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000a1', 'available') = 51660 - 7749 + 10000 - 1500 - 5000, 'balance reduced by withdrawal';
  begin
    perform mark_payout(current_setting('t.payout1')::uuid, 'paid');
    raise exception 'provider settled own payout';
  exception when others then if sqlerrm not like 'admin only%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select mark_payout(:'payout1', 'failed');
do $$ begin
  assert (select status from payouts where id = current_setting('t.payout1')::uuid) = 'failed', 'payout failed';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000a1', 'available') = 51660 - 7749 + 10000 - 1500, 'failed payout returns the money';
  begin
    perform mark_payout(current_setting('t.payout1')::uuid, 'paid');
    raise exception 'settled a payout twice';
  exception when others then if sqlerrm not like '%not pending%' then raise; end if; end;
end $$;

-- VIP subscription: paid from the wallet, renews, cancels, lapses
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select subscribe_vip((select id from providers where slug = 'shine-cleaners'));
do $$ begin
  assert (select plan from providers where slug = 'shine-cleaners') = 'vip', 'VIP after payment';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000a1', 'available') = 51660 - 7749 + 10000 - 1500 - 20000, 'VIP fee charged';
  assert pg_temp.pbal() = 7749 + 1965 + 1500 + 20000, 'platform received VIP fee';
  begin
    perform subscribe_vip((select id from providers where slug = 'shine-cleaners'));
    raise exception 'subscribed twice';
  exception when others then if sqlerrm not like 'already a VIP%' then raise; end if; end;
end $$;
select request_withdrawal(1000, 'Test Bank', 'Shine Ltd', '0123456789') as payout2 \gset
select set_config('t.payout2', :'payout2', false);
do $$ begin
  assert (select eta_hours from payouts where id = current_setting('t.payout2')::uuid) = 24, 'VIP gets faster payouts';
end $$;
update vip_subscriptions set current_period_end = now() - interval '1 hour';
do $$ begin
  assert renew_vip_subscriptions() = 1, 'renewed';
  assert (select plan from providers where slug = 'shine-cleaners') = 'vip', 'still VIP after renewal';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000a1', 'available') = 51660 - 7749 + 10000 - 1500 - 20000 - 1000 - 20000, 'renewal charged';
end $$;
select cancel_vip((select id from providers where slug = 'shine-cleaners'));
update vip_subscriptions set current_period_end = now() - interval '1 hour';
do $$ begin
  assert renew_vip_subscriptions() = 0, 'cancelled subscription does not renew';
  assert (select plan from providers where slug = 'shine-cleaners') = 'standard', 'back to standard when VIP lapses';
end $$;

-- Mock payments can be switched off
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
update money_settings set payments_mode = 'live';
do $$ begin
  begin
    perform mock_fund_wallet(1000);
    raise exception 'mock funding worked in live mode';
  exception when others then if sqlerrm not like '%disabled%' then raise; end if; end;
end $$;
update money_settings set payments_mode = 'mock';

-- Ledger integrity: internal movements net to zero; only fund/withdraw/adjustment change the total
do $$ begin
  assert (select count(*) from (
            select group_id from ledger_entries
             where kind in ('hold','release','refund','commission','vip_fee')
             group by group_id having sum(amount) <> 0) bad) = 0, 'every internal movement nets to zero';
  assert (select sum(amount) from ledger_entries)
       = (select sum(amount) from ledger_entries where kind in ('fund','withdraw','adjustment')), 'money only enters or leaves via the boundary kinds';
end $$;

-- Clients cannot write money or reach internal functions
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
set role authenticated;
select count(*) as n_wallets from wallets \gset
select count(*) as n_foreign_ledger from ledger_entries le join wallets w on w.id = le.wallet_id where w.user_id <> '00000000-0000-0000-0000-0000000000c1' \gset
do $$ begin
  begin
    insert into ledger_entries (wallet_id, group_id, bucket, amount, kind)
      select id, gen_random_uuid(), 'available', 99999, 'fund' from wallets limit 1;
    raise exception 'client wrote the ledger';
  exception when others then if sqlerrm like 'client wrote%' then raise; end if; end;
  begin
    perform escrow_release(current_setting('t.clean_deep')::uuid);
    raise exception 'client called an internal function';
  exception when others then if sqlerrm like 'client called%' then raise; end if; end;
  begin
    update orders set escrow_status = 'held' where id = current_setting('t.clean_min')::uuid;
    if found then raise exception 'client edited escrow status'; end if;
  exception when others then if sqlerrm like 'client edited%' then raise; end if; end;
end $$;
reset role;
select 1 / (case when :n_wallets = 1 then 1 else 0 end) as customer_sees_only_own_wallet;
select 1 / (case when :n_foreign_ledger = 0 then 1 else 0 end) as ledger_is_private;

-- ---------- Phase 5: operations ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@x.ng', '{"name":"Sparkle"}'), ('00000000-0000-0000-0000-0000000000c2', 'c2@x.ng', '{"name":"Poor Customer"}'), ('00000000-0000-0000-0000-0000000000d5', 'support@x.ng', '{"name":"Support"}');
update users set role = 'admin', admin_role = 'support' where id = '00000000-0000-0000-0000-0000000000d5';

-- Partner applications: operations approve, support cannot, approval promotes the applicant
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select submit_application('partner', 'Sparkle Wash', '08012345678', 'Yaba', null, null) as app_id \gset
select set_config('t.app_id', :'app_id', false);
do $$ begin
  begin
    perform submit_application('partner', 'Sparkle Wash', '08012345678', 'Yaba', null, null);
    raise exception 'duplicate open application';
  exception when others then if sqlerrm not like '%open application%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
do $$ begin
  begin
    perform advance_application(current_setting('t.app_id')::uuid, 'inspection');
    raise exception 'support admin ran operations';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select advance_application(:'app_id', 'inspection');
do $$ begin
  begin
    perform advance_application(current_setting('t.app_id')::uuid, 'hired');
    raise exception 'staff stage on a partner application';
  exception when others then if sqlerrm not like 'invalid stage%' then raise; end if; end;
  begin
    perform advance_application(current_setting('t.app_id')::uuid, 'rejected');
    raise exception 'rejected without a reason';
  exception when others then if sqlerrm not like '%reason%' then raise; end if; end;
end $$;
select advance_application(:'app_id', 'approved');
do $$ begin
  assert (select role from users where id = '00000000-0000-0000-0000-0000000000e1') = 'partner', 'approved applicant becomes a partner';
  assert (select count(*) from providers where owner_id = '00000000-0000-0000-0000-0000000000e1' and service = 'carwash' and status = 'approved') = 1, 'partner provider created';
  assert (select count(*) from partner_scores ps join providers p on p.id = ps.provider_id where p.owner_id = '00000000-0000-0000-0000-0000000000e1') = 1, 'score row';
  begin
    perform advance_application(current_setting('t.app_id')::uuid, 'rejected', 'late');
    raise exception 'closed application advanced';
  exception when others then if sqlerrm not like '%already closed%' then raise; end if; end;
end $$;
select id as partner_id from providers where owner_id = '00000000-0000-0000-0000-0000000000e1' \gset
select set_config('t.partner_id', :'partner_id', false);

-- Staff pipeline
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
select submit_application('staff', null, '08099999999', 'Lekki', 'Support agent', null) as staff_app \gset
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select advance_application(:'staff_app', 'interview');
select advance_application(:'staff_app', 'hired');
do $$ begin
  assert (select role from users where id = '00000000-0000-0000-0000-0000000000c2') = 'customer', 'hiring staff does not change account role';
end $$;

-- Car wash: no charge before assignment
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform pay_order(current_setting('t.wash')::uuid);
    raise exception 'charged before a partner was assigned';
  exception when others then if sqlerrm not like '%once a partner is assigned%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
do $$ begin
  begin
    perform assign_carwash(current_setting('t.wash')::uuid, current_setting('t.partner_id')::uuid);
    raise exception 'support admin assigned a job';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select assign_carwash(:'wash', :'partner_id');
do $$ begin
  assert (select status from orders where id = current_setting('t.wash')::uuid) = 'assigning', 'offered to partner';
  assert (select partner_payout from carwash_jobs where order_id = current_setting('t.wash')::uuid) = 4000, 'payout snapshot (rate 4000)';
  assert (select offer_expires_at from carwash_jobs where order_id = current_setting('t.wash')::uuid) > now() + interval '9 minutes', '10 minute window';
end $$;

-- Partner sees the job but not the customer's address until accepting; customers never see the payout
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
set role authenticated;
select count(*) as n_cw_orders from orders where id = :'wash' \gset
select count(*) as n_cw_addr from order_addresses where order_id = :'wash' \gset
select count(*) as n_cw_jobs from carwash_jobs \gset
reset role;
select 1 / (case when :n_cw_orders = 1 then 1 else 0 end) as partner_sees_offer;
select 1 / (case when :n_cw_addr = 0 then 1 else 0 end) as partner_address_hidden_until_accept;
select 1 / (case when :n_cw_jobs = 1 then 1 else 0 end) as partner_sees_own_payout;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
set role authenticated;
select count(*) as n_cust_jobs from carwash_jobs \gset
reset role;
select 1 / (case when :n_cust_jobs = 0 then 1 else 0 end) as customer_cannot_see_payout;

-- Accepting charges the customer from the wallet automatically
select pg_temp.bal('00000000-0000-0000-0000-0000000000c1'::uuid, 'available') as before_wash \gset
select set_config('t.before_wash', :'before_wash', false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select respond_carwash_offer(:'wash', true);
do $$ begin
  assert (select status from orders where id = current_setting('t.wash')::uuid) = 'assigned', 'assigned';
  assert (select escrow_status from orders where id = current_setting('t.wash')::uuid) = 'held', 'charged on acceptance';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'available') = current_setting('t.before_wash')::integer - 6500, 'wallet charged 6500';
end $$;
select count(*) as n_cw_addr2 from order_addresses where order_id = :'wash' \gset
set role authenticated;
select count(*) as n_cw_addr3 from order_addresses where order_id = :'wash' \gset
reset role;
select 1 / (case when :n_cw_addr3 = 1 then 1 else 0 end) as partner_address_revealed_after_accept;

-- A customer with no money: the partner cannot confirm; expired and declined offers return to the queue
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
select create_carwash_request('full', 'saloon', false, '3 Test', 'Yaba', null, null) as wash3 \gset
select set_config('t.wash3', :'wash3', false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select assign_carwash(:'wash3', :'partner_id');
do $$ begin
  assert (select partner_payout from carwash_jobs where order_id = current_setting('t.wash3')::uuid) = 4000, 'drop-off has no mobile bonus';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
do $$ begin
  begin
    perform respond_carwash_offer(current_setting('t.wash3')::uuid, true);
    raise exception 'accepted a job the customer cannot pay for';
  exception when others then if sqlerrm not like '%wallet balance is too low%' then raise; end if; end;
  assert (select status from orders where id = current_setting('t.wash3')::uuid) = 'assigning', 'still offered';
end $$;
update carwash_jobs set offer_expires_at = now() - interval '1 minute' where order_id = :'wash3';
do $$ begin
  begin
    perform respond_carwash_offer(current_setting('t.wash3')::uuid, true);
    raise exception 'accepted an expired offer';
  exception when others then if sqlerrm not like '%expired%' then raise; end if; end;
  assert expire_carwash_offers() = 1, 'expired offer returned to the queue';
  assert (select status from orders where id = current_setting('t.wash3')::uuid) = 'requested', 'back to requested';
  assert (select provider_id from orders where id = current_setting('t.wash3')::uuid) is null, 'unassigned';
  assert (select count(*) from carwash_jobs where order_id = current_setting('t.wash3')::uuid) = 0, 'job cleared';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select assign_carwash(:'wash3', :'partner_id');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select respond_carwash_offer(:'wash3', false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
select advance_order(:'wash3', 'cancelled');
do $$ begin
  assert (select status from orders where id = current_setting('t.wash3')::uuid) = 'cancelled', 'customer cancelled unassigned request';
end $$;

-- Job steps, sign-off, payout set aside, then weekly settlement
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select advance_order(:'wash', 'en_route');
select advance_order(:'wash', 'arrived');
select advance_order(:'wash', 'condition_checked');
select advance_order(:'wash', 'washing');
select advance_order(:'wash', 'awaiting_signoff');
select pg_temp.pbal() as pbal_before \gset
select set_config('t.pbal_before', :'pbal_before', false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select advance_order(:'wash', 'completed');
do $$ begin
  assert (select commission_amount from orders where id = current_setting('t.wash')::uuid) = 2500, 'platform margin = 6500 - 4000';
  assert pg_temp.pbal() = current_setting('t.pbal_before')::integer + 2500, 'platform received its margin';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000e1', 'held') = 4000, 'partner payout set aside until Friday';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000e1', 'available') = 0, 'nothing withdrawable before settlement';
  assert (select jobs_completed from partner_scores where provider_id = current_setting('t.partner_id')::uuid) = 1, 'job counted';
  assert (select on_time_jobs from partner_scores where provider_id = current_setting('t.partner_id')::uuid) = 1, 'unscheduled job counts as on time';
  assert (select offers_total from partner_scores where provider_id = current_setting('t.partner_id')::uuid) = 3, 'three offers';
  assert (select offers_accepted from partner_scores where provider_id = current_setting('t.partner_id')::uuid) = 1, 'one accepted';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
do $$ begin
  begin
    perform admin_settle_partners();
    raise exception 'support admin settled partner payouts';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select admin_settle_partners() as settled \gset
select 1 / (case when :settled = 1 then 1 else 0 end) as one_job_settled;
do $$ begin
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000e1', 'held') = 0 and pg_temp.bal('00000000-0000-0000-0000-0000000000e1', 'available') = 4000, 'payout moved to available';
  assert admin_settle_partners() = 0, 'settlement is idempotent';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select request_withdrawal(2000, 'Test Bank', 'Sparkle Wash', '0123456789');
do $$ begin
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000e1', 'available') = 2000, 'partner can withdraw settled earnings';
end $$;

-- Support tickets
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select create_ticket('Partner was late', 'He arrived an hour after the slot.', 'order', :'wash') as tkt \gset
select set_config('t.tkt', :'tkt', false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
do $$ begin
  begin
    perform create_ticket('Not mine', 'x', 'order', current_setting('t.wash')::uuid);
    raise exception 'ticket on someone else''s order';
  exception when others then if sqlerrm not like 'order not found%' then raise; end if; end;
  begin
    perform reply_ticket(current_setting('t.tkt')::uuid, 'hello');
    raise exception 'replied to someone else''s ticket';
  exception when others then if sqlerrm not like 'ticket not found%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
select reply_ticket(:'tkt', 'Internal: check GPS log', true);
select reply_ticket(:'tkt', 'Sorry about that, we are looking into it.');
do $$ begin
  assert (select status from support_tickets where id = current_setting('t.tkt')::uuid) = 'pending', 'waiting on customer after a public reply';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
set role authenticated;
select count(*) as n_visible_msgs from ticket_messages where ticket_id = :'tkt' \gset
select count(*) as n_visible_tickets from support_tickets \gset
reset role;
select 1 / (case when :n_visible_msgs = 2 then 1 else 0 end) as internal_notes_hidden;
select 1 / (case when :n_visible_tickets = 1 then 1 else 0 end) as tickets_private;
select reply_ticket(:'tkt', 'Thanks');
do $$ begin
  assert (select status from support_tickets where id = current_setting('t.tkt')::uuid) = 'open', 'customer reply reopens';
  begin
    perform update_ticket(current_setting('t.tkt')::uuid, 'resolved', null, null);
    raise exception 'customer resolved own ticket';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
select update_ticket(:'tkt', 'resolved', 'high', '00000000-0000-0000-0000-0000000000d5'::uuid);
do $$ begin
  assert (select status || priority from support_tickets where id = current_setting('t.tkt')::uuid) = 'resolvedhigh', 'ticket updated';
  assert (select assignee_id from support_tickets where id = current_setting('t.tkt')::uuid) = '00000000-0000-0000-0000-0000000000d5'::uuid, 'assigned';
end $$;
-- VIP providers get priority support
update providers set plan = 'vip' where slug = 'shine-cleaners';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select create_ticket('Payout question', 'When is my payout?', 'payment', null) as vip_tkt \gset
update providers set plan = 'standard' where slug = 'shine-cleaners';
do $$ begin
  assert (select priority from support_tickets where subject = 'Payout question') = 'high', 'VIP ticket is high priority';
end $$;

-- Finance and overview
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
do $$ begin
  begin
    perform admin_finance(current_date);
    raise exception 'support admin read finance';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
  assert (admin_overview() ->> 'partners')::int = 1, 'overview visible to support';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select add_finance_entry('expense', 'salaries', 50000, current_date, 'Staff');
select add_finance_entry('income', 'advertising', 10000, current_date, 'Banner');
do $$ declare f jsonb := admin_finance(current_date); begin
  assert (f ->> 'marketplace_commission')::int = 7749 + 1965 + 1500, 'marketplace commission (cleaning + laundry)';
  assert (f ->> 'carwash_revenue')::int = 6500, 'car wash revenue';
  assert (f ->> 'partner_payouts')::int = 4000, 'partner payouts';
  assert (f ->> 'vip')::int = 40000, 'VIP income (subscribe + renewal)';
  assert (f ->> 'advertising')::int = 10000, 'advertising income';
  assert (f -> 'expenses' ->> 'salaries')::int = 50000, 'salaries';
  assert (admin_run_jobs() ? 'offers_expired'), 'job runner includes offer expiry';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform admin_overview();
    raise exception 'customer read the admin overview';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;

-- Ledger integrity still holds after payouts
do $$ begin
  assert (select count(*) from (
            select group_id from ledger_entries
             where kind in ('hold','release','refund','commission','vip_fee','payout')
             group by group_id having sum(amount) <> 0) bad) = 0, 'every internal movement nets to zero';
  assert (select sum(amount) from ledger_entries)
       = (select sum(amount) from ledger_entries where kind in ('fund','withdraw','adjustment')), 'money only enters or leaves via the boundary kinds';
end $$;

-- ---------- Phase 6: trust and media ----------
-- Job photos: provider only, valid path, active order
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select set_config('t.m1', register_media(:'clean_deep', :'clean_deep' || '/a.jpg', 'before')::text, false);
select set_config('t.m2', register_media(:'clean_deep', :'clean_deep' || '/b.jpg', 'after')::text, false);
do $$ begin
  begin
    perform register_media(current_setting('t.clean_deep')::uuid, 'elsewhere/a.jpg', 'before');
    raise exception 'accepted a photo path outside the order folder';
  exception when others then if sqlerrm not like 'invalid photo path%' then raise; end if; end;
  begin
    perform register_media(current_setting('t.dispute_order')::uuid, current_setting('t.dispute_order') || '/a.jpg', 'before');
    raise exception 'photo on a cancelled order';
  exception when others then if sqlerrm not like 'you cannot add photos%' then raise; end if; end;
  begin
    perform register_media(current_setting('t.laundry_std')::uuid, current_setting('t.laundry_std') || '/a.jpg', 'before');
    raise exception 'photo on another provider''s order';
  exception when others then if sqlerrm not like 'you cannot add photos%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
do $$ begin
  begin
    perform register_media(current_setting('t.clean_deep')::uuid, current_setting('t.clean_deep') || '/c.jpg', 'before');
    raise exception 'stranger added a photo';
  exception when others then if sqlerrm not like 'you cannot add photos%' then raise; end if; end;
end $$;

-- Photos are private until the customer consents
set role authenticated;
select count(*) as n_gallery_before from public_gallery \gset
select count(*) as n_stranger_media from media \gset
reset role;
select 1 / (case when :n_gallery_before = 0 then 1 else 0 end) as nothing_public_without_consent;
select 1 / (case when :n_stranger_media = 0 then 1 else 0 end) as private_photos_hidden_from_strangers;
do $$ begin
  begin
    perform set_media_public(current_setting('t.m1')::uuid, true);
    raise exception 'stranger shared a photo';
  exception when others then if sqlerrm not like 'only the customer%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
do $$ begin
  begin
    perform set_media_public(current_setting('t.m1')::uuid, true);
    raise exception 'provider published their own photo';
  exception when others then if sqlerrm not like 'only the customer%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select set_media_public(current_setting('t.m1')::uuid, true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
set role authenticated;
select count(*) as n_gallery_after from public_gallery \gset
select count(*) as n_visible_media from media \gset
reset role;
select 1 / (case when :n_gallery_after = 1 then 1 else 0 end) as consented_photo_is_public;
select 1 / (case when :n_visible_media = 1 then 1 else 0 end) as only_consented_photo_visible;
do $$ begin
  assert (select count(*) from public_gallery where service = 'cleaning' and phase = 'before') = 1, 'gallery has phase and service';
end $$;

-- Moderation hides a photo from everyone but admins
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5'::uuid);
select hide_media(current_setting('t.m1')::uuid, true);
do $$ begin
  assert (select count(*) from public_gallery) = 0, 'hidden photo leaves the gallery';
  perform hide_media(current_setting('t.m1')::uuid, false);
  assert (select count(*) from public_gallery) = 1, 'unhidden photo returns';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform hide_media(current_setting('t.m1')::uuid, true);
    raise exception 'customer moderated a photo';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;

-- Reviews: only completed orders, once each, valid scores
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
do $$ begin
  begin
    perform create_review(current_setting('t.clean_deep')::uuid, 5, 5, 5, 5, 5, 'x');
    raise exception 'stranger reviewed an order';
  exception when others then if sqlerrm not like 'order not found%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform create_review(current_setting('t.dispute_order')::uuid, 5, 5, 5, 5, 5, 'x');
    raise exception 'reviewed an order that never completed';
  exception when others then if sqlerrm not like '%once it is completed%' then raise; end if; end;
  begin
    perform create_review(current_setting('t.clean_min')::uuid, 6, 5, 5, 5, 5, 'x');
    raise exception 'rating of 6 accepted';
  exception when others then if sqlerrm not like '%between 1 and 5%' then raise; end if; end;
end $$;
select create_review(:'clean_deep', 5, 5, 4, 5, 4, 'Spotless, thank you!') as rv1 \gset
select set_config('t.rv1', :'rv1', false);
select create_review(:'clean_min', 4, 4, 4, 4, 4, '') as rv2 \gset
select create_review(:'wash', 5, 5, 5, 5, 5, 'Great wash') as rv3 \gset
do $$ begin
  begin
    perform create_review(current_setting('t.clean_deep')::uuid, 1, 1, 1, 1, 1, 'again');
    raise exception 'reviewed twice';
  exception when others then if sqlerrm not like '%already reviewed%' then raise; end if; end;
end $$;

-- Review photos: customer only, up to 4, public with the review
select register_media(:'clean_deep', :'clean_deep' || '/r1.jpg', 'general', :'rv1'::uuid);
select register_media(:'clean_deep', :'clean_deep' || '/r2.jpg', 'general', :'rv1'::uuid);
select register_media(:'clean_deep', :'clean_deep' || '/r3.jpg', 'general', :'rv1'::uuid);
select register_media(:'clean_deep', :'clean_deep' || '/r4.jpg', 'general', :'rv1'::uuid);
do $$ begin
  begin
    perform register_media(current_setting('t.clean_deep')::uuid, current_setting('t.clean_deep') || '/r5.jpg', 'general', current_setting('t.rv1')::uuid);
    raise exception 'fifth review photo accepted';
  exception when others then if sqlerrm not like 'you cannot add photos%' then raise; end if; end;
  assert (select count(*) from media where review_id = current_setting('t.rv1')::uuid and is_public) = 4, 'review photos are public';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
do $$ begin
  begin
    perform register_media(current_setting('t.clean_deep')::uuid, current_setting('t.clean_deep') || '/r6.jpg', 'general', current_setting('t.rv1')::uuid);
    raise exception 'provider added a photo to a customer review';
  exception when others then if sqlerrm not like 'you cannot add photos%' then raise; end if; end;
  begin
    perform reply_review(current_setting('t.rv1')::uuid, '');
    raise exception 'empty reply accepted';
  exception when others then if sqlerrm not like 'reply required%' then raise; end if; end;
end $$;
select reply_review(:'rv1'::uuid, 'Thank you, see you next time!');
do $$ begin
  begin
    perform reply_review(current_setting('t.rv1')::uuid, 'again');
    raise exception 'replied twice';
  exception when others then if sqlerrm not like '%already replied%' then raise; end if; end;
  assert (select reply from reviews where id = current_setting('t.rv1')::uuid) = 'Thank you, see you next time!', 'reply saved';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform reply_review(current_setting('t.rv1')::uuid, 'I reply to myself');
    raise exception 'customer replied as provider';
  exception when others then if sqlerrm not like 'review not found%' then raise; end if; end;
end $$;

-- Public stats and RLS on reviews
do $$ declare s record; begin
  select * into s from provider_stats where provider_id = (select id from providers where slug = 'shine-cleaners');
  assert s.rating_count = 2, 'two reviews';
  assert s.rating_avg = 4.5, 'average rating 4.5';
  assert s.c5 = 1 and s.c4 = 1, 'distribution';
  assert s.jobs_completed = 2, 'completed jobs counted';
  assert not exists (select 1 from provider_stats where provider_id = current_setting('t.partner_id')::uuid), 'car wash partners are not in public stats';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
set role authenticated;
select count(*) as n_public_reviews from reviews where order_id = :'clean_deep' \gset
select count(*) as n_partner_reviews from reviews where order_id = :'wash' \gset
reset role;
select 1 / (case when :n_public_reviews = 1 then 1 else 0 end) as public_reviews_readable;
select 1 / (case when :n_partner_reviews = 0 then 1 else 0 end) as partner_reviews_private;

-- Saved providers and photos
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
select toggle_saved_provider((select id from providers where slug = 'shine-cleaners')) as saved1 \gset
select toggle_saved_media(current_setting('t.m1')::uuid) as saved_photo \gset
do $$ begin
  assert (select count(*) from saved_providers where user_id = '00000000-0000-0000-0000-0000000000c2') = 1, 'provider saved';
  assert toggle_saved_provider((select id from providers where slug = 'shine-cleaners')) = false, 'toggling again unsaves';
  begin
    perform toggle_saved_provider(current_setting('t.partner_id')::uuid);
    raise exception 'saved an unlisted partner';
  exception when others then if sqlerrm not like 'provider not found%' then raise; end if; end;
  begin  -- m2 was never shared
    perform toggle_saved_media(current_setting('t.m2')::uuid);
    raise exception 'saved a private photo';
  exception when others then if sqlerrm not like 'photo not found%' then raise; end if; end;
end $$;

-- Partner quality feeds the partner score
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select register_media(:'wash', :'wash' || '/p1.jpg', 'condition');
do $$ declare q record; begin
  select * into q from partner_quality where provider_id = current_setting('t.partner_id')::uuid;
  assert q.rating_avg = 5.00 and q.rating_count = 1, 'partner rating';
  assert q.jobs_completed = 1 and q.photo_jobs = 1, 'partner photo compliance';
end $$;

-- ---------- Partner availability ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select create_carwash_request('full', 'saloon', true, '9 Avail Road', 'Yaba', null, null) as wash_avail \gset
select set_config('t.wash_avail', :'wash_avail', false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
do $$ begin
  begin
    perform set_availability(false);
    assert (select accepting_jobs from providers where id = current_setting('t.partner_id')::uuid) = false, 'partner paused';
  end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
do $$ begin
  begin
    perform assign_carwash(current_setting('t.wash_avail')::uuid, current_setting('t.partner_id')::uuid);
    raise exception 'offered a job to a paused partner';
  exception when others then if sqlerrm not like '%not accepting jobs%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'::uuid);
select set_availability(true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'::uuid);
select assign_carwash(:'wash_avail', :'partner_id');
do $$ begin
  assert (select status from orders where id = current_setting('t.wash_avail')::uuid) = 'assigning', 'offer made once the partner is back';
end $$;
-- Only partners can use the switch
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform set_availability(false);
    raise exception 'a customer changed partner availability';
  exception when others then if sqlerrm not like 'only providers%' then raise; end if; end;
end $$;

-- Offline cleaning/laundry providers cannot receive new requests
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select set_availability(false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
do $$ begin
  begin
    perform create_cleaning_order((select id from providers where slug = 'shine-cleaners'), 'home', 'regular', 'once',
      '[{"area":"bath","qty":1}]', '{}', '5 Test Road', 'Lekki', null);
    raise exception 'order placed with an offline provider';
  exception when others then if sqlerrm not like '%not taking new orders%' then raise; end if; end;
  assert (select accepting_jobs from provider_listing where slug = 'shine-cleaners') = false, 'listing shows offline';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1'::uuid);
select set_availability(true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select create_cleaning_order((select id from providers where slug = 'shine-cleaners'), 'home', 'regular', 'once',
  '[{"area":"bath","qty":1}]', '{}', '5 Test Road', 'Lekki', null) as back_online \gset

-- ---------- Laundry intake ----------
-- Booked: 3 shirts dry (1500), 2 native dry (3500), 4 trousers iron (400) = 13100 + 1500 delivery = 14600 (standard)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select mock_fund_wallet(100000);
select create_laundry_order((select id from providers where slug = 'wash-co'),
  '[{"item":"shirt","service":"dry","qty":3},{"item":"native","service":"dry","qty":2},{"item":"trousers","service":"iron","qty":4}]',
  false, '12 Intake St', 'Yaba', now() + interval '1 day') as li1 \gset
select set_config('t.li1', :'li1', false);
select pay_order(:'li1');
select pg_temp.as_user((select owner_id from providers where slug = 'wash-co')::uuid);
select advance_order(:'li1', 'accepted');
select advance_order(:'li1', 'pickup_scheduled');
select advance_order(:'li1', 'received');
do $$ begin
  begin  -- the old shortcuts are gone: a plain status change cannot skip the intake
    perform advance_order(current_setting('t.li1')::uuid, 'awaiting_price_approval');
    raise exception 'provider skipped intake';
  exception when others then if sqlerrm not like 'cannot move%' then raise; end if; end;
  begin
    perform advance_order(current_setting('t.li1')::uuid, 'cleaning');
    raise exception 'provider skipped intake straight to cleaning';
  exception when others then if sqlerrm not like 'cannot move%' then raise; end if; end;
  perform set_config('t.tag0', my_next_tag((select id from providers where slug = 'wash-co'))::text, false);
  assert current_setting('t.tag0')::int >= 412, 'tags start at 0412 or later (an earlier order already used some)';
end $$;
-- Same counts as booked: straight to cleaning, tags assigned in order
select submit_intake(:'li1', '{}') as r1 \gset
do $$ begin
  assert (select status from orders where id = current_setting('t.li1')::uuid) = 'cleaning', 'same total goes to cleaning';
  assert (select count(*) from order_lines where order_id = current_setting('t.li1')::uuid and tag is not null) = 3, 'tags assigned';
  assert (select tag from order_lines where order_id = current_setting('t.li1')::uuid and item_id = 'shirt') = lpad(current_setting('t.tag0'), 4, '0') || '–' || lpad((current_setting('t.tag0')::int + 2)::text, 4, '0'), 'first tags start at the next number';
  assert (select tag from order_lines where order_id = current_setting('t.li1')::uuid and item_id = 'native') = lpad((current_setting('t.tag0')::int + 3)::text, 4, '0') || '–' || lpad((current_setting('t.tag0')::int + 4)::text, 4, '0'), 'tags continue';
  assert (select tag from order_lines where order_id = current_setting('t.li1')::uuid and item_id = 'trousers') = lpad((current_setting('t.tag0')::int + 5)::text, 4, '0') || '–' || lpad((current_setting('t.tag0')::int + 8)::text, 4, '0'), 'tags continue';
  assert my_next_tag((select id from providers where slug = 'wash-co')) = current_setting('t.tag0')::int + 9, 'counter moves past the tags handed out';
end $$;

-- A second order where the shop counts one extra shirt: +1500 -> needs approval, customer pays the difference
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select create_laundry_order((select id from providers where slug = 'wash-co'),
  '[{"item":"shirt","service":"dry","qty":3},{"item":"native","service":"dry","qty":2},{"item":"trousers","service":"iron","qty":4}]',
  false, '12 Intake St', 'Yaba', null) as li2 \gset
select set_config('t.li2', :'li2', false);
select pay_order(:'li2');
select pg_temp.bal('00000000-0000-0000-0000-0000000000c1'::uuid, 'available') as bal_before \gset
select set_config('t.bal_before', :'bal_before', false);
select pg_temp.as_user((select owner_id from providers where slug = 'wash-co')::uuid);
select advance_order(:'li2', 'accepted');
select advance_order(:'li2', 'pickup_scheduled');
select advance_order(:'li2', 'received');
select id as shirt_line from order_lines where order_id = :'li2' and item_id = 'shirt' \gset
select set_config('t.shirt_line', :'shirt_line', false);
select submit_intake(:'li2', jsonb_build_object(:'shirt_line', 4)) as r2 \gset
do $$ begin
  assert (select status from orders where id = current_setting('t.li2')::uuid) = 'awaiting_price_approval', 'changed total waits for the customer';
  assert (select proposed_total from orders where id = current_setting('t.li2')::uuid) = 16100, 'proposed total = 14600 + 1500 (TS parity)';
  assert (select total from orders where id = current_setting('t.li2')::uuid) = 14600, 'booked total unchanged until approved';
  begin
    perform submit_intake(current_setting('t.li2')::uuid, '{}');
    raise exception 'intake recorded twice';
  exception when others then if sqlerrm not like '%received order%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2'::uuid);
do $$ begin
  begin
    perform respond_price_change(current_setting('t.li2')::uuid, true);
    raise exception 'stranger answered a price change';
  exception when others then if sqlerrm not like 'not allowed%' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select respond_price_change(:'li2', true);
do $$ begin
  assert (select status from orders where id = current_setting('t.li2')::uuid) = 'cleaning', 'approved -> cleaning';
  assert (select total from orders where id = current_setting('t.li2')::uuid) = 16100, 'order total updated';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'available') = current_setting('t.bal_before')::integer - 1500, 'customer paid the 1500 difference';
  assert (select proposed_total from orders where id = current_setting('t.li2')::uuid) is null, 'proposal cleared';
end $$;
-- Finish it: commission follows the counted items (14600 * 15% = 2190), not delivery
select pg_temp.as_user((select owner_id from providers where slug = 'wash-co')::uuid);
select advance_order(:'li2', 'ready');
select advance_order(:'li2', 'out_for_delivery');
select advance_order(:'li2', 'delivered');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select advance_order(:'li2', 'completed');
do $$ begin
  assert (select commission_amount from orders where id = current_setting('t.li2')::uuid) = 2190, 'commission on the counted items only (15% of 14600)';
end $$;

-- A third order: fewer items counted (-1500 -> refund the difference); a fourth: customer declines -> full refund
select create_laundry_order((select id from providers where slug = 'wash-co'),
  '[{"item":"shirt","service":"dry","qty":3},{"item":"native","service":"dry","qty":2},{"item":"trousers","service":"iron","qty":4}]',
  false, '12 Intake St', 'Yaba', null) as li3 \gset
select set_config('t.li3', :'li3', false);
select pay_order(:'li3');
select pg_temp.bal('00000000-0000-0000-0000-0000000000c1'::uuid, 'available') as bal3 \gset
select set_config('t.bal3', :'bal3', false);
select pg_temp.as_user((select owner_id from providers where slug = 'wash-co')::uuid);
select advance_order(:'li3', 'accepted');
select advance_order(:'li3', 'pickup_scheduled');
select advance_order(:'li3', 'received');
select id as shirt3 from order_lines where order_id = :'li3' and item_id = 'shirt' \gset
select set_config('t.shirt3', :'shirt3', false);
select submit_intake(:'li3', jsonb_build_object(:'shirt3', 2)) as r3 \gset
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1'::uuid);
select respond_price_change(:'li3', false);
do $$ begin
  assert (select status from orders where id = current_setting('t.li3')::uuid) = 'cancelled', 'declined -> cancelled';
  assert (select escrow_status from orders where id = current_setting('t.li3')::uuid) = 'refunded', 'declined -> refunded';
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000c1', 'available') = current_setting('t.bal3')::integer + 14600, 'full refund after decline';
end $$;

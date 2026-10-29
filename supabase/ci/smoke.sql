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
select advance_order(:'laundry_std', 'cleaning');
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

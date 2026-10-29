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

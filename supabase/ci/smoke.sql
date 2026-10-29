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

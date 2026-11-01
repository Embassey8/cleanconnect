-- Providers and car wash partners earn and withdraw; only customers (and admins) top up a wallet.
create or replace function public.mock_fund_wallet(p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.money_settings%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.users where id = uid and role in ('provider', 'partner')) then
    raise exception 'providers cannot add money to their wallet';
  end if;
  select * into s from public.money_settings;
  if s.payments_mode <> 'mock' then raise exception 'mock payments are disabled'; end if;
  if p_amount is null or p_amount < s.min_funding or p_amount > s.max_funding then
    raise exception 'amount must be between % and %', s.min_funding, s.max_funding;
  end if;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, reference)
  values (public.wallet_of(uid), gen_random_uuid(), 'available', p_amount, 'fund', 'mock_' || gen_random_uuid()::text);
end $$;

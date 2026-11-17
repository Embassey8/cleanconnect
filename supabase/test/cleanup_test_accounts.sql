-- Removes the three test accounts and everything they own. Run in the Supabase SQL editor.
-- The ledger is append-only, so its guard triggers are bypassed for these rows only.
do $$
declare ids uuid[]; begin
  select array_agg(id) into ids from auth.users where email like '%@cleanconnect.test';
  set local session_replication_role = replica;  -- skip append-only/guard triggers
  delete from public.ledger_entries where wallet_id in (select id from public.wallets where user_id = any(ids));
  delete from public.providers where owner_id = any(ids);
  delete from auth.users where id = any(ids);     -- cascades to users, wallets, profiles
end $$;

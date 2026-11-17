-- TEST ACCOUNTS for a hosted Supabase project. Idempotent. Remove with cleanup_test_accounts.sql.
-- Password for all three: Demo-Pass-1234  (change it, or delete these accounts, before going live)
do $$
declare
  r record; uid uuid; pid uuid; wid uuid;
begin
  for r in select * from (values
    ('testuser@cleanconnect.test','Test User','customer'),
    ('testservice@cleanconnect.test','Test Service','provider'),
    ('testadmin@cleanconnect.test','Test Admin','admin')) v(email,name,role)
  loop
    select id into uid from auth.users where email = r.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
        confirmation_token,recovery_token,email_change_token_new,email_change)
      values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',r.email,
        extensions.crypt('Demo-Pass-1234', extensions.gen_salt('bf')),now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('name',r.name),now(),now(),'','','','');
      insert into auth.identities (id,user_id,provider_id,provider,identity_data,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),uid,uid::text,'email',
        jsonb_build_object('sub',uid::text,'email',r.email,'email_verified',true),now(),now(),now());
    end if;
    update public.users set role = r.role::user_role, name = r.name where id = uid;
  end loop;

  -- Test service: approved cleaning provider with prices
  select id into uid from auth.users where email = 'testservice@cleanconnect.test';
  select id into pid from public.providers where slug = 'test-service';
  if pid is null then
    insert into public.providers (owner_id,type,service,status,approved_at,slug,display_name,areas)
    values (uid,'business','cleaning','approved',now(),'test-service','Test Service','{Lekki,Ikeja}') returning id into pid;
  end if;
  delete from public.cleaning_prices where provider_id = pid;
  insert into public.cleaning_prices (provider_id,property_type,area_id,price,offered)
  select pid,'home',a,p,true from (values ('bed',5000),('sit',6000),('kit',6000),('bath',3500),('din',4000),('bal',2500),('stair',3000)) t(a,p);
  insert into public.cleaning_settings (provider_id) values (pid) on conflict do nothing;

  -- Fund the test user's wallet once (N100,000)
  select w.id into wid from public.wallets w join auth.users u on u.id = w.user_id where u.email = 'testuser@cleanconnect.test';
  if not exists (select 1 from public.ledger_entries where reference = 'test-user-seed-funding') then
    insert into public.ledger_entries (wallet_id,group_id,bucket,amount,kind,reference)
    values (wid,gen_random_uuid(),'available',100000,'fund','test-user-seed-funding');
  end if;
end $$;

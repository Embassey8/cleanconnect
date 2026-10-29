-- Phase 5: operations. Car wash assignment and partner payouts, partner scores, job applications,
-- support tickets, finance entries, admin sub-roles.

-- ---------- Admin sub-roles ----------
-- area: 'operations' | 'support' | 'finance'. Super admins (and admins with no sub-role) can do everything.
create function public.admin_can(area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users
     where id = auth.uid() and role = 'admin'
       and (admin_role is null or admin_role::text = 'super_admin' or admin_role::text = area));
$$;
revoke all on function public.admin_can(text) from public, anon;
grant execute on function public.admin_can(text) to authenticated;

-- ---------- Settings ----------
alter table public.money_settings
  add column carwash_offer_minutes integer not null default 10 check (carwash_offer_minutes > 0),
  add column on_time_grace_minutes integer not null default 15 check (on_time_grace_minutes >= 0);

-- ---------- Car wash jobs ----------
-- The partner payout is private to the partner and admins, so it lives apart from `orders`.
create table public.carwash_jobs (
  order_id uuid primary key references public.orders (id) on delete cascade,
  provider_id uuid not null references public.providers (id),
  partner_payout integer not null check (partner_payout >= 0),
  offer_expires_at timestamptz not null,
  assigned_at timestamptz,
  settled_at timestamptz
);
create index carwash_jobs_provider_idx on public.carwash_jobs (provider_id);

create table public.partner_scores (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  offers_total integer not null default 0,
  offers_accepted integer not null default 0,
  jobs_completed integer not null default 0,
  on_time_jobs integer not null default 0
);

alter table public.carwash_jobs enable row level security;
alter table public.partner_scores enable row level security;
create policy cwj_read on public.carwash_jobs for select
  using (public.owns_provider(provider_id) or public.current_role_is('admin'));
create policy ps_read on public.partner_scores for select
  using (public.owns_provider(provider_id) or public.current_role_is('admin'));

-- Partner steps after acceptance, customer sign-off, and cancellation with refund.
insert into public.order_transitions values
  ('carwash','assigned','en_route','provider'), ('carwash','en_route','arrived','provider'),
  ('carwash','arrived','condition_checked','provider'), ('carwash','condition_checked','washing','provider'),
  ('carwash','washing','awaiting_signoff','provider'),
  ('carwash','awaiting_signoff','completed','customer'), ('carwash','awaiting_signoff','disputed','customer'),
  ('carwash','assigned','cancelled','customer');

-- A partner must not see the customer's address until they have accepted the job.
create or replace function public.can_see_address(oid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = oid and (
      o.customer_id = auth.uid()
      or public.current_role_is('admin')
      or (o.provider_id is not null and public.owns_provider(o.provider_id)
          and o.status not in ('requested','assigning','declined','expired','cancelled')))
  );
$$;

-- Customers are charged only once a partner is assigned.
create or replace function public.pay_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.service = 'carwash' and o.provider_id is null then
    raise exception 'you will be charged once a partner is assigned';
  end if;
  if o.status not in ('requested', 'accepted', 'assigning') then raise exception 'this order can no longer be paid'; end if;
  perform public.escrow_hold(p_order);
end $$;

-- ---------- Partner promotion (internal) ----------
create function public.promote_partner(p_user uuid, p_name text, p_areas text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role; v_id uuid; v_base text; v_slug text; n integer := 1;
begin
  select role into v_role from public.users where id = p_user for update;
  if not found then raise exception 'applicant not found'; end if;
  if v_role <> 'customer' and v_role <> 'partner' then raise exception 'applicant already has a different account type'; end if;
  select id into v_id from public.providers where owner_id = p_user and service = 'carwash';
  if v_id is not null then return v_id; end if;
  v_base := coalesce(nullif(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), ''), 'partner');
  v_slug := 'cw-' || v_base;
  while exists (select 1 from public.providers where slug = v_slug) loop
    n := n + 1; v_slug := 'cw-' || v_base || '-' || n;
  end loop;
  update public.users set role = 'partner' where id = p_user;
  insert into public.providers (owner_id, type, service, status, slug, display_name, areas, approved_at)
  values (p_user, 'business', 'carwash', 'approved', v_slug, coalesce(nullif(trim(p_name), ''), 'Car wash partner'),
          coalesce(p_areas, '{}'), now())
  returning id into v_id;
  insert into public.partner_scores (provider_id) values (v_id);
  return v_id;
end $$;
revoke all on function public.promote_partner(uuid, text, text[]) from public, anon, authenticated;

-- ---------- Assignment ----------
create function public.assign_carwash(p_order uuid, p_partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_payout integer; v_bonus integer; v_minutes integer;
begin
  if not public.admin_can('operations') then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.service <> 'carwash' then raise exception 'car wash order not found'; end if;
  if o.status not in ('requested', 'assigning') then raise exception 'this request can no longer be assigned'; end if;
  if not exists (select 1 from public.providers where id = p_partner and service = 'carwash' and status = 'approved') then
    raise exception 'partner is not approved';
  end if;
  select partner_payout into v_payout from public.carwash_rates where package = o.carwash_package and vehicle = o.vehicle;
  if v_payout is null then raise exception 'no payout rate is set for this package and vehicle'; end if;
  select mobile_bonus into v_bonus from public.carwash_settings;
  if coalesce(o.is_mobile, false) then v_payout := v_payout + coalesce(v_bonus, 0); end if;
  if v_payout > o.total then raise exception 'the partner payout is higher than the customer price'; end if;
  select carwash_offer_minutes into v_minutes from public.money_settings;

  update public.orders set provider_id = p_partner, status = 'assigning' where id = p_order;
  insert into public.carwash_jobs (order_id, provider_id, partner_payout, offer_expires_at)
  values (p_order, p_partner, v_payout, now() + make_interval(mins => v_minutes))
  on conflict (order_id) do update
    set provider_id = excluded.provider_id, partner_payout = excluded.partner_payout, offer_expires_at = excluded.offer_expires_at;
  perform public.record_event(p_order, 'assigning');
  update public.partner_scores set offers_total = offers_total + 1 where provider_id = p_partner;
end $$;

-- Offer goes back to the queue (declined or timed out).
create function public.release_carwash_offer(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set provider_id = null, status = 'requested' where id = p_order;
  delete from public.carwash_jobs where order_id = p_order and assigned_at is null;
  perform public.record_event(p_order, 'requested');
end $$;
revoke all on function public.release_carwash_offer(uuid) from public, anon, authenticated;

create function public.respond_carwash_offer(p_order uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; j public.carwash_jobs%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.service <> 'carwash' or o.provider_id is null or not public.owns_provider(o.provider_id) then
    raise exception 'not allowed';
  end if;
  if o.status <> 'assigning' then raise exception 'this offer is no longer open'; end if;
  select * into j from public.carwash_jobs where order_id = p_order;

  if not p_accept then
    perform public.release_carwash_offer(p_order);
    return;
  end if;
  if j.offer_expires_at < now() then raise exception 'this offer has expired'; end if;
  if o.escrow_status = 'unpaid' then
    begin
      perform public.escrow_hold(p_order);
    exception when others then
      if sqlerrm like 'insufficient%' then
        raise exception 'the customer''s wallet balance is too low to confirm this job yet';
      end if;
      raise;
    end;
  end if;
  update public.orders set status = 'assigned' where id = p_order;
  update public.carwash_jobs set assigned_at = now() where order_id = p_order;
  perform public.record_event(p_order, 'assigned');
  update public.partner_scores set offers_accepted = offers_accepted + 1 where provider_id = o.provider_id;
end $$;

create function public.expire_carwash_offers() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select o.id from public.orders o join public.carwash_jobs j on j.order_id = o.id
     where o.status = 'assigning' and j.offer_expires_at < now() for update of o
  loop
    perform public.release_carwash_offer(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.expire_carwash_offers() from public, anon, authenticated;

-- ---------- Settlement with partner payout ----------
create function public.record_partner_result(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_grace integer; v_on_time boolean; v_arrived timestamptz;
begin
  select * into o from public.orders where id = p_order;
  select on_time_grace_minutes into v_grace from public.money_settings;
  select min(created_at) into v_arrived from public.order_events where order_id = p_order and status = 'arrived';
  v_on_time := o.scheduled_at is null or (v_arrived is not null and v_arrived <= o.scheduled_at + make_interval(mins => v_grace));
  insert into public.partner_scores (provider_id, jobs_completed, on_time_jobs)
  values (o.provider_id, 1, case when v_on_time then 1 else 0 end)
  on conflict (provider_id) do update
    set jobs_completed = public.partner_scores.jobs_completed + 1,
        on_time_jobs = public.partner_scores.on_time_jobs + case when v_on_time then 1 else 0 end;
end $$;
revoke all on function public.record_partner_result(uuid) from public, anon, authenticated;

-- Car wash: the partner's fixed payout is set aside (held) until the weekly settlement; the rest is
-- platform revenue. Laundry/cleaning behave as in the money phase.
create or replace function public.escrow_release(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; g uuid := gen_random_uuid(); v_comm integer; v_payout integer; v_provider_wallet uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.escrow_status <> 'held' then return; end if;
  if o.service = 'carwash' then
    select partner_payout into v_payout from public.carwash_jobs where order_id = p_order;
    v_comm := o.total - coalesce(v_payout, 0);
  else
    v_comm := case o.service
      when 'laundry' then round((o.subtotal + o.surcharge) * o.commission_rate)::integer
      else round(o.total * o.commission_rate)::integer end;
  end if;
  insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
  values (public.wallet_of(o.customer_id), g, 'held', -o.total, 'release', p_order);
  if o.provider_id is not null and o.total - v_comm > 0 then
    select public.wallet_of(owner_id) into v_provider_wallet from public.providers where id = o.provider_id;
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (v_provider_wallet, g, case when o.service = 'carwash' then 'held' else 'available' end,
            o.total - v_comm, 'release', p_order);
  end if;
  if v_comm > 0 then
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (public.platform_wallet(), g, 'available', v_comm, 'commission', p_order);
  end if;
  update public.orders set escrow_status = 'released', commission_amount = v_comm, settled_at = now() where id = p_order;
  if o.service = 'carwash' and o.provider_id is not null then perform public.record_partner_result(p_order); end if;
end $$;

-- Weekly (Friday) job: move completed jobs' payouts from the partner's held bucket to available.
create function public.settle_partner_payouts() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; g uuid; w uuid;
begin
  for r in
    select j.order_id, j.partner_payout, j.provider_id from public.carwash_jobs j
      join public.orders o on o.id = j.order_id
     where o.escrow_status = 'released' and j.settled_at is null and j.partner_payout > 0
       for update of j
  loop
    g := gen_random_uuid();
    select public.wallet_of(owner_id) into w from public.providers where id = r.provider_id;
    insert into public.ledger_entries (wallet_id, group_id, bucket, amount, kind, order_id)
    values (w, g, 'held', -r.partner_payout, 'payout', r.order_id),
           (w, g, 'available', r.partner_payout, 'payout', r.order_id);
    update public.carwash_jobs set settled_at = now() where order_id = r.order_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.settle_partner_payouts() from public, anon, authenticated;

create function public.admin_settle_partners() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('finance') then raise exception 'not allowed'; end if;
  return public.settle_partner_payouts();
end $$;

create or replace function public.admin_run_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('operations') then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'expired', public.expire_stale_orders(),
    'auto_confirmed', public.auto_confirm_orders(),
    'vip_renewed', public.renew_vip_subscriptions(),
    'offers_expired', public.expire_carwash_offers());
end $$;

-- ---------- Job applications ----------
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('partner', 'staff')),
  business_name text,
  position text,
  phone text,
  area text,
  note text,
  stage text not null default 'applied',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stage in ('applied','inspection','interview','offer','approved','hired','rejected'))
);
create unique index applications_one_open on public.job_applications (applicant_id, kind)
  where stage not in ('approved', 'hired', 'rejected');
alter table public.job_applications enable row level security;
create policy applications_read on public.job_applications for select
  using (applicant_id = auth.uid() or public.current_role_is('admin'));

create function public.submit_application(p_kind text, p_name text, p_phone text, p_area text, p_position text, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_id uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('partner', 'staff') then raise exception 'unknown application type'; end if;
  if p_kind = 'partner' and coalesce(trim(p_name), '') = '' then raise exception 'business name required'; end if;
  if p_kind = 'staff' and coalesce(trim(p_position), '') = '' then raise exception 'position required'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'phone required'; end if;
  insert into public.job_applications (applicant_id, kind, business_name, position, phone, area, note)
  values (uid, p_kind, nullif(trim(p_name), ''), nullif(trim(p_position), ''), trim(p_phone), nullif(trim(p_area), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'you already have an open application';
end $$;

create function public.advance_application(p_id uuid, p_stage text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.job_applications%rowtype;
begin
  if not public.admin_can('operations') then raise exception 'not allowed'; end if;
  select * into a from public.job_applications where id = p_id for update;
  if not found then raise exception 'application not found'; end if;
  if a.stage in ('approved', 'hired', 'rejected') then raise exception 'this application is already closed'; end if;
  if not (p_stage = any (case a.kind when 'partner' then array['inspection','approved','rejected']
                                     else array['interview','offer','hired','rejected'] end)) then
    raise exception 'invalid stage % for a % application', p_stage, a.kind;
  end if;
  if p_stage = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
  if a.kind = 'partner' and p_stage = 'approved' then
    perform public.promote_partner(a.applicant_id, a.business_name, case when a.area is null then '{}' else array[a.area] end);
  end if;
  update public.job_applications
     set stage = p_stage, rejection_reason = case when p_stage = 'rejected' then trim(p_reason) end, updated_at = now()
   where id = p_id;
end $$;

-- ---------- Support tickets ----------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users (id) on delete cascade,
  subject text not null check (length(trim(subject)) > 0),
  category text not null default 'general',
  order_id uuid references public.orders (id),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  assignee_id uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_status_idx on public.support_tickets (status, priority, created_at);
create table public.ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid not null references public.users (id),
  body text not null check (length(trim(body)) > 0),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index ticket_messages_idx on public.ticket_messages (ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
create policy tickets_read on public.support_tickets for select
  using (created_by = auth.uid() or public.current_role_is('admin'));
create policy ticket_messages_read on public.ticket_messages for select
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id
                  and (public.current_role_is('admin') or (t.created_by = auth.uid() and not internal))));

create function public.create_ticket(p_subject text, p_body text, p_category text, p_order uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_id uuid; v_priority text := 'normal';
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'subject and message required'; end if;
  if p_order is not null and not public.can_see_order(p_order) then raise exception 'order not found'; end if;
  -- VIP providers get priority support
  if exists (select 1 from public.providers where owner_id = uid and plan = 'vip') then v_priority := 'high'; end if;
  insert into public.support_tickets (created_by, subject, category, order_id, priority)
  values (uid, trim(p_subject), coalesce(nullif(trim(p_category), ''), 'general'), p_order, v_priority)
  returning id into v_id;
  insert into public.ticket_messages (ticket_id, sender_id, body) values (v_id, uid, trim(p_body));
  return v_id;
end $$;

create function public.reply_ticket(p_ticket uuid, p_body text, p_internal boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.support_tickets%rowtype; v_staff boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'ticket not found'; end if;
  v_staff := public.admin_can('support');
  if not v_staff and t.created_by <> uid then raise exception 'ticket not found'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'message required'; end if;
  insert into public.ticket_messages (ticket_id, sender_id, body, internal)
  values (p_ticket, uid, trim(p_body), v_staff and coalesce(p_internal, false));
  update public.support_tickets
     set updated_at = now(),
         status = case when v_staff and not coalesce(p_internal, false) then 'pending'
                       when not v_staff then 'open' else status end
   where id = p_ticket;
end $$;

create function public.update_ticket(p_ticket uuid, p_status text, p_priority text, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('support') then raise exception 'not allowed'; end if;
  if p_assignee is not null and not exists (select 1 from public.users where id = p_assignee and role = 'admin') then
    raise exception 'assignee must be an admin';
  end if;
  update public.support_tickets
     set status = coalesce(p_status, status), priority = coalesce(p_priority, priority),
         assignee_id = coalesce(p_assignee, assignee_id), updated_at = now()
   where id = p_ticket;
  if not found then raise exception 'ticket not found'; end if;
end $$;

-- ---------- Finance ----------
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  category text not null,
  amount integer not null check (amount > 0),
  occurred_on date not null default current_date,
  note text,
  created_by uuid references public.users (id)
);
alter table public.finance_entries enable row level security;
create policy finance_admin on public.finance_entries for select using (public.admin_can('finance'));

create function public.add_finance_entry(p_kind text, p_category text, p_amount integer, p_on date, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('finance') then raise exception 'not allowed'; end if;
  insert into public.finance_entries (kind, category, amount, occurred_on, note, created_by)
  values (p_kind, p_category, p_amount, coalesce(p_on, current_date), p_note, auth.uid());
end $$;

-- Raw monthly components; the profit formula (BUILD_BRIEF §9) lives in packages/shared.
create function public.admin_finance(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_from timestamptz := date_trunc('month', p_month)::timestamptz; v_to timestamptz := (date_trunc('month', p_month) + interval '1 month')::timestamptz;
        v_expenses jsonb; v_adv integer;
begin
  if not public.admin_can('finance') then raise exception 'not allowed'; end if;
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb) into v_expenses from (
    select category, sum(amount)::integer as total from public.finance_entries
     where kind = 'expense' and occurred_on >= v_from::date and occurred_on < v_to::date group by category) e;
  select coalesce(sum(amount), 0)::integer into v_adv from public.finance_entries
   where kind = 'income' and category = 'advertising' and occurred_on >= v_from::date and occurred_on < v_to::date;
  return jsonb_build_object(
    'marketplace_commission', (select coalesce(sum(commission_amount), 0)::integer from public.orders
       where escrow_status = 'released' and service <> 'carwash' and settled_at >= v_from and settled_at < v_to),
    'carwash_revenue', (select coalesce(sum(total), 0)::integer from public.orders
       where escrow_status = 'released' and service = 'carwash' and settled_at >= v_from and settled_at < v_to),
    'partner_payouts', (select coalesce(sum(j.partner_payout), 0)::integer from public.carwash_jobs j
       join public.orders o on o.id = j.order_id
       where o.escrow_status = 'released' and o.settled_at >= v_from and o.settled_at < v_to),
    'vip', (select coalesce(sum(le.amount), 0)::integer from public.ledger_entries le
       join public.wallets w on w.id = le.wallet_id
       where w.kind = 'platform' and le.kind = 'vip_fee' and le.created_at >= v_from and le.created_at < v_to),
    'advertising', v_adv,
    'expenses', v_expenses);
end $$;

create function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('operations') and not public.admin_can('support') and not public.admin_can('finance') then
    raise exception 'not allowed';
  end if;
  return jsonb_build_object(
    'customers', (select count(*) from public.users where role = 'customer'),
    'providers_business', (select count(*) from public.providers where service <> 'carwash' and type = 'business'),
    'providers_individual', (select count(*) from public.providers where service <> 'carwash' and type = 'individual'),
    'partners', (select count(*) from public.providers where service = 'carwash'),
    'employees', (select count(*) from public.users where role = 'admin'),
    'pending_approvals', (select count(*) from public.providers where status = 'pending'),
    'requests_to_assign', (select count(*) from public.orders where service = 'carwash' and status = 'requested'),
    'open_tickets', (select count(*) from public.support_tickets where status <> 'resolved'),
    'open_applications', (select count(*) from public.job_applications where stage not in ('approved','hired','rejected')),
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now())));
end $$;

-- ---------- Client grants ----------
revoke all on function public.assign_carwash(uuid, uuid) from public, anon;
revoke all on function public.respond_carwash_offer(uuid, boolean) from public, anon;
revoke all on function public.admin_settle_partners() from public, anon;
revoke all on function public.submit_application(text, text, text, text, text, text) from public, anon;
revoke all on function public.advance_application(uuid, text, text) from public, anon;
revoke all on function public.create_ticket(text, text, text, uuid) from public, anon;
revoke all on function public.reply_ticket(uuid, text, boolean) from public, anon;
revoke all on function public.update_ticket(uuid, text, text, uuid) from public, anon;
revoke all on function public.add_finance_entry(text, text, integer, date, text) from public, anon;
revoke all on function public.admin_finance(date) from public, anon;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.assign_carwash(uuid, uuid) to authenticated;
grant execute on function public.respond_carwash_offer(uuid, boolean) to authenticated;
grant execute on function public.admin_settle_partners() to authenticated;
grant execute on function public.submit_application(text, text, text, text, text, text) to authenticated;
grant execute on function public.advance_application(uuid, text, text) to authenticated;
grant execute on function public.create_ticket(text, text, text, uuid) to authenticated;
grant execute on function public.reply_ticket(uuid, text, boolean) to authenticated;
grant execute on function public.update_ticket(uuid, text, text, uuid) to authenticated;
grant execute on function public.add_finance_entry(text, text, integer, date, text) to authenticated;
grant execute on function public.admin_finance(date) to authenticated;
grant execute on function public.admin_overview() to authenticated;

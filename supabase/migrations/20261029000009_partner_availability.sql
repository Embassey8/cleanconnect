-- Car wash partners can pause new job offers ("Available for jobs" switch on the partner dashboard).

alter table public.providers add column accepting_jobs boolean not null default true;

create function public.set_availability(p_available boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.providers set accepting_jobs = p_available
   where owner_id = auth.uid() and service = 'carwash';
  if not found then raise exception 'only car wash partners can change availability'; end if;
end $$;
revoke all on function public.set_availability(boolean) from public, anon;
grant execute on function public.set_availability(boolean) to authenticated;

-- Admins can only offer jobs to partners who are accepting them.
create or replace function public.assign_carwash(p_order uuid, p_partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_payout integer; v_bonus integer; v_minutes integer; v_accepting boolean;
begin
  if not public.admin_can('operations') then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.service <> 'carwash' then raise exception 'car wash order not found'; end if;
  if o.status not in ('requested', 'assigning') then raise exception 'this request can no longer be assigned'; end if;
  select accepting_jobs into v_accepting from public.providers where id = p_partner and service = 'carwash' and status = 'approved';
  if not found then raise exception 'partner is not approved'; end if;
  if not v_accepting then raise exception 'partner is not accepting jobs right now'; end if;
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

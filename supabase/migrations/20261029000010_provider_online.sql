-- "Online / taking jobs" switch for every provider (cleaning, laundry, car wash).
-- Offline providers stay visible but cannot receive new requests.

create or replace function public.set_availability(p_available boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.providers set accepting_jobs = p_available where owner_id = auth.uid();
  if not found then raise exception 'only providers can change availability'; end if;
end $$;

-- New marketplace requests are refused while the provider is offline. Quotes the provider already sent can
-- still be accepted (those orders start as 'accepted'), and car wash uses its own assignment check.
create function public.orders_require_online_provider() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'requested' and new.provider_id is not null and new.service <> 'carwash'
     and not exists (select 1 from public.providers where id = new.provider_id and accepting_jobs) then
    raise exception 'this provider is not taking new orders right now';
  end if;
  return new;
end $$;
create trigger orders_online_provider before insert on public.orders
for each row execute function public.orders_require_online_provider();

-- Marketplace: show whether a provider is taking jobs (new column added at the end).
create or replace view public.provider_listing with (security_invoker = true) as
  select p.id, p.slug, p.display_name, p.type, p.service, p.plan, p.areas,
    case p.service
      when 'laundry' then (select min(price) from public.laundry_prices lp where lp.provider_id = p.id and lp.price is not null)
      else (select min(price) from public.cleaning_prices cp where cp.provider_id = p.id and cp.offered and cp.price is not null)
    end as min_price,
    p.accepting_jobs
  from public.providers p;

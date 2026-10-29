-- Core identity: roles, profiles, providers, verification. Money is integer naira.

create type user_role as enum ('customer', 'provider', 'partner', 'admin');
create type admin_role as enum ('super_admin', 'operations', 'support', 'finance');
create type provider_type as enum ('business', 'individual');
create type service_kind as enum ('cleaning', 'laundry', 'carwash');
create type provider_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type plan_kind as enum ('standard', 'vip');
create type verification_kind as enum ('cac', 'nin', 'bvn', 'selfie');
create type verification_status as enum ('pending', 'verified', 'mismatch', 'failed');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'customer',
  admin_role admin_role,
  name text not null default '',
  phone text,
  email text,
  created_at timestamptz not null default now(),
  check (admin_role is null or role = 'admin')
);

create table public.customer_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  default_address text,
  area text,
  city text
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  type provider_type not null,
  service service_kind not null,
  status provider_status not null default 'pending',
  plan plan_kind not null default 'standard',
  slug text not null unique,
  display_name text not null,
  areas text[] not null default '{}',
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  -- car wash partners are not marketplace-listed and are always businesses
  check (service <> 'carwash' or type = 'business')
);
create index providers_owner_idx on public.providers (owner_id);
create index providers_listing_idx on public.providers (service, status, plan);

create table public.provider_members (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  first_name text not null,
  nin_verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Raw NIN/BVN/CAC numbers must never reach public pages: they live only in
-- provider_ref, which no public policy or view exposes.
create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  kind verification_kind not null,
  status verification_status not null default 'pending',
  provider_ref text,
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (provider_id, kind)
);

-- Create a users row whenever someone signs up. Role is always 'customer';
-- elevation happens server-side (provider sign-up, admin invite).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, name, email, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email, new.phone);
  insert into public.customer_profiles (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Helpers for RLS
create function public.current_role_is(r user_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users where id = auth.uid() and role = r);
$$;

alter table public.users enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.providers enable row level security;
alter table public.provider_members enable row level security;
alter table public.verifications enable row level security;

create policy users_self_read on public.users for select
  using (id = auth.uid() or public.current_role_is('admin'));
-- role/admin_role are not user-editable: only name/phone via column grants below
create policy users_self_update on public.users for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.users from authenticated;
grant update (name, phone) on public.users to authenticated;

create policy customer_profiles_self on public.customer_profiles for all
  using (user_id = auth.uid() or public.current_role_is('admin'))
  with check (user_id = auth.uid());

-- Only approved, marketplace-listed providers are public (car wash never is).
create policy providers_public_read on public.providers for select
  using (status = 'approved' and service <> 'carwash');
create policy providers_owner_read on public.providers for select
  using (owner_id = auth.uid());
create policy providers_admin_all on public.providers for all
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));
-- owners edit display fields only; status/plan are admin-controlled
create policy providers_owner_update on public.providers for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke update on public.providers from authenticated;
grant update (display_name, areas) on public.providers to authenticated;

create policy members_public_read on public.provider_members for select
  using (exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved'));
create policy members_owner_all on public.provider_members for all
  using (exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));

-- Verifications: owner and admin only; never public.
create policy verifications_owner_read on public.verifications for select
  using (exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid())
         or public.current_role_is('admin'));
create policy verifications_admin_write on public.verifications for all
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));

-- Public-safe badge view: kind + verified flag only, no refs or results.
create view public.provider_badges with (security_invoker = false) as
  select v.provider_id, v.kind, (v.status = 'verified') as verified
  from public.verifications v
  join public.providers p on p.id = v.provider_id
  where p.status = 'approved' and v.kind <> 'selfie';
grant select on public.provider_badges to anon, authenticated;

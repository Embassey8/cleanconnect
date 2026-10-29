-- Provider-set and admin-set pricing (BUILD_BRIEF §6). Integer naira.

create type laundry_service as enum ('dry', 'wash', 'iron');
create type property_type as enum ('home', 'office', 'school', 'shop');
create type cleaning_type as enum ('regular', 'deep', 'move', 'post');

create table public.laundry_items (
  id text primary key,
  provider_id uuid references public.providers (id) on delete cascade, -- null = platform default
  name text not null
);

insert into public.laundry_items (id, name) values
  ('shirt', 'Shirt / blouse'), ('trousers', 'Trousers / skirt'),
  ('native', 'Native wear (2-piece)'), ('agbada', 'Agbada (3-piece)'),
  ('suit', 'Suit (2-piece)'), ('gown', 'Gown / dress'),
  ('bedsheet', 'Bedsheet set'), ('duvet', 'Duvet'), ('towel', 'Towel');

-- price null = not offered (hidden from customers)
create table public.laundry_prices (
  provider_id uuid not null references public.providers (id) on delete cascade,
  item_id text not null references public.laundry_items (id),
  service laundry_service not null,
  price integer check (price is null or price >= 0),
  primary key (provider_id, item_id, service)
);

create table public.laundry_settings (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  express_pct integer not null default 50 check (express_pct >= 0),
  delivery_fee integer not null default 1500 check (delivery_fee >= 0),
  free_delivery_over integer not null default 20000 check (free_delivery_over >= 0),
  turnaround_hours integer not null default 48
);

create table public.cleaning_areas (
  property_type property_type not null,
  id text not null,
  name text not null,
  unit text not null,
  primary key (property_type, id)
);

insert into public.cleaning_areas (property_type, id, name, unit) values
  ('home','bed','Bedroom','per room'),('home','sit','Sitting room','per room'),
  ('home','kit','Kitchen','each'),('home','bath','Bathroom / toilet','each'),
  ('home','din','Dining area','each'),('home','bal','Balcony / terrace','each'),
  ('home','stair','Staircase','per flight'),
  ('office','room','Private office','per room'),('office','open','Open-plan area','per 50 m²'),
  ('office','meet','Meeting room','per room'),('office','rec','Reception / lobby','each'),
  ('office','rest','Restroom','each'),('office','kitn','Kitchenette','each'),
  ('school','class','Classroom','per room'),('school','staff','Staff room / office','per room'),
  ('school','hall','Assembly hall','each'),('school','lib','Library / lab','each'),
  ('school','restb','Restroom block','each'),('school','corr','Corridor','per floor'),
  ('shop','floor','Shop floor','per 50 m²'),('shop','store','Storeroom','each'),
  ('shop','win','Display window','per window'),('shop','fit','Fitting room','each'),
  ('shop','rest','Restroom','each');

create table public.cleaning_prices (
  provider_id uuid not null references public.providers (id) on delete cascade,
  property_type property_type not null,
  area_id text not null,
  price integer check (price is null or price >= 0),
  offered boolean not null default true,
  primary key (provider_id, property_type, area_id),
  foreign key (property_type, area_id) references public.cleaning_areas (property_type, id)
);

create table public.cleaning_settings (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  property_types property_type[] not null default '{home}',
  mult_regular numeric(3,1) not null default 1.0,
  mult_deep numeric(3,1) not null default 1.6,
  mult_move numeric(3,1) not null default 1.8,
  mult_post numeric(3,1) not null default 2.2,
  min_order integer not null default 10000 check (min_order >= 0)
);

create type carwash_package as enum ('exterior', 'full', 'detailing');
create type vehicle_type as enum ('saloon', 'suv', 'van', 'pickup');

-- Admin-set only. Customer price and partner payout per package x vehicle.
create table public.carwash_rates (
  package carwash_package not null,
  vehicle vehicle_type not null,
  customer_price integer not null check (customer_price >= 0),
  partner_payout integer not null check (partner_payout >= 0),
  primary key (package, vehicle)
);

create table public.carwash_settings (
  id boolean primary key default true check (id), -- single row
  service_fee integer not null default 0,
  mobile_bonus integer not null default 0
);
insert into public.carwash_settings default values;

alter table public.laundry_items enable row level security;
alter table public.laundry_prices enable row level security;
alter table public.laundry_settings enable row level security;
alter table public.cleaning_areas enable row level security;
alter table public.cleaning_prices enable row level security;
alter table public.cleaning_settings enable row level security;
alter table public.carwash_rates enable row level security;
alter table public.carwash_settings enable row level security;

create function public.owns_provider(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.providers where id = pid and owner_id = auth.uid());
$$;
create function public.provider_is_public(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.providers where id = pid and status = 'approved' and service <> 'carwash');
$$;

create policy items_read on public.laundry_items for select using (true);
create policy items_owner_write on public.laundry_items for all
  using (provider_id is not null and public.owns_provider(provider_id))
  with check (provider_id is not null and public.owns_provider(provider_id));
create policy areas_read on public.cleaning_areas for select using (true);

create policy lp_read on public.laundry_prices for select
  using (public.provider_is_public(provider_id) or public.owns_provider(provider_id));
create policy lp_write on public.laundry_prices for all
  using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));
create policy ls_read on public.laundry_settings for select
  using (public.provider_is_public(provider_id) or public.owns_provider(provider_id));
create policy ls_write on public.laundry_settings for all
  using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));

create policy cp_read on public.cleaning_prices for select
  using (public.provider_is_public(provider_id) or public.owns_provider(provider_id));
create policy cp_write on public.cleaning_prices for all
  using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));
create policy cs_read on public.cleaning_settings for select
  using (public.provider_is_public(provider_id) or public.owns_provider(provider_id));
create policy cs_write on public.cleaning_settings for all
  using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));

-- Car wash rates: customers see customer prices via a view; payouts are admin/partner only.
create policy cw_admin_all on public.carwash_rates for all
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));
create policy cw_partner_read on public.carwash_rates for select
  using (public.current_role_is('partner'));
create policy cws_admin_all on public.carwash_settings for all
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));
create policy cws_read on public.carwash_settings for select using (true);

create view public.carwash_customer_prices with (security_invoker = false) as
  select package, vehicle, customer_price from public.carwash_rates;
grant select on public.carwash_customer_prices to anon, authenticated;

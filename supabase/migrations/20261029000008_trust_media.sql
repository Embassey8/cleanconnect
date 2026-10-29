-- Phase 6: trust and media. In-app job photos, customer consent before going public, reviews with
-- photos and provider replies, saved providers/photos, public rating stats, partner quality.
-- Image bytes live in the private `job-media` storage bucket; this schema holds the metadata. Only the
-- server (service role) writes to the bucket, after the checks below pass.

create type public.media_phase as enum ('before', 'after', 'condition', 'intake', 'general');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.users (id),
  provider_id uuid not null references public.providers (id),
  rating smallint not null check (rating between 1 and 5),
  quality smallint not null check (quality between 1 and 5),
  punctuality smallint not null check (punctuality between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  value_score smallint not null check (value_score between 1 and 5),
  body text not null default '' check (length(body) <= 2000),
  reply text check (reply is null or length(reply) <= 1000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index reviews_provider_idx on public.reviews (provider_id, created_at desc);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider_id uuid references public.providers (id),
  uploader_id uuid not null references public.users (id),
  review_id uuid references public.reviews (id) on delete cascade,
  phase public.media_phase not null default 'general',
  path text not null unique,
  captured_in_app boolean not null default true check (captured_in_app), -- gallery uploads are never accepted
  taken_at timestamptz not null default now(),                           -- server clock, never client-supplied
  is_public boolean not null default false,
  hidden boolean not null default false,                                  -- admin moderation
  created_at timestamptz not null default now()
);
create index media_order_idx on public.media (order_id);
create index media_provider_idx on public.media (provider_id) where is_public;

create table public.saved_providers (
  user_id uuid not null references public.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, provider_id)
);
create table public.saved_media (
  user_id uuid not null references public.users (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

alter table public.reviews enable row level security;
alter table public.media enable row level security;
alter table public.saved_providers enable row level security;
alter table public.saved_media enable row level security;

create policy reviews_read on public.reviews for select
  using (public.provider_is_public(provider_id) or customer_id = auth.uid()
         or public.owns_provider(provider_id) or public.current_role_is('admin'));
create policy media_read on public.media for select
  using (public.current_role_is('admin')
         or (not hidden and (public.can_see_order(order_id)
                             or (is_public and provider_id is not null and public.provider_is_public(provider_id)))));
create policy saved_providers_own on public.saved_providers for select using (user_id = auth.uid());
create policy saved_media_own on public.saved_media for select using (user_id = auth.uid());

-- ---------- Media rules ----------
create function public.can_add_media(p_order uuid, p_review uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare o public.orders%rowtype; r public.reviews%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into o from public.orders where id = p_order;
  if not found then return false; end if;
  if p_review is not null then
    select * into r from public.reviews where id = p_review;
    return found and r.order_id = p_order and r.customer_id = auth.uid()
       and (select count(*) from public.media where review_id = p_review) < 4;
  end if;
  return o.provider_id is not null and public.owns_provider(o.provider_id)
     and o.status not in ('requested', 'assigning', 'declined', 'expired', 'cancelled')
     and (select count(*) from public.media where order_id = p_order and review_id is null) < 40;
end $$;

create function public.register_media(p_order uuid, p_path text, p_phase public.media_phase, p_review uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_id uuid;
begin
  if not public.can_add_media(p_order, p_review) then raise exception 'you cannot add photos to this order'; end if;
  if p_path is null or p_path not like p_order::text || '/%.jpg' then raise exception 'invalid photo path'; end if;
  select * into o from public.orders where id = p_order;
  insert into public.media (order_id, provider_id, uploader_id, review_id, phase, path, is_public)
  values (p_order, o.provider_id, auth.uid(), p_review, p_phase, p_path, p_review is not null)
  returning id into v_id;
  return v_id;
end $$;

-- Only the customer can put a job photo on the provider's public profile, and only once the job is done.
create function public.set_media_public(p_media uuid, p_public boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.media%rowtype; o public.orders%rowtype;
begin
  select * into m from public.media where id = p_media for update;
  if not found or m.review_id is not null then raise exception 'photo not found'; end if;
  select * into o from public.orders where id = m.order_id;
  if o.customer_id is distinct from auth.uid() then raise exception 'only the customer can share this photo'; end if;
  if p_public and o.status <> 'completed' then raise exception 'photos can be shared once the job is completed'; end if;
  update public.media set is_public = p_public where id = p_media;
end $$;

create function public.hide_media(p_media uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('support') then raise exception 'not allowed'; end if;
  update public.media set hidden = p_hidden where id = p_media;
  if not found then raise exception 'photo not found'; end if;
end $$;

-- ---------- Reviews ----------
create function public.create_review(
  p_order uuid, p_rating integer, p_quality integer, p_punctuality integer, p_communication integer, p_value integer, p_body text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_id uuid;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.customer_id is distinct from auth.uid() then raise exception 'order not found'; end if;
  if o.status <> 'completed' then raise exception 'you can review an order once it is completed'; end if;
  if o.provider_id is null then raise exception 'this order has no provider to review'; end if;
  if exists (select 1 from public.reviews where order_id = p_order) then raise exception 'you have already reviewed this order'; end if;
  if least(p_rating, p_quality, p_punctuality, p_communication, p_value) < 1
     or greatest(p_rating, p_quality, p_punctuality, p_communication, p_value) > 5 then
    raise exception 'ratings must be between 1 and 5';
  end if;
  insert into public.reviews (order_id, customer_id, provider_id, rating, quality, punctuality, communication, value_score, body)
  values (p_order, o.customer_id, o.provider_id, p_rating, p_quality, p_punctuality, p_communication, p_value, coalesce(trim(p_body), ''))
  returning id into v_id;
  return v_id;
end $$;

create function public.reply_review(p_review uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = p_review for update;
  if not found or not public.owns_provider(r.provider_id) then raise exception 'review not found'; end if;
  if r.reply is not null then raise exception 'you have already replied to this review'; end if;
  if coalesce(trim(p_reply), '') = '' then raise exception 'reply required'; end if;
  update public.reviews set reply = trim(p_reply), replied_at = now() where id = p_review;
end $$;

-- ---------- Saved ----------
create function public.toggle_saved_provider(p_provider uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.saved_providers where user_id = uid and provider_id = p_provider) then
    delete from public.saved_providers where user_id = uid and provider_id = p_provider;
    return false;
  end if;
  if not public.provider_is_public(p_provider) then raise exception 'provider not found'; end if;
  insert into public.saved_providers (user_id, provider_id) values (uid, p_provider);
  return true;
end $$;

create function public.toggle_saved_media(p_media uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.saved_media where user_id = uid and media_id = p_media) then
    delete from public.saved_media where user_id = uid and media_id = p_media;
    return false;
  end if;
  if not exists (select 1 from public.public_gallery where id = p_media) then raise exception 'photo not found'; end if;
  insert into public.saved_media (user_id, media_id) values (uid, p_media);
  return true;
end $$;

-- ---------- Public views (no customer, address or order identifiers) ----------
create view public.public_gallery with (security_invoker = false) as
  select m.id, m.provider_id, m.phase, m.taken_at, m.path, m.review_id, o.service
  from public.media m
  join public.orders o on o.id = m.order_id
  join public.providers p on p.id = m.provider_id
  where m.is_public and not m.hidden and o.status = 'completed' and p.status = 'approved' and p.service <> 'carwash';
grant select on public.public_gallery to anon, authenticated;

create view public.provider_stats with (security_invoker = false) as
  select p.id as provider_id,
         count(r.id)::int as rating_count,
         round(avg(r.rating)::numeric, 1) as rating_avg,
         (count(*) filter (where r.rating = 1))::int as c1, (count(*) filter (where r.rating = 2))::int as c2,
         (count(*) filter (where r.rating = 3))::int as c3, (count(*) filter (where r.rating = 4))::int as c4,
         (count(*) filter (where r.rating = 5))::int as c5,
         round(avg(r.quality)::numeric, 1) as quality, round(avg(r.punctuality)::numeric, 1) as punctuality,
         round(avg(r.communication)::numeric, 1) as communication, round(avg(r.value_score)::numeric, 1) as value_score,
         (select count(*) from public.orders o where o.provider_id = p.id and o.status = 'completed')::int as jobs_completed
  from public.providers p
  left join public.reviews r on r.provider_id = p.id
  where p.status = 'approved' and p.service <> 'carwash'
  group by p.id;
grant select on public.provider_stats to anon, authenticated;

-- Feeds the partner score: rating, and the share of completed jobs with at least one partner photo.
create view public.partner_quality with (security_invoker = true) as
  select p.id as provider_id,
         (select round(avg(r.rating)::numeric, 2) from public.reviews r where r.provider_id = p.id) as rating_avg,
         (select count(*) from public.reviews r where r.provider_id = p.id)::int as rating_count,
         (select count(*) from public.orders o where o.provider_id = p.id and o.status = 'completed')::int as jobs_completed,
         (select count(distinct o.id) from public.orders o
            join public.media m on m.order_id = o.id and m.uploader_id = p.owner_id and m.review_id is null
           where o.provider_id = p.id and o.status = 'completed')::int as photo_jobs
  from public.providers p
  where p.service = 'carwash';
grant select on public.partner_quality to authenticated;

-- ---------- Client grants ----------
do $$
declare f text;
begin
  foreach f in array array[
    'can_add_media(uuid, uuid)', 'register_media(uuid, text, public.media_phase, uuid)', 'set_media_public(uuid, boolean)',
    'hide_media(uuid, boolean)', 'create_review(uuid, integer, integer, integer, integer, integer, text)',
    'reply_review(uuid, text)', 'toggle_saved_provider(uuid)', 'toggle_saved_media(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

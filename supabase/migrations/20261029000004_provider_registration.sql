-- Provider registration, MOCKED verification, and admin review.
-- Verification here is a deterministic stand-in for a KYC provider (Smile ID / Dojah / Prembly).
-- Raw ID numbers are never stored: only the last 4 digits, for admin reference.

create function public.mock_verify(kind verification_kind, ref text)
returns verification_status
language sql immutable as $$
  select case
    when ref is null or ref = '' then 'failed'::verification_status
    -- BVN is slower in the real world: leave pending for admin follow-up
    when kind = 'bvn' then 'pending'::verification_status
    -- test hook: IDs ending in 0 simulate a name mismatch
    when right(ref, 1) = '0' then 'mismatch'::verification_status
    else 'verified'::verification_status
  end
$$;

create function public.register_provider(
  p_type provider_type,
  p_service service_kind,
  p_display_name text,
  p_areas text[],
  p_plan plan_kind,
  p_cac text default null,
  p_nin text default null,
  p_bvn text default null,
  p_team_size text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  base text;
  slug text;
  n int := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_service = 'carwash' then
    raise exception 'car wash partners join by application';
  end if;
  if exists (select 1 from public.providers where owner_id = uid) then
    raise exception 'you already have a provider profile';
  end if;
  if length(trim(p_display_name)) < 2 then raise exception 'display name required'; end if;

  if p_type = 'business' and coalesce(p_cac, '') = '' then
    raise exception 'CAC registration number required';
  end if;
  if p_type = 'individual' and coalesce(p_nin, '') !~ '^\d{11}$' then
    raise exception 'NIN must be 11 digits';
  end if;
  if p_type = 'individual' and p_service = 'laundry' and coalesce(p_bvn, '') !~ '^\d{11}$' then
    raise exception 'BVN must be 11 digits for laundry individuals';
  end if;

  base := trim(both '-' from regexp_replace(lower(p_display_name), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'provider'; end if;
  slug := base;
  while exists (select 1 from public.providers where providers.slug = slug) loop
    n := n + 1;
    slug := base || '-' || n;
  end loop;

  insert into public.providers (owner_id, type, service, plan, slug, display_name, areas)
  values (uid, p_type, p_service, 'standard', slug, trim(p_display_name), coalesce(p_areas, '{}'))
  returning id into pid;

  if p_type = 'business' then
    insert into public.verifications (provider_id, kind, status, provider_ref)
    values (pid, 'cac', public.mock_verify('cac', p_cac), right(p_cac, 4));
  else
    insert into public.verifications (provider_id, kind, status, provider_ref)
    values (pid, 'nin', public.mock_verify('nin', p_nin), right(p_nin, 4));
    if p_service = 'laundry' then
      insert into public.verifications (provider_id, kind, status, provider_ref)
      values (pid, 'bvn', public.mock_verify('bvn', p_bvn), right(p_bvn, 4));
    end if;
    -- selfie match is captured in the app later; starts pending
    insert into public.verifications (provider_id, kind, status)
    values (pid, 'selfie', 'pending');
  end if;

  -- p_plan records interest only: VIP is granted after payment (Money phase), never at sign-up.
  -- default settings so the price editors have rows to edit
  if p_service = 'laundry' then
    insert into public.laundry_settings (provider_id) values (pid);
  else
    insert into public.cleaning_settings (provider_id) values (pid);
  end if;

  update public.users set role = 'provider' where id = uid and role = 'customer';
  return pid;
end $$;

-- Admin approval / rejection. Approved providers become publicly visible.
create function public.review_provider(p_provider uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection reason is required';
  end if;
  update public.providers
     set status = case when p_approve then 'approved'::provider_status else 'rejected'::provider_status end,
         approved_at = case when p_approve then now() else null end,
         rejection_reason = case when p_approve then null else trim(p_reason) end
   where id = p_provider;
  if not found then raise exception 'provider not found'; end if;
end $$;

revoke all on function public.register_provider(provider_type, service_kind, text, text[], plan_kind, text, text, text, text) from public, anon;
grant execute on function public.register_provider(provider_type, service_kind, text, text[], plan_kind, text, text, text, text) to authenticated;
revoke all on function public.review_provider(uuid, boolean, text) from public, anon;
grant execute on function public.review_provider(uuid, boolean, text) to authenticated;

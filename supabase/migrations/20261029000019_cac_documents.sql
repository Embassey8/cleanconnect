-- Business sign-up now requires the CAC certificate image, the business name as registered, and the CAC number.
-- The image lives in the private `kyc-documents` bucket (server-only: the app uploads with the service role and
-- admins see it through short-lived signed links); this schema keeps the path and the registered name.
-- The full CAC number is still never stored (last 4 digits only); the admin reads it off the certificate.

alter table public.verifications
  add column document_path text,
  add column registered_name text;

-- Private bucket for identity documents. Skipped where Supabase Storage isn't installed (plain Postgres in CI).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('kyc-documents', 'kyc-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

drop function public.register_provider(public.provider_type, public.service_kind, text, text[], public.plan_kind, text, text, text, text);

create function public.register_provider(
  p_type public.provider_type,
  p_service public.service_kind,
  p_display_name text,
  p_areas text[],
  p_plan public.plan_kind,
  p_cac text default null,
  p_nin text default null,
  p_bvn text default null,
  p_team_size text default null,
  p_cac_name text default null,
  p_cac_document text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  v_base text;
  v_slug text;
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

  if p_type = 'business' then
    if coalesce(p_cac, '') = '' then raise exception 'CAC registration number required'; end if;
    if length(trim(coalesce(p_cac_name, ''))) < 2 then raise exception 'business name as registered with CAC required'; end if;
    -- the certificate must have been uploaded under the caller's own folder
    if p_cac_document is null or p_cac_document !~ ('^cac/' || uid::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'CAC certificate image required';
    end if;
  end if;
  if p_type = 'individual' and coalesce(p_nin, '') !~ '^\d{11}$' then
    raise exception 'NIN must be 11 digits';
  end if;
  if p_type = 'individual' and p_service = 'laundry' and coalesce(p_bvn, '') !~ '^\d{11}$' then
    raise exception 'BVN must be 11 digits for laundry individuals';
  end if;

  v_base := trim(both '-' from regexp_replace(lower(p_display_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'provider'; end if;
  v_slug := v_base;
  while exists (select 1 from public.providers p where p.slug = v_slug) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;

  insert into public.providers (owner_id, type, service, plan, slug, display_name, areas)
  values (uid, p_type, p_service, 'standard', v_slug, trim(p_display_name), coalesce(p_areas, '{}'))
  returning id into pid;

  if p_type = 'business' then
    insert into public.verifications (provider_id, kind, status, provider_ref, document_path, registered_name)
    values (pid, 'cac', public.mock_verify('cac', p_cac), right(p_cac, 4), p_cac_document, trim(p_cac_name));
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

  update public.users set role = 'provider' where id = uid and role = 'customer';

  -- p_plan records interest only: VIP is granted after payment (Money phase), never at sign-up.
  -- default settings so the price editors have rows to edit
  if p_service = 'laundry' then
    insert into public.laundry_settings (provider_id) values (pid);
  else
    insert into public.cleaning_settings (provider_id) values (pid);
  end if;

  return pid;
end $$;

revoke all on function public.register_provider(public.provider_type, public.service_kind, text, text[], public.plan_kind, text, text, text, text, text, text) from public, anon;
grant execute on function public.register_provider(public.provider_type, public.service_kind, text, text[], public.plan_kind, text, text, text, text, text, text) to authenticated;

-- An admin can only mark a CAC check verified when a certificate is on file to have checked.
create or replace function public.admin_set_cac_check(p_provider uuid, p_status public.verification_status, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  if p_status not in ('verified', 'mismatch', 'failed') then raise exception 'choose verified, mismatch or failed'; end if;
  if not exists (select 1 from public.verifications where provider_id = p_provider and kind = 'cac') then
    raise exception 'this provider has no CAC check';
  end if;
  if p_status = 'verified' and not exists (
    select 1 from public.verifications where provider_id = p_provider and kind = 'cac' and document_path is not null
  ) then
    raise exception 'no CAC certificate on file to check';
  end if;
  update public.verifications
     set status = p_status,
         result = jsonb_build_object('source', 'admin', 'by', auth.uid(), 'at', now(), 'note', nullif(trim(coalesce(p_note, '')), ''))
   where provider_id = p_provider and kind = 'cac';
end $$;

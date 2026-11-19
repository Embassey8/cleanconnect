-- Car wash partner applications now require the same CAC details as shops: the business name as registered, the
-- CAC number, and an image of the certificate (private `kyc-documents` bucket, viewed by admins through short-lived
-- signed links). The full number is never stored: only its last 4 digits. An application can only be approved once a
-- certificate is on file, so an admin always has the document in front of them when they decide.
alter table public.job_applications
  add column cac_last4 text,
  add column cac_document text;

drop function public.submit_application(text, text, text, text, text, text);

create function public.submit_application(
  p_kind text, p_name text, p_phone text, p_area text, p_position text, p_note text,
  p_cac text default null, p_cac_document text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_id uuid; v_cac text := regexp_replace(coalesce(p_cac, ''), '\s', '', 'g');
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('partner', 'staff') then raise exception 'unknown application type'; end if;
  if p_kind = 'partner' and length(trim(coalesce(p_name, ''))) < 2 then raise exception 'business name as registered with CAC required'; end if;
  if p_kind = 'partner' and v_cac !~* '^(RC|BN)[0-9]{5,8}$' then raise exception 'CAC registration number required (RC or BN, e.g. RC1234567)'; end if;
  -- the certificate must have been uploaded under the applicant's own folder
  if p_kind = 'partner' and (p_cac_document is null or p_cac_document !~ ('^cac/' || uid::text || '/[A-Za-z0-9._-]+$')) then
    raise exception 'CAC certificate image required';
  end if;
  if p_kind = 'staff' and coalesce(trim(p_position), '') = '' then raise exception 'position required'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'phone required'; end if;
  insert into public.job_applications (applicant_id, kind, business_name, position, phone, area, note, cac_last4, cac_document)
  values (uid, p_kind, nullif(trim(p_name), ''), nullif(trim(p_position), ''), trim(p_phone), nullif(trim(p_area), ''), nullif(trim(p_note), ''),
          case when p_kind = 'partner' then right(v_cac, 4) end, case when p_kind = 'partner' then p_cac_document end)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'you already have an open application';
end $$;
revoke all on function public.submit_application(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_application(text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.advance_application(p_id uuid, p_stage text, p_reason text default null) returns void
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
    if a.cac_document is null then raise exception 'no CAC certificate on file: ask the applicant to re-apply with one'; end if;
    perform public.promote_partner(a.applicant_id, a.business_name, case when a.area is null then '{}' else array[a.area] end);
  end if;
  update public.job_applications
     set stage = p_stage, rejection_reason = case when p_stage = 'rejected' then trim(p_reason) end, updated_at = now()
   where id = p_id;
end $$;

-- Smile ID identity checks. In kyc_mode = 'live' registration leaves every check 'pending' and the server
-- records Smile ID's verdict; the deterministic stand-in only runs in 'mock' mode. Raw NIN/BVN/CAC numbers
-- are never stored: provider_ref keeps the last 4 digits and result keeps only non-identifying flags.

alter table public.money_settings add column kyc_mode text not null default 'mock' check (kyc_mode in ('mock', 'live'));

create or replace function public.mock_verify(kind public.verification_kind, ref text)
returns public.verification_status
language plpgsql stable set search_path = '' as $$
begin
  if exists (select 1 from public.money_settings where kyc_mode = 'live') then
    return 'pending'; -- a real provider decides
  end if;
  return case
    when ref is null or ref = '' then 'failed'::public.verification_status
    when kind = 'bvn' then 'pending'::public.verification_status
    when right(ref, 1) = '0' then 'mismatch'::public.verification_status
    else 'verified'::public.verification_status
  end;
end $$;

-- Server only (service role): store Smile ID's verdict for one check.
create function public.record_verification(p_provider uuid, p_kind public.verification_kind, p_status public.verification_status, p_result jsonb)
returns void
language sql security definer set search_path = '' as $$
  update public.verifications set status = p_status, result = coalesce(p_result, '{}')
   where provider_id = p_provider and kind = p_kind;
$$;
revoke all on function public.record_verification(uuid, public.verification_kind, public.verification_status, jsonb) from public, anon, authenticated;
grant execute on function public.record_verification(uuid, public.verification_kind, public.verification_status, jsonb) to service_role;

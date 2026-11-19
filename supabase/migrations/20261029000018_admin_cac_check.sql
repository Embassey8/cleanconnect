-- Manual CAC verification. Smile ID's business check is not live yet, so for now an admin looks the company up on
-- the public CAC register and records the result here. Only the CAC check can be set by hand; NIN and BVN always
-- come from the identity provider (or the mock stand-in). The existing triggers keep their rules: a provider is
-- only approvable once its checks pass, and a failing check takes an approved provider off the marketplace.
create function public.admin_set_cac_check(p_provider uuid, p_status public.verification_status, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_role_is('admin') then raise exception 'admin only'; end if;
  if p_status not in ('verified', 'mismatch', 'failed') then raise exception 'choose verified, mismatch or failed'; end if;
  update public.verifications
     set status = p_status,
         result = jsonb_build_object('source', 'admin', 'by', auth.uid(), 'at', now(), 'note', nullif(trim(coalesce(p_note, '')), ''))
   where provider_id = p_provider and kind = 'cac';
  if not found then raise exception 'this provider has no CAC check'; end if;
end $$;
revoke all on function public.admin_set_cac_check(uuid, public.verification_status, text) from public, anon;
grant execute on function public.admin_set_cac_check(uuid, public.verification_status, text) to authenticated;

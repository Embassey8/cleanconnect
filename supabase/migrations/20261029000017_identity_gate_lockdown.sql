-- Internal helpers and trigger functions from the identity gate are only called by other security-definer
-- functions and by triggers, so nobody needs to execute them over the API (identity_verified and
-- provider_checks_pass would otherwise let any signed-in user probe someone else's verification state).
revoke all on function public.identity_verified(uuid) from public, anon, authenticated;
revoke all on function public.identity_gate(uuid) from public, anon, authenticated;
revoke all on function public.provider_checks_pass(uuid) from public, anon, authenticated;
revoke all on function public.providers_require_verification() from public, anon, authenticated;
revoke all on function public.verifications_hide_unverified() from public, anon, authenticated;

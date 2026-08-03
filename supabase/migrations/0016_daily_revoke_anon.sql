-- Tighten the daily sign-in grants.
--
-- 0015 ended with `revoke all on function daily_signin() from public`, which reads like it closes
-- the door and does not. Supabase grants EXECUTE to `anon` and `authenticated` DIRECTLY, not through
-- PUBLIC, so revoking PUBLIC leaves both of those grants untouched. Checked against the live
-- project after applying 0015:
--
--   daily_signin  acl: postgres=X, anon=X, authenticated=X, service_role=X
--
-- Nothing leaked — daily_signin raises 'not signed in' when auth.uid() is null, and daily_history
-- filters on auth.uid() so an anonymous caller reads zero rows. This is defence in depth, not a
-- patched hole. But a revoke that does not revoke is worse than no revoke at all, because the next
-- person to read it will believe it.
revoke execute on function daily_signin() from anon;
revoke execute on function daily_history(date, date) from anon;

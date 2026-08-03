-- CLOSE EVERY SECURITY DEFINER FUNCTION THAT DOES NOT NEED TO BE OPEN.
--
-- The security advisor reported 20 functions callable by `anon` and 21 by `authenticated`. The
-- worst of them is not a warning, it is a live exploit:
--
--   _wallet_add_gold(p_user uuid, p_delta bigint)   SECURITY DEFINER, acl: anon=X, authenticated=X
--
-- It takes an arbitrary user id and an arbitrary amount, performs no auth check of any kind, and is
-- reachable over /rest/v1/rpc/_wallet_add_gold WITHOUT SIGNING IN. Anyone could mint unlimited gold
-- into any wallet, including someone else's.
--
-- 0001 already knew this and tried to prevent it:
--
--   revoke all on function _wallet_add_gold(uuid,bigint) from public;  -- internal only
--
-- and that revoke silently did nothing, for the same reason 0015's did: Supabase grants EXECUTE to
-- `anon` and `authenticated` DIRECTLY, not through PUBLIC, so revoking PUBLIC leaves both standing.
-- Every "internal only" comment in this schema has been false since the day it was written.
--
-- WHAT MAY STAY OPEN. The client calls exactly seven RPCs (grepped from src/ and server/):
-- ah_list_gear, ah_list_stack, ah_purchase, ah_unlist, daily_signin, mail_claim, mail_claim_all.
-- daily_history is kept too — it is the calendar's history read, it filters on auth.uid(), and it
-- is there for the client to adopt.
--
-- Everything else is internal, cron, or server-side:
--   * the phantom market and the expiry sweep run as pg_cron jobs, which execute as the job owner
--   * server/rewards.mjs connects with SUPABASE_SERVICE_ROLE, which this does not touch
--   * definer-to-definer calls do not consult EXECUTE grants at all
-- so nothing legitimate loses access.
--
-- anon loses EXECUTE on ALL of them: every one of these actions requires a signed-in player.

do $$
declare
  r record;
  keep text[] := array[
    'ah_list_gear', 'ah_list_stack', 'ah_purchase', 'ah_unlist',
    'daily_signin', 'daily_history', 'mail_claim', 'mail_claim_all'
  ];
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    -- Nothing here is for anonymous callers.
    execute format('revoke execute on function %s from anon', r.sig);
    -- And a signed-in player only keeps the ones the game actually calls.
    if not (r.proname = any(keep)) then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

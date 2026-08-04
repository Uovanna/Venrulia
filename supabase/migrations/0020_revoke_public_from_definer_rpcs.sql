-- 0018 DID NOT CLOSE WHAT IT SAID IT CLOSED, and the check that said it did was measuring the
-- wrong thing.
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default. 0018 revoked `anon` and
-- `authenticated` BY NAME and never touched PUBLIC, so `anon` kept EXECUTE by inheritance on every
-- definer function whose migration had not already revoked PUBLIC:
--
--   ah_buy   acl: =X/postgres | postgres=X/postgres | service_role=X/postgres
--            ^^ empty grantee is PUBLIC, and anon is a member of PUBLIC
--
-- Thirteen functions were in that state: ah_buy, ah_cancel, ah_list_gear, ah_list_stack,
-- ah_post_gear, ah_post_stack, ah_purchase, ah_unlist, import_save_economy, mail_claim,
-- mail_claim_all, mail_collect, mail_collect_all.
--
-- The verification query behind "anon can execute: 0" looked for a literal `anon=` entry in proacl
-- instead of asking has_function_privilege(). An ACL entry is not the same question as access, and
-- reading the grant table by eye cannot answer the second one. Every check below uses
-- has_function_privilege, which follows role membership.
--
-- The nine functions that DID hold are exactly the ones whose own migration already carried an
-- explicit `revoke ... from public` — including _wallet_add_gold, so the gold-minting hole 0018 was
-- written for is genuinely closed and stayed closed.
--
-- The fix is order-independent and states the end state rather than patching the difference:
-- revoke from all three principals on every definer function, then grant back to `authenticated`
-- only the eight the game actually calls. A future function created in this schema will arrive with
-- the PUBLIC default again, which is why this is written as a sweep and not a list of names.

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
    -- PUBLIC first: without this the other two revokes are cosmetic.
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
    -- Then grant back explicitly, so the game's own RPCs do not depend on a default.
    if r.proname = any(keep) then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;

-- Refuse to finish in a state that would break the game or leave the hole open. A migration that
-- silently half-applies is worse than one that fails.
do $$
declare
  bad_anon int;
  missing  text;
begin
  select count(*) into bad_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if bad_anon > 0 then
    raise exception 'anon can still execute % definer function(s)', bad_anon;
  end if;

  select string_agg(k, ', ') into missing
    from unnest(array['ah_list_gear','ah_list_stack','ah_purchase','ah_unlist',
                      'daily_signin','daily_history','mail_claim','mail_claim_all']) k
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = k
        and has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if missing is not null then
    raise exception 'the client calls these and authenticated cannot execute them: %', missing;
  end if;
end $$;

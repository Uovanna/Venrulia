-- LOCK THE AUCTION-HOUSE PRICING WEIGHTS. This closes a live hole opened by 0014.
--
-- 0014 created ah_stat_weight and never enabled row level security on it. Supabase grants the API
-- roles full table privileges by default, so the deployed state was:
--
--   ah_stat_weight  rls: false   acl: anon=arwdDxtm, authenticated=arwdDxtm, ...
--
-- `a` is insert, `w` is update, `d` is delete. Any caller — including an ANONYMOUS one — could
-- rewrite or delete the weights through /rest/v1/ah_stat_weight. ah_gear_base_value reads that
-- table to price every listing and to build the band a posted price must fall inside, so setting
-- the weights high would let a player list junk for millions, and setting them to zero would break
-- posting for everyone.
--
-- The tests written for 0014 checked that the weights MATCHED the client's. That is a correctness
-- check, and it says nothing about who is allowed to change them.
--
-- Nothing in the client reads this table: it is referenced only inside ah_gear_base_value, which is
-- SECURITY DEFINER and therefore bypasses RLS. So the table can be closed completely.
alter table ah_stat_weight enable row level security;

revoke all on table ah_stat_weight from anon, authenticated;

-- Same exposure, same fix: the price constants added alongside the weights.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ah_price_config') then
    execute 'alter table ah_price_config enable row level security';
    execute 'revoke all on table ah_price_config from anon, authenticated';
  end if;
end $$;

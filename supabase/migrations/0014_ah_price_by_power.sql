-- ============================================================
-- Realms of Eldoria — 0014: price auction listings by an item's POWER
--
-- The client began pricing items by the power they carry (7.4 x weighted-points^1.8) while
-- ah_gear_base_value here still ran `ilvl x rarity_mult`. The two disagreed, and because this
-- function is the anti-cheat surface — SECURITY DEFINER, never trusts the caller — the SERVER won:
-- the Sell screen offered an ilvl-70 epic at 7,467g inside a stated band of 1,867-13,067, and
-- ah_post_gear rejected it with "price 7467 outside band 385-2695". 385-2695 is 1,540 +/- 75%, and
-- 1,540 is exactly 70 x 22.0 — the old formula. Posting gear was impossible for anything whose two
-- prices had drifted apart, which after the repricing is every piece in the game.
--
-- This is a THIRD copy of the pricing rule (client, and the wealth model, and here). It cannot be
-- imported — Postgres has to validate without trusting the client — so it is pinned instead:
-- game-core/ah-price.test.cjs parses the weights and constants out of THIS file and fails if they
-- drift from the ones the client actually uses.
--
-- Weights, main-stat rule and Power gating below are copied from ahStatPoints / ahBaseValue in
-- src/App.jsx. Keep them identical.
-- ============================================================

-- The weighted stat table, as data rather than a wall of CASE — so the test can read it back.
create table if not exists ah_stat_weight (
  stat   text primary key,
  weight numeric not null
);
insert into ah_stat_weight (stat, weight) values
  ('str', 1), ('agi', 1), ('int', 1),          -- an item's mains suit SOME buyer; full weight
  ('sta', 0.75),
  ('armor', 0.45), ('leech', 0.45), ('resil', 0.25),
  ('vers', 0.7), ('cdr', 0.45), ('csd', 1.3), ('crit', 0.55), ('haste', 0.2),
  ('ap', 0.7), ('sp', 0.7), ('dmg', 0.7)
on conflict (stat) do update set weight = excluded.weight;

-- Pricing constants, alongside the other AH tunables.
alter table ah_config add column if not exists price_per_point numeric not null default 7.4;
alter table ah_config add column if not exists price_exponent  numeric not null default 1.8;
update ah_config set price_per_point = 7.4, price_exponent = 1.8 where id = 1;

-- The deposit was 25%, set when a best-in-slot item anchored at 1,540g. At the new prices that is
-- over 6,000g consumed whether or not the listing sells; the client already charges 6%.
update ah_config set deposit_pct = 0.06 where id = 1;

-- ---- weighted stat points for one item ----
-- Mirrors ahStatPoints: every scored stat plus its enchant, Power (ap/sp) only while it is LIVE,
-- and a weapon's damage range, which lives outside stats{}.
create or replace function ah_gear_stat_points(p_data jsonb)
returns numeric language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_stats jsonb := coalesce(p_data->'stats', '{}'::jsonb);
  v_ench  jsonb := coalesce(p_data->'enchant'->'stats', '{}'::jsonb);
  v_pts   numeric := 0;
  v_mains int := 0;
  v_power numeric;
  r record;
  v_amt numeric;
  v_wmin numeric; v_wmax numeric;
begin
  -- itemPowerActive: Power counts only on a piece with exactly ONE main stat. On dual-main gear it
  -- is dormant, and a buyer cannot spend what the item will not give.
  select count(*) into v_mains from (values ('str'),('agi'),('int')) as m(k)
    where coalesce((v_stats->>m.k)::numeric, 0) + coalesce((v_ench->>m.k)::numeric, 0) > 0;
  v_power := coalesce((v_stats->>'ap')::numeric, 0) + coalesce((v_stats->>'sp')::numeric, 0);

  for r in select stat, weight from ah_stat_weight loop
    if r.stat in ('ap','sp') and not (v_power > 0 and v_mains = 1) then continue; end if;
    v_amt := coalesce((v_stats->>r.stat)::numeric, 0) + coalesce((v_ench->>r.stat)::numeric, 0);
    if v_amt <> 0 then v_pts := v_pts + v_amt * r.weight; end if;
  end loop;

  v_wmin := (p_data->'wdmg'->>'min')::numeric;
  v_wmax := (p_data->'wdmg'->>'max')::numeric;
  if v_wmin is not null and v_wmax is not null then
    v_pts := v_pts + ((v_wmin + v_wmax) / 2.0)
                   * coalesce((select weight from ah_stat_weight where stat = 'dmg'), 0.7);
  end if;

  return v_pts;
end $$;

-- ---- the value anchor ----
create or replace function ah_gear_base_value(p_data jsonb)
returns bigint language plpgsql stable set search_path = public, pg_temp as $$
declare
  cfg       ah_config;
  v_pts     numeric := ah_gear_stat_points(p_data);
  v_sockets int := coalesce(jsonb_array_length(p_data->'sockets'), 0);
  v         numeric;
begin
  select * into cfg from ah_config where id = 1;

  if v_pts is null or v_pts <= 0 then
    -- A relic, or anything else with no scorable stats, still needs a price rather than a zero.
    v := greatest(1, round(coalesce((p_data->>'ilvl')::numeric, 1)
         * coalesce((select mult from rarity_value_mult where rarity = p_data->>'rarity'), 1)));
  else
    v := greatest(1, round(cfg.price_per_point * power(v_pts, cfg.price_exponent)));
  end if;

  if v_sockets > 0 then v := round(v * (1 + 0.08 * v_sockets)); end if;   -- power the buyer can add
  if (p_data->'enchant') is not null and (p_data->'enchant') <> 'null'::jsonb then v := round(v * 1.10); end if;
  return greatest(1, v)::bigint;
end $$;

grant select on ah_stat_weight to authenticated;

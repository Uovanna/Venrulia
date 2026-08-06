-- SAME BUG, SERVER SIDE, and it predates the Abyss. ah_gear_stat_points reads
-- p_data->'enchant'->'stats', but an enchant is a FLAT map: enchantGear writes { "agi": 28 } and
-- effectiveStats reads it that way. Nothing in this game has ever produced enchant.stats, so every
-- enchanted item has been priced as though its enchant granted nothing while still collecting the
-- 10% enchanted premium. Client and server agreed only because both were wrong the same way.
--
-- It matters more now: an Abyss +10 piece takes a +34 enchant, and that was worth zero gold.
--
-- ONE LINE changes. Everything else is 0014's function verbatim, because the main-stat count and
-- the Power gate are subtle and this is a pricing fix, not a rewrite.
create or replace function ah_gear_stat_points(p_data jsonb)
returns numeric language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_stats jsonb := coalesce(p_data->'stats', '{}'::jsonb);
  -- FLAT, with the nested shape kept only as a fallback. See the note above.
  v_e     jsonb := coalesce(p_data->'enchant', '{}'::jsonb);
  v_ench  jsonb := case when v_e = 'null'::jsonb then '{}'::jsonb
                        when v_e ? 'stats' then coalesce(v_e->'stats', '{}'::jsonb)
                        else v_e end;
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

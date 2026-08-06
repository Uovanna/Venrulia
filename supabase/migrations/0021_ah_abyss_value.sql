-- ABYSS GEAR HAS TO BE LISTABLE, and at what it is actually worth.
--
-- The auction house does not trust the client with a price: ah_list_gear recomputes the base value
-- server-side with ah_gear_base_value and refuses anything outside the band around it. That
-- function prices from stats alone, so an Abyss +7 legendary — which a player may have spent weeks
-- reaching — would be valued like the ilvl 71 raid drop it superficially resembles, and a listing
-- at its real price would be REJECTED as out of band. The feature would have shipped with its
-- headline item unsellable.
--
-- The premium is a flat floor on top of whatever the stats are worth: 100,000 at Abyss +0, and
-- 50,000 more per + rank. An Abyss +7 piece floors at 450,000 before a single stat is counted.
--
-- It is added AFTER the socket and enchant multipliers, matching the client exactly. Folding it in
-- first would let those multipliers act on the floor too — three empty sockets would add 24,000
-- gold — and the premium describes where the item came from, not something sockets can amplify.
--
-- The numbers live in ah_config rather than in the function body so they are data a migration can
-- change, and so game-core/ah-price.test.cjs can pin them against the client's AH_PRICE. Every
-- pricing bug this project has had came from the same formula written twice in two languages; the
-- test is what stops the third.

alter table ah_config add column if not exists abyss_base      bigint  not null default 100000;
alter table ah_config add column if not exists abyss_per_plus  bigint  not null default 50000;
update ah_config set abyss_base = 100000, abyss_per_plus = 50000 where id = 1;

create or replace function ah_gear_base_value(p_data jsonb)
returns bigint language plpgsql stable set search_path = public, pg_temp as $$
declare
  cfg       ah_config;
  v_pts     numeric := ah_gear_stat_points(p_data);
  v_sockets int := coalesce(jsonb_array_length(p_data->'sockets'), 0);
  v_abyss   int;
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

  -- The Abyss premium, last, exactly as the client applies it. A missing key means the piece did
  -- not come from the Abyss and gets nothing; a present one is clamped to the ladder's range so a
  -- forged save cannot claim Abyss +9999 and mint a price out of it.
  if (p_data ? 'abyss') and (p_data->>'abyss') is not null then
    v_abyss := greatest(0, least(10, coalesce((p_data->>'abyss')::int, 0)));
    v := v + cfg.abyss_base + cfg.abyss_per_plus * v_abyss;
  end if;

  return greatest(1, v)::bigint;
end $$;

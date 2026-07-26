-- ============================================================
-- Realms of Eldoria — 0004 expiry + phantom liquidity + schedules
-- These run as scheduled system jobs (postgres role), not client RPCs.
-- ============================================================
create extension if not exists pg_cron;

-- ---- expire listings past their 48h window: player goods returned via mail, phantom just closed ----
create or replace function ah_expire_sweep()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l ah_listing; n int := 0;
begin
  for v_l in select * from ah_listing where status = 'active' and expires_at < now() for update loop
    if v_l.phantom then
      update ah_listing set status = 'expired' where id = v_l.id;
    else
      if v_l.kind = 'gear' then
        update item set owner_id = v_l.seller_id where id = v_l.item_id;
        insert into mail(user_id, kind, payload) values
          (v_l.seller_id, 'expired', jsonb_build_object('item_id', v_l.item_id, 'subject', coalesce((select data->>'name' from item where id=v_l.item_id),'item'), 'from', 'Auction House'));
      else
        insert into mail(user_id, kind, payload) values
          (v_l.seller_id, 'expired', jsonb_build_object('mat_kind', v_l.kind, 'mat_id', v_l.mat_id, 'qty', v_l.qty, 'subject', v_l.mat_id||' x'||v_l.qty, 'from', 'Auction House'));
      end if;
      update ah_listing set status = 'expired' where id = v_l.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---- phantom DEMAND: buyers take player listings over time, price-sensitively (your client curve) ----
-- chance/hour = clamp(0.95*exp(-1.9*(ratio-0.4)), 0.02, 0.95); run every 5 min.
create or replace function ah_phantom_demand()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_l ah_listing; n int := 0;
  v_ratio numeric; v_ph numeric; v_run numeric;
  v_tax_pct numeric := (select tax_pct from ah_config where id = 1);
  v_net bigint; v_tax bigint; v_subject text;
begin
  for v_l in select * from ah_listing where status = 'active' and not phantom for update loop
    v_ratio := v_l.price::numeric / greatest(1, v_l.base_value);
    v_ph := least(0.95, greatest(0.02, 0.95 * exp(-1.9 * (least(1.75, greatest(0.25, v_ratio)) - 0.4))));
    v_run := v_ph * (5.0/60.0);                    -- 5-minute slice of the hourly chance
    if random() < v_run then
      v_tax := floor(v_l.price * v_tax_pct); v_net := v_l.price - v_tax;
      v_subject := case when v_l.kind='gear' then coalesce((select data->>'name' from item where id=v_l.item_id),'item') else v_l.mat_id||' x'||v_l.qty end;
      insert into mail(user_id, kind, payload) values
        (v_l.seller_id, 'sale', jsonb_build_object('gold', v_net, 'gross', v_l.price, 'tax', v_tax, 'net', v_net, 'subject', v_subject, 'from', 'a buyer'));
      insert into ledger(user_id, kind, gold, ref) values (v_l.seller_id,'sale',v_net,v_l.id),(v_l.seller_id,'tax',-v_tax,v_l.id);
      update ah_listing set status='sold' where id=v_l.id;   -- phantom buyer keeps the goods
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---- phantom SUPPLY (materials/drops): top standing stacks up to a floor ----
create or replace function ah_phantom_supply_stacks(p_floor int default 10)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_have int; v_need int; r record; v_base bigint; v_lo bigint; v_hi bigint; v_dep bigint; v_price bigint; n int := 0;
begin
  select count(*) into v_have from ah_listing where status='active' and phantom and kind in ('mat','drop');
  v_need := greatest(0, p_floor - v_have);
  for r in select kind, mat_id from ah_mat_value order by random() limit v_need loop
    v_base := ah_stack_base_value(r.kind, r.mat_id);
    select lo, hi, deposit into v_lo, v_hi, v_dep from ah_band(v_base);
    v_price := least(v_hi, greatest(v_lo, round(v_base * (0.75 + random()*0.6))::bigint));
    insert into ah_listing(seller_id, kind, mat_id, qty, price, base_value, deposit, phantom, expires_at)
      values (null,  -- system seller; never paid (phantom=true)
              r.kind, r.mat_id, (select stack_size from ah_config where id=1), v_price, v_base, 0, true,
              now() + make_interval(mins => (25 + floor(random()*85))::int));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---- phantom SUPPLY (gear): inserted by an Edge Function that runs the game's item generator ----
-- Gear must be *generated* (on-theme, class-varied, no legendary/artifact), which belongs in JS,
-- not SQL. The Edge Function generates an item, then calls THIS admin RPC, which re-derives the
-- band server-side so pricing stays authoritative. Grant execute to the service_role only.
create or replace function ah_insert_phantom_gear(p_data jsonb, p_price bigint)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item_id uuid; v_base bigint; v_lo bigint; v_hi bigint; v_dep bigint; v_id uuid;
begin
  v_base := ah_gear_base_value(p_data);
  select lo, hi into v_lo, v_hi from ah_band(v_base);
  insert into item(owner_id, data, bound) values (null, p_data, false) returning id into v_item_id;
  insert into ah_listing(seller_id, kind, item_id, price, base_value, deposit, phantom, expires_at)
    values (null,
            'gear', v_item_id, least(v_hi, greatest(v_lo, p_price)), v_base, 0, true,
            now() + make_interval(mins => (25 + floor(random()*85))::int))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function ah_insert_phantom_gear(jsonb,bigint) from public, authenticated;
grant execute on function ah_insert_phantom_gear(jsonb,bigint) to service_role;

-- system jobs only — never callable by players (a user triggering demand would farm payouts)
revoke all on function ah_expire_sweep()            from public;
revoke all on function ah_phantom_demand()          from public;
revoke all on function ah_phantom_supply_stacks(int) from public;

-- ---- schedules (idempotent) ----
select cron.schedule('ah-expire',   '*/2 * * * *', $$select ah_expire_sweep();$$)          where not exists (select 1 from cron.job where jobname='ah-expire');
select cron.schedule('ah-demand',   '*/5 * * * *', $$select ah_phantom_demand();$$)         where not exists (select 1 from cron.job where jobname='ah-demand');
select cron.schedule('ah-stacks',   '*/5 * * * *', $$select ah_phantom_supply_stacks(10);$$) where not exists (select 1 from cron.job where jobname='ah-stacks');
-- gear top-up is driven by an external Edge Function on its own schedule (see supabase/README.md).

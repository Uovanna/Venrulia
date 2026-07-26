-- ============================================================
-- Realms of Eldoria — 0005 one-time economy import
-- Seeds the server-owned economy (wallet + items + materials) from the client's
-- existing save, exactly once per player. Idempotent via wallet.imported.
-- Call this on first authenticated load, then route all economy actions through RPCs.
-- ============================================================

create or replace function import_save_economy(
  p_gold      bigint,
  p_ven       int,
  p_items     jsonb default '[]'::jsonb,   -- array of item objects
  p_materials jsonb default '{}'::jsonb,   -- { mat_id: qty }
  p_drops     jsonb default '{}'::jsonb    -- { drop_id: qty }
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_it  jsonb; k text; q bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into wallet(user_id, gold, ven, imported)
    values (v_uid, greatest(0, coalesce(p_gold,0)), greatest(0, coalesce(p_ven,0)), true)
    on conflict (user_id) do nothing;
  if not found then
    -- wallet already existed
    if (select imported from wallet where user_id = v_uid) then
      return false;                        -- already imported: no-op
    end if;
    update wallet set gold = greatest(0, coalesce(p_gold,0)), ven = greatest(0, coalesce(p_ven,0)), imported = true
      where user_id = v_uid;
  end if;

  -- items (relics & artifacts are marked bound → never AH-tradeable)
  for v_it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into item(owner_id, data, bound) values (
      v_uid, v_it,
      ( (v_it->>'slotId') = 'relic'
        or (v_it ? 'relicId')
        or coalesce((v_it->>'artifact')::boolean, false) )
    );
  end loop;

  -- materials + drops
  for k, q in select key, value::text::bigint from jsonb_each_text(coalesce(p_materials,'{}'::jsonb)) loop
    if q > 0 then insert into material(user_id, kind, mat_id, qty) values (v_uid,'mat',k,q)
      on conflict (user_id, kind, mat_id) do update set qty = excluded.qty; end if;
  end loop;
  for k, q in select key, value::text::bigint from jsonb_each_text(coalesce(p_drops,'{}'::jsonb)) loop
    if q > 0 then insert into material(user_id, kind, mat_id, qty) values (v_uid,'drop',k,q)
      on conflict (user_id, kind, mat_id) do update set qty = excluded.qty; end if;
  end loop;

  insert into ledger(user_id, kind, gold, meta) values (v_uid, 'import', coalesce(p_gold,0), jsonb_build_object('items', jsonb_array_length(coalesce(p_items,'[]'::jsonb))));
  return true;
end $$;

grant execute on function import_save_economy(bigint,int,jsonb,jsonb,jsonb) to authenticated;

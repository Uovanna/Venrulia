-- ============================================================
-- Realms of Eldoria — 0003 auction house RPCs (the anti-cheat surface)
-- Every mutation: SECURITY DEFINER, checks auth.uid(), runs in one transaction,
-- reads gold/goods from the SERVER (never trusts the caller's numbers).
-- ============================================================

-- ---- POST GEAR ----
create or replace function ah_post_gear(p_item_id uuid, p_price bigint)
returns ah_listing language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_it  item;
  v_base bigint; v_lo bigint; v_hi bigint; v_dep bigint;
  v_hours int := (select list_hours from ah_config where id = 1);
  v_row ah_listing;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_it from item where id = p_item_id for update;
  if not found or v_it.owner_id <> v_uid then raise exception 'not your item'; end if;
  if v_it.bound then raise exception 'this item cannot be listed'; end if;

  v_base := ah_gear_base_value(v_it.data);
  select lo, hi, deposit into v_lo, v_hi, v_dep from ah_band(v_base);
  if p_price < v_lo or p_price > v_hi then raise exception 'price % outside band %-%', p_price, v_lo, v_hi; end if;
  if not _wallet_add_gold(v_uid, -v_dep) then raise exception 'insufficient gold for % deposit', v_dep; end if;

  update item set owner_id = null where id = p_item_id;            -- escrow
  insert into ah_listing(seller_id, kind, item_id, price, base_value, deposit, expires_at)
    values (v_uid, 'gear', p_item_id, p_price, v_base, v_dep, now() + make_interval(hours => v_hours))
    returning * into v_row;
  insert into ledger(user_id, kind, gold, ref, meta) values (v_uid, 'deposit', -v_dep, v_row.id, jsonb_build_object('item', p_item_id));
  return v_row;
end $$;

-- ---- POST STACK (materials / drops, fixed stack size) ----
create or replace function ah_post_stack(p_kind text, p_mat_id text, p_price bigint)
returns ah_listing language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_size int := (select stack_size from ah_config where id = 1);
  v_base bigint; v_lo bigint; v_hi bigint; v_dep bigint;
  v_hours int := (select list_hours from ah_config where id = 1);
  v_row ah_listing; v_have bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('mat','drop') then raise exception 'bad kind'; end if;

  v_base := ah_stack_base_value(p_kind, p_mat_id);
  select lo, hi, deposit into v_lo, v_hi, v_dep from ah_band(v_base);
  if p_price < v_lo or p_price > v_hi then raise exception 'price % outside band %-%', p_price, v_lo, v_hi; end if;

  -- debit the stack atomically
  update material set qty = qty - v_size
    where user_id = v_uid and kind = p_kind and mat_id = p_mat_id and qty >= v_size
    returning qty into v_have;
  if not found then raise exception 'need % of %/% to post', v_size, p_kind, p_mat_id; end if;

  if not _wallet_add_gold(v_uid, -v_dep) then
    update material set qty = qty + v_size where user_id = v_uid and kind = p_kind and mat_id = p_mat_id; -- refund stack
    raise exception 'insufficient gold for % deposit', v_dep;
  end if;

  insert into ah_listing(seller_id, kind, mat_id, qty, price, base_value, deposit, expires_at)
    values (v_uid, p_kind, p_mat_id, v_size, p_price, v_base, v_dep, now() + make_interval(hours => v_hours))
    returning * into v_row;
  insert into ledger(user_id, kind, gold, ref, meta) values (v_uid, 'deposit', -v_dep, v_row.id, jsonb_build_object('mat', p_mat_id, 'kind', p_kind));
  return v_row;
end $$;

-- ---- BUY (phantom or real player listing) ----
create or replace function ah_buy(p_listing_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_l ah_listing;
  v_tax_pct numeric := (select tax_pct from ah_config where id = 1);
  v_net bigint; v_tax bigint;
  v_subject text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_l from ah_listing where id = p_listing_id for update;
  if not found or v_l.status <> 'active' then raise exception 'listing unavailable'; end if;
  if v_l.seller_id = v_uid then raise exception 'cannot buy your own listing'; end if;

  if not _wallet_add_gold(v_uid, -v_l.price) then raise exception 'not enough gold'; end if;  -- gold leaves the economy here

  v_tax := floor(v_l.price * v_tax_pct);
  v_net := v_l.price - v_tax;
  v_subject := case when v_l.kind = 'gear'
                    then coalesce((select data->>'name' from item where id = v_l.item_id), 'item')
                    else v_l.mat_id || ' x' || v_l.qty end;

  -- deliver goods to the BUYER via mail
  if v_l.kind = 'gear' then
    insert into mail(user_id, kind, payload) values
      (v_uid, 'purchase', jsonb_build_object('item_id', v_l.item_id, 'from', 'Auction House', 'subject', v_subject, 'gross', v_l.price));
  else
    insert into mail(user_id, kind, payload) values
      (v_uid, 'purchase', jsonb_build_object('mat_kind', v_l.kind, 'mat_id', v_l.mat_id, 'qty', v_l.qty, 'from', 'Auction House', 'subject', v_subject, 'gross', v_l.price));
  end if;

  -- pay the SELLER (net of tax) via mail — unless the seller is the phantom system
  if not v_l.phantom then
    insert into mail(user_id, kind, payload) values
      (v_l.seller_id, 'sale', jsonb_build_object('gold', v_net, 'gross', v_l.price, 'tax', v_tax, 'net', v_net, 'subject', v_subject, 'from', 'a buyer'));
    insert into ledger(user_id, kind, gold, ref) values (v_l.seller_id, 'sale', v_net, v_l.id), (v_l.seller_id, 'tax', -v_tax, v_l.id);
  end if;

  update ah_listing set status = 'sold', buyer_id = v_uid where id = v_l.id;
  insert into ledger(user_id, kind, gold, ref, meta) values (v_uid, 'buy', -v_l.price, v_l.id, jsonb_build_object('phantom', v_l.phantom));
end $$;

-- ---- CANCEL (return goods; deposit already spent) ----
create or replace function ah_cancel(p_listing_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_l ah_listing;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_l from ah_listing where id = p_listing_id for update;
  if not found or v_l.seller_id <> v_uid or v_l.status <> 'active' then raise exception 'listing unavailable'; end if;

  if v_l.kind = 'gear' then
    update item set owner_id = v_uid where id = v_l.item_id;
  else
    insert into material(user_id, kind, mat_id, qty) values (v_uid, v_l.kind, v_l.mat_id, v_l.qty)
      on conflict (user_id, kind, mat_id) do update set qty = material.qty + excluded.qty;
  end if;
  update ah_listing set status = 'cancelled' where id = v_l.id;
  insert into ledger(user_id, kind, ref) values (v_uid, 'cancel', v_l.id);
end $$;

-- ---- COLLECT MAIL ----
create or replace function _collect_one(p_uid uuid, p_mail mail) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g bigint;
begin
  g := coalesce((p_mail.payload->>'gold')::bigint, 0);
  if g <> 0 then perform _wallet_add_gold(p_uid, g); end if;
  if p_mail.payload ? 'item_id' then
    update item set owner_id = p_uid where id = (p_mail.payload->>'item_id')::uuid;
  end if;
  if p_mail.payload ? 'mat_id' then
    insert into material(user_id, kind, mat_id, qty)
      values (p_uid, p_mail.payload->>'mat_kind', p_mail.payload->>'mat_id', (p_mail.payload->>'qty')::bigint)
      on conflict (user_id, kind, mat_id) do update set qty = material.qty + excluded.qty;
  end if;
  update mail set collected = true where id = p_mail.id;
  insert into ledger(user_id, kind, gold, ref) values (p_uid, 'collect', g, p_mail.id);
end $$;
revoke all on function _collect_one(uuid, mail) from public;  -- internal only; forging a mail row would mint gold

create or replace function mail_collect(p_mail_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_m mail;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from mail where id = p_mail_id and user_id = v_uid and not collected for update;
  if not found then raise exception 'mail unavailable'; end if;
  perform _collect_one(v_uid, v_m);
end $$;

create or replace function mail_collect_all()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_m mail; n int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  for v_m in select * from mail where user_id = v_uid and not collected for update loop
    perform _collect_one(v_uid, v_m); n := n + 1;
  end loop;
  return n;
end $$;

-- clients may EXECUTE these; they cannot touch the tables directly
grant execute on function ah_post_gear(uuid,bigint), ah_post_stack(text,text,bigint),
  ah_buy(uuid), ah_cancel(uuid), mail_collect(uuid), mail_collect_all() to authenticated;

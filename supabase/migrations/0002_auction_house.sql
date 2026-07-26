-- ============================================================
-- Realms of Eldoria — 0002 auction house tables + value functions
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ah_status') then
    create type ah_status as enum ('active','sold','expired','cancelled');
  end if;
end $$;

create table if not exists ah_listing (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid references auth.users on delete cascade,   -- NULL for phantom (system) listings
  kind       text not null check (kind in ('gear','mat','drop')),
  item_id    uuid references item,            -- gear (escrowed)
  mat_id     text,
  qty        int,
  price      bigint not null check (price > 0),
  base_value bigint not null,                 -- server-computed anchor (band + tax key off this)
  deposit    bigint not null,
  status     ah_status not null default 'active',
  phantom    boolean not null default false,  -- backend liquidity; never surfaced as such
  posted_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  buyer_id   uuid references auth.users
);
create index if not exists ah_active_idx  on ah_listing(status, kind, expires_at);
create index if not exists ah_seller_idx  on ah_listing(seller_id, status);

create table if not exists mail (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null check (kind in ('sale','purchase','expired')),
  payload    jsonb not null,                  -- { gold, gross, tax, net, item_id, mat_kind, mat_id, qty, from, subject }
  collected  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mail_user_idx on mail(user_id, collected, created_at desc);

alter table ah_listing enable row level security;
alter table mail       enable row level security;

-- browse: anyone sees ACTIVE listings; sellers also see their own non-active ones
create policy ah_browse on ah_listing for select
  using (status = 'active' or seller_id = auth.uid());
create policy mail_read on mail for select using (user_id = auth.uid());

grant select on ah_listing, mail to authenticated;

-- ---- value functions (server-authoritative; clients cannot influence these) ----

-- gear base value = round(ilvl * rarity.valueMult) * socket & enchant premiums
create or replace function ah_gear_base_value(p_data jsonb)
returns bigint language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_ilvl    numeric := coalesce((p_data->>'ilvl')::numeric, 1);
  v_mult    numeric := coalesce((select mult from rarity_value_mult where rarity = p_data->>'rarity'), 1);
  v_sockets int     := coalesce(jsonb_array_length(p_data->'sockets'), 0);
  v         numeric := greatest(1, round(v_ilvl * v_mult));
begin
  if v_sockets > 0 then v := round(v * (1 + 0.08 * v_sockets)); end if;
  if (p_data->'enchant') is not null and (p_data->'enchant') <> 'null'::jsonb then v := round(v * 1.10); end if;
  return greatest(1, v)::bigint;
end $$;

create or replace function ah_stack_base_value(p_kind text, p_mat_id text)
returns bigint language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_unit int := (select unit_value from ah_mat_value where kind = p_kind and mat_id = p_mat_id);
  v_size int := (select stack_size from ah_config where id = 1);
begin
  if v_unit is null then raise exception 'unknown material %/% (seed ah_mat_value)', p_kind, p_mat_id; end if;
  return greatest(1, v_unit::bigint * v_size);
end $$;

-- returns the legal [lo, hi] band + deposit for a base value
create or replace function ah_band(p_base bigint, out lo bigint, out hi bigint, out deposit bigint)
language plpgsql stable set search_path = public, pg_temp as $$
declare cfg ah_config; begin
  select * into cfg from ah_config where id = 1;
  lo := greatest(1, ceil(p_base * (1 - cfg.band_pct)))::bigint;
  hi := floor(p_base * (1 + cfg.band_pct))::bigint;
  deposit := greatest(1, floor(p_base * cfg.deposit_pct))::bigint;
end $$;

-- expose ah_listing + mail over Realtime so clients get live updates
do $$ begin
  begin execute 'alter publication supabase_realtime add table ah_listing'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table mail';       exception when duplicate_object then null; end;
end $$;

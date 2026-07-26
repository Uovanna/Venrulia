-- ============================================================
-- Realms of Eldoria — 0001 economy core
-- Server-owned economy: wallet (gold/ven), tradeable items, materials, audit ledger.
-- Clients may READ their own rows; they may NEVER write them. All mutation happens
-- through SECURITY DEFINER RPCs (later migrations), which do their own auth checks.
-- ============================================================

-- ---- tunable config (mirrors the client AH_ECON; single source of truth on the server) ----
create table if not exists ah_config (
  id          int primary key default 1,
  band_pct    numeric not null default 0.75,   -- legal price band = base ± this
  deposit_pct numeric not null default 0.25,   -- listing deposit (consumed)
  tax_pct     numeric not null default 0.15,   -- sale cut (gold sink)
  stack_size  int     not null default 50,     -- mats/drops post in fixed stacks
  list_hours  int     not null default 48,     -- player listing lifetime
  constraint ah_config_singleton check (id = 1)
);
insert into ah_config (id) values (1) on conflict (id) do nothing;

-- ---- rarity value multipliers (keep in sync with client RARITIES[].valueMult) ----
create table if not exists rarity_value_mult (
  rarity text primary key,
  mult   numeric not null
);
insert into rarity_value_mult (rarity, mult) values
  ('poor',0.4),('common',1.0),('uncommon',3.0),('rare',8.0),
  ('epic',22.0),('legendary',60.0),('artifact',60.0)
on conflict (rarity) do update set mult = excluded.mult;

-- ---- per-unit value for postable materials/drops (seeded by the app from its tier math) ----
-- kind is 'mat' or 'drop'; unit_value is the gold value of ONE unit.
create table if not exists ah_mat_value (
  kind       text not null check (kind in ('mat','drop')),
  mat_id     text not null,
  unit_value int  not null check (unit_value > 0),
  primary key (kind, mat_id)
);

-- ---- wallet: one row per player ----
create table if not exists wallet (
  user_id    uuid primary key references auth.users on delete cascade,
  gold       bigint not null default 0 check (gold >= 0),
  ven        int    not null default 0 check (ven  >= 0),
  imported   boolean not null default false,   -- one-time save import guard
  updated_at timestamptz not null default now()
);

-- ---- tradeable items (a row exists once an item can enter the AH) ----
create table if not exists item (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references auth.users on delete cascade,   -- NULL while escrowed in the AH
  data       jsonb not null,                                 -- the client item object
  bound      boolean not null default false,                 -- relics/artifacts: never AH-tradeable
  created_at timestamptz not null default now()
);
create index if not exists item_owner_idx on item(owner_id);

-- ---- server-owned material / drop counts ----
create table if not exists material (
  user_id uuid not null references auth.users on delete cascade,
  kind    text not null check (kind in ('mat','drop')),
  mat_id  text not null,
  qty     bigint not null default 0 check (qty >= 0),
  primary key (user_id, kind, mat_id)
);

-- ---- append-only audit ledger (indispensable for exploit-hunting / rollbacks) ----
create table if not exists ledger (
  id        bigint generated always as identity primary key,
  user_id   uuid,
  kind      text not null,            -- 'deposit','buy','sale','tax','cancel','collect','import','phantom'
  gold      bigint not null default 0,
  ref       uuid,                     -- listing/mail id when relevant
  meta      jsonb,
  at        timestamptz not null default now()
);
create index if not exists ledger_user_idx on ledger(user_id, at desc);

-- ============================================================
-- Row Level Security: read-your-own only. No client writes anywhere.
-- ============================================================
alter table wallet   enable row level security;
alter table item     enable row level security;
alter table material enable row level security;
alter table ledger   enable row level security;
alter table ah_config        enable row level security;
alter table rarity_value_mult enable row level security;
alter table ah_mat_value     enable row level security;

create policy wallet_read   on wallet   for select using (auth.uid() = user_id);
create policy item_read     on item     for select using (auth.uid() = owner_id);
create policy material_read on material for select using (auth.uid() = user_id);
create policy ledger_read   on ledger   for select using (auth.uid() = user_id);
-- config/lookup tables are world-readable (no secrets)
create policy cfg_read   on ah_config        for select using (true);
create policy rmult_read on rarity_value_mult for select using (true);
create policy matv_read  on ah_mat_value     for select using (true);

grant select on wallet, item, material, ledger, ah_config, rarity_value_mult, ah_mat_value to authenticated;

-- ---- internal helper: adjust gold with a floor check; returns false if it would go negative ----
create or replace function _wallet_add_gold(p_user uuid, p_delta bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into wallet(user_id) values (p_user) on conflict (user_id) do nothing;
  update wallet set gold = gold + p_delta, updated_at = now()
    where user_id = p_user and gold + p_delta >= 0;
  return found;
end $$;
revoke all on function _wallet_add_gold(uuid,bigint) from public;  -- internal only; callers are SECURITY DEFINER RPCs

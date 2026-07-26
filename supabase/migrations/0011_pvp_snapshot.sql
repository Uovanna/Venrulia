-- Live Arena ladder: each player publishes a defense snapshot (loadout + record).
-- rating is a generated column (same formula as client arenaRating), self-only writes, public reads.
create table if not exists pvp_snapshot (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null, cls text not null, spec text,
  level int not null default 60, power int not null default 0,
  wins int not null default 0 check (wins>=0), losses int not null default 0 check (losses>=0),
  rating int generated always as (case when (wins+losses)=0 then 1000
    else (1000 + round(1000.0 * (wins::numeric/(wins+losses)) * log(10.0,(wins+losses+1)::numeric)))::int end) stored,
  updated_at timestamptz not null default now()
);
create index if not exists pvp_rating_idx on pvp_snapshot(rating desc);
alter table pvp_snapshot enable row level security;
create policy pvp_read on pvp_snapshot for select using (true);
create policy pvp_insert on pvp_snapshot for insert with check (auth.uid()=user_id);
create policy pvp_update on pvp_snapshot for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select, insert, update on pvp_snapshot to authenticated;

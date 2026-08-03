-- DAILY SIGN-IN — the server owns the clock and the dice.
--
-- Nothing in the client can be trusted with either. Everything else in the game reads Date.now()
-- from the device, which is fine for combat pacing but not for a reward gated on "a new day": a
-- player who moves their device clock forward would claim thirty days in a minute and take the
-- day-30 legendary straight away.
--
-- So a claim is an RPC. The row is stamped with the DATABASE's now(), and the (user, utc_day)
-- primary key is what makes a second claim on the same day impossible — not a check the client
-- performs, and not a check this function performs, but the storage engine refusing the insert.
--
-- The RPC also returns the SEED for the day's reward roll. The client generates the actual item
-- from it with the same seeded RNG the rest of the game uses (game-core/rng.mjs), so the item is
-- reproducible, verifiable, and — because the seed is stored — cannot be re-rolled by replaying
-- the call. Generating gear in plpgsql would mean a fourth copy of the item tables in a fourth
-- language; the auction house already taught us what that costs.
--
-- UTC is the day boundary. One global reset, so every player's weekend is the same day, and the
-- streak cannot be nudged by moving timezone.

create table if not exists daily_claim (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  utc_day    date        not null,
  streak     int         not null,
  seed       bigint      not null,
  is_weekend boolean     not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, utc_day)
);

alter table daily_claim enable row level security;
create policy daily_claim_read on daily_claim for select using (auth.uid() = user_id);

create index if not exists daily_claim_user_day on daily_claim (user_id, utc_day desc);

-- STREAK RULE: a missed day costs ONE day, it does not reset to zero. This system exists to bring
-- lapsed players back, and a hard reset punishes exactly the player it is meant to recover. Miss
-- two days at a streak of 20 and you return on 18, not on 1.
--
-- Returns one row:
--   streak      the streak AFTER this claim (1-based; the number the rewards key off)
--   utc_day     the day claimed, so the client can render the calendar tile
--   is_weekend  Saturday or Sunday in UTC
--   seed        deterministic per (user, day); the client rolls the item from it
--   fresh       true if this call performed the claim, false if today was already claimed
create or replace function daily_signin()
returns table (streak int, utc_day date, is_weekend boolean, seed bigint, fresh boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user  uuid := auth.uid();
  v_today date;
  v_prev  daily_claim%rowtype;
  v_gap   int;
  v_next  int;
  v_seed  bigint;
  v_wknd  boolean;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  -- The database's clock, never the caller's.
  v_today := (now() at time zone 'utc')::date;

  -- Already claimed today: hand back the SAME row, including the same seed, so a replayed call
  -- cannot re-roll the item.
  select * into v_prev from daily_claim d where d.user_id = v_user and d.utc_day = v_today;
  if found then
    return query select v_prev.streak, v_prev.utc_day, v_prev.is_weekend, v_prev.seed, false;
    return;
  end if;

  select * into v_prev from daily_claim d
    where d.user_id = v_user and d.utc_day < v_today
    order by d.utc_day desc limit 1;

  if not found then
    v_next := 1;
  else
    v_gap := v_today - v_prev.utc_day;          -- 1 = consecutive
    -- One day missed costs one day of streak. Floor at 1: a returning player still claims today.
    v_next := greatest(1, v_prev.streak + 1 - (v_gap - 1));
  end if;

  -- Deterministic per user and day, so the same claim always produces the same item, and two
  -- players claiming the same day get different ones.
  v_seed := abs(('x' || substr(md5(v_user::text || v_today::text), 1, 15))::bit(60)::bigint);
  v_wknd := extract(isodow from v_today) in (6, 7);

  insert into daily_claim (user_id, utc_day, streak, seed, is_weekend)
  values (v_user, v_today, v_next, v_seed, v_wknd);

  return query select v_next, v_today, v_wknd, v_seed, true;
end $$;

revoke all on function daily_signin() from public;
grant execute on function daily_signin() to authenticated;

-- The calendar needs the month's history to render claimed/missed tiles. Read-only, and RLS
-- already restricts the table to the caller's own rows.
create or replace function daily_history(p_from date, p_to date)
returns table (utc_day date, streak int, is_weekend boolean)
language sql security definer set search_path = public, pg_temp as $$
  select d.utc_day, d.streak, d.is_weekend
    from daily_claim d
   where d.user_id = auth.uid() and d.utc_day between p_from and p_to
   order by d.utc_day;
$$;

revoke all on function daily_history(date, date) from public;
grant execute on function daily_history(date, date) to authenticated;

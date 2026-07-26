# Realms of Eldoria — Going Online (Auction House + Async Multiplayer)

This is the implementation guide for turning the current single-player client into an
online game with a **real cross-player Auction House** and **asynchronous multiplayer**
(async PvP, async co-op/guild, leaderboards).

Because you're OK with **asynchronous PvP**, you do **not** need a real-time authoritative
game server (Colyseus) for v1. Everything below runs on **Supabase**, which the app already
loads (`window.supabase`). Colyseus becomes relevant only later, for *synchronous* raids/PvP
(see the last section).

---

## 0. The one principle that governs everything: the server owns shared state

Today the **client is the source of truth** — gold, inventory, and levels live in
`localStorage` and are mirrored to Supabase as a save blob. That's fine for single-player.
The moment two players can affect each other (trade gold via the AH, climb a shared ladder),
a cheater editing their local state can mint gold or fake wins.

So the rule for anything **shared**:

> Any state that one player can convert into an advantage over another — **gold, tradeable
> items, AH listings, ladder rating** — must be **owned and mutated by the server**, never
> trusted from the client.

Everything **not** shared (your solo combat, cosmetics, which zone you're farming) can stay
client-authoritative and just sync as a blob. The work is drawing that line and moving the
shared half server-side.

This is also exactly why **Phase 0 (deterministic game-core extraction)** matters: it lets the
**server re-simulate a fight** to verify an async-PvP result instead of trusting the client's
"I won." Do the AH first (no core needed); do trustworthy async PvP after Phase 0.

---

## 1. What to turn on in Supabase

You already use Supabase for auth (`detectSessionInUrl`) and saves. Enable/'use these:

1. **Auth** — you have it. This gives every player a stable `auth.uid()`. All ownership keys off it.
2. **Postgres tables** with **Row Level Security (RLS)** on every table.
3. **Database RPC functions** (`plpgsql`, `SECURITY DEFINER`) — the authoritative mutations
   (post/buy/cancel, submit PvP result). These run *as the server*, so they can move gold safely.
4. **Realtime** (`postgres_changes`) — push live AH/mail/ladder updates to clients.
5. **pg_cron** (Supabase extension) — scheduled jobs: expire listings, pay deposits/tax, roll
   phantom liquidity, decay ladder.
6. **Edge Functions** (Deno) — only where you need non-SQL logic (e.g. running the extracted
   game-core to validate a PvP replay). AH needs none of these; pure SQL RPC is enough.

Keep the **anon/publishable key** in the client (it's public by design). RLS + `SECURITY
DEFINER` RPCs are what actually protect the data — never the key.

---

## 2. Server-owned economy (the foundation for the AH)

Move the *shared-economy slice* of the save server-side. You don't have to move everything —
just gold and tradeable items.

```sql
-- one wallet row per player, owned by the server
create table wallet (
  user_id  uuid primary key references auth.users on delete cascade,
  gold     bigint not null default 0 check (gold >= 0),
  ven      int    not null default 0 check (ven  >= 0),
  updated_at timestamptz not null default now()
);
alter table wallet enable row level security;
create policy "read own wallet" on wallet for select using (auth.uid() = user_id);
-- NO insert/update/delete policy → clients can't write gold directly. Only SECURITY DEFINER RPCs can.

-- tradeable items live server-side once they can enter the AH
create table item (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid references auth.users on delete cascade,   -- null while listed/escrowed
  data      jsonb not null,        -- the full item object your client already produces
  bound     boolean not null default false,   -- relics/artifacts etc. never tradeable
  created_at timestamptz not null default now()
);
alter table item enable row level security;
create policy "read own items" on item for select using (auth.uid() = owner_id);
```

Client reads its wallet/items; it can **never** write them. Every gold or item change goes
through an RPC below. Your existing client `char` object keeps everything else; on load you
overlay the server wallet/items onto it.

> Migration path: seed each player's `wallet.gold` and `item` rows from their current save once,
> behind a "one-time import" on first authenticated load.

---

## 3. Auction House — online design

### Tables

```sql
create type ah_status as enum ('active','sold','expired','cancelled');

create table ah_listing (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references auth.users,
  kind        text not null,                 -- 'gear' | 'mat' | 'drop'
  item_id     uuid references item,          -- for gear (escrowed: item.owner_id set null)
  mat_id      text,  qty int,                -- for stacks
  price       bigint not null check (price > 0),
  base_value  bigint not null,               -- anchor used for the ±75% band + tax
  deposit     bigint not null,               -- consumed on post (already your rule)
  status      ah_status not null default 'active',
  posted_at   timestamptz not null default now(),
  expires_at  timestamptz not null,          -- posted_at + 48h
  buyer_id    uuid references auth.users
);
alter table ah_listing enable row level security;
create policy "browse active" on ah_listing for select using (status = 'active' or seller_id = auth.uid());

create table mail (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users,
  kind      text not null,                   -- 'sale' | 'purchase' | 'expired'
  payload   jsonb not null,                  -- gold, item, tax breakdown, buyer/seller name
  created_at timestamptz not null default now(),
  collected boolean not null default false
);
alter table mail enable row level security;
create policy "own mail" on mail for select using (user_id = auth.uid());
```

### Authoritative mutations (RPCs — the whole anti-cheat story)

Each is a `SECURITY DEFINER` function that does the checks the client currently does, but
server-side and transactionally:

- **`ah_post(item_id | mat_id+qty, price)`**
  - verify caller owns the item / has the stack and it's not `bound`;
  - recompute `base_value` **server-side** (never trust the client's number) and enforce the
    **±75% band** and the **25% deposit**;
  - debit deposit from `wallet`; escrow the item (`item.owner_id = null`) or decrement the stack;
  - insert `ah_listing`. All in one transaction.
- **`ah_buy(listing_id)`**
  - lock the row (`for update`), verify `status='active'` and buyer ≠ seller;
  - debit buyer gold; **credit seller `price − 15% tax`** to their mail; transfer the escrowed
    item to the buyer's mail; set `status='sold'`. The 15% tax simply isn't credited to anyone → sink.
- **`ah_cancel(listing_id)`** — return escrowed goods to the seller (deposit already spent).
- **`mail_collect(id)` / `mail_collect_all()`** — move gold/items from mail into wallet/inventory.

Because these run as the server and read gold from `wallet` (not the request body), a modified
client cannot overpay itself, post out of band, or buy without gold.

### Expiry, tax, and phantom liquidity — `pg_cron`

- Every few minutes: flip `expires_at < now()` actives to `expired`, mail the goods back.
- **Keep your phantom-liquidity system as a server job**, not client code. A cron function
  tops up standing gear/material listings (poor→epic, no legendary/artifact) toward a floor,
  and a "phantom demand" job buys underpriced player listings on the same price-vs-base curve
  you already tuned. This makes the AH feel live from day one, before the real player base is
  large, and it stays invisible (listings look identical). As real volume grows, lower the
  phantom floor. All the math you already wrote (`AH_ECON`, sell-chance curve) ports directly
  into SQL/Edge.

### Live updates — Realtime

Client subscribes to `ah_listing` (filtered to what it's browsing) and to its own `mail`.
New listings, sales, and mail appear without polling. Your current three-view UI
(Browse / Sell / Listings) stays; it just reads server rows instead of `char.ahListings`.

---

## 4. Async multiplayer

Async means: **players interact through stored snapshots and results, never in the same live
tick.** This is the whole game you described (bots filling slots, disguised opponents) done for
real, cheaply.

### 4a. Async PvP (Arena ladder) — the snapshot model

1. Every player publishes a **defense snapshot**: their gear, spec, stats, and Gambit loadout
   (a JSON blob + a derived `power` number). Store it:

   ```sql
   create table pvp_snapshot (
     user_id uuid primary key references auth.users,
     name text, power int not null, loadout jsonb not null,
     rating int not null default 1000, updated_at timestamptz default now()
   );
   ```

2. To fight, you **fetch an opponent snapshot** near your rating (a `select … order by
   abs(rating - me) limit 1`, with jitter). You run the fight **locally** against their snapshot
   using the game's combat — exactly how Gambit bots already work. No two players are online at once.

3. You **submit the result** via RPC. Here's the fork:
   - **Before Phase 0 (quick, less secure):** trust the client result but bound it (rate-limit,
     sanity-check power delta, cap rating swings, shadow-ban outliers). Fine for a friendly launch.
   - **After Phase 0 (trustworthy):** the client submits the **seed + its snapshot**, and a
     Supabase **Edge Function runs the extracted deterministic game-core** to **re-simulate** the
     fight from both snapshots and confirm the winner before applying Elo. Cheating a result
     becomes impossible because the server reproduces the exact fight. *This is the single biggest
     reason to prioritize Phase 0.*

4. Elo/MMR update is an RPC; a cron job decays inactive ratings and assembles ladder pages.

This gives you a real ranked PvP ladder with **zero real-time infrastructure** and reuses your
Gambit-vs-snapshot combat wholesale.

### 4b. Async co-op, guild content, raids (GDKP/Trinity)

Your guild/raid content already runs the **Trinity engine with a bot-filled party**. Make it
online-async by letting those "bots" be **other players' snapshots**:

- Publish a **PvE contribution snapshot** (role, power, spec) like the PvP one.
- When you launch a Trinity/hard-dungeon group, fill empty seats with **real players' snapshots**
  first (weighted by role need and power), falling back to generated bots — identical disguise
  rules to what you have. The other players aren't online; you're fighting alongside their
  simulated loadout.
- Rewards (GDKP, loot) resolve locally, then post authoritatively via RPC. Shared guild state
  (roster, bank, GDKP pot) lives in Postgres tables with RLS scoped to guild membership.
- **Multiplayer hard-boss kills already feed your solo `hardBossKills` unlock** (you just added
  this) — server-side, that becomes: the RPC that records a group clear increments the player's
  server-side hard-boss counter, so async group runs advance solo unlocks for real.

### 4c. Leaderboards

Trivial once snapshots exist: materialized views over `pvp_snapshot.rating`, total power,
fastest hard clears, richest players, etc., refreshed by cron and read directly by clients.

---

## 5. Cross-device account & save

You already authenticate. Split the save on load:

- **Server-authoritative overlay:** `wallet` (gold/ven), tradeable `item` rows, `ah_listing`,
  `mail`, `pvp_snapshot`, ladder rating, guild membership.
- **Client blob (as today):** everything else — progress, settings, spec loadouts, cosmetics.

On login: pull the overlay, merge onto the local `char`, and from then on route shared mutations
through RPCs while continuing to autosave the blob. This gives real cross-device play (log in
anywhere, your gold/AH/ladder follow you) without moving the whole game server-side.

---

## 6. Recommended build order

1. **Auth hardening + wallet/item migration** — one-time server import of gold + tradeable items.
2. **AH tables + RPCs + RLS** — post/buy/cancel/mail, deposit/tax/band enforced server-side.
3. **pg_cron** — expiry, tax sink, phantom liquidity (port `AH_ECON`).
4. **Realtime** wiring in the AH/Mail UI (swap `char.ahListings` reads for server rows).
5. **`pvp_snapshot` + async Arena ladder** (trusted-client v1, rate-limited).
6. **Phase 0 game-core extraction** → **Edge-Function replay validation** for PvP results.
7. **Async co-op/guild snapshots** slotting real players into Trinity/hard runs.
8. **Leaderboards.**

Steps 1–4 give you a genuine online economy. 5 gives ranked PvP the same week. 6 makes it
cheat-proof. Nothing here needs a dedicated game server.

---

## 7. When you'd add Colyseus (later, optional)

Everything above is **async**. You'd add a real-time authoritative server (Colyseus + the same
extracted game-core) only for **synchronous** features:

- live co-op raids where players act in the same tick,
- real-time PvP,
- live chat/room presence.

The nice part: the **deterministic game-core from Phase 0 is the same artifact** the Edge
Function uses for async validation and Colyseus uses for authoritative live rooms. Build it once;
async ships first on Supabase; synchronous is a later add-on, not a rewrite.

---

## 8. Ops / cost notes

- Supabase free tier covers early testing; the Pro tier (~$25/mo) covers a meaningful player
  base. Costs scale with DB size, Realtime connections, and Edge invocations — all modest for a
  turn-based/async game.
- Put **all** gold/item/ladder writes behind RPCs; never grant table-level insert/update to
  clients. RLS is your backstop, `SECURITY DEFINER` RPCs are your API.
- Log every economy mutation (who, what, when) to an append-only `ledger` table — indispensable
  for spotting exploits and rolling back.
- Rate-limit RPCs per user (Supabase supports this at the edge) to blunt scripted abuse.

# Auction House backend (Supabase)

Server-authoritative Auction House + economy. The client never writes gold, items, or
listings directly — every mutation goes through the RPCs below, which validate against
server-side state. See `../ONLINE.md` for the full architecture.

## Migrations

```
supabase/migrations/
  0001_economy_core.sql    wallet, item, material, ledger, config + RLS
  0002_auction_house.sql   ah_listing, mail, value functions, Realtime
  0003_auction_rpcs.sql    ah_post_gear / ah_post_stack / ah_buy / ah_cancel / mail_collect(_all)
  0004_phantom_and_cron.sql expiry sweep, phantom demand/supply, pg_cron schedules
  0005_import_economy.sql   one-time save import
```

## Apply

With the Supabase CLI (recommended):

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste each file, in order, into the SQL Editor. Enable the **pg_cron** extension first
(Dashboard → Database → Extensions) if `db push` doesn't create it.

## Seed material values (required before mats/drops can be listed)

`ah_mat_value(kind, mat_id, unit_value)` must be populated from the client's tier math
(`stackUnitValue` in `App.jsx`). Generate the rows once from the client and upsert them, e.g.:

```js
// build rows from the game's own tables so they never drift
const rows = [
  ...ALL_MAT_IDS.map(id => ({ kind: 'mat',  mat_id: id, unit_value: stackUnitValue('mat', id) })),
  ...ALL_DROP_IDS.map(id => ({ kind: 'drop', mat_id: id, unit_value: stackUnitValue('drop', id) })),
];
await supabase.from('ah_mat_value').upsert(rows); // run once from an admin/service context
```

Also confirm `rarity_value_mult` matches `RARITIES[].valueMult` (seeded with current values).

## Client calls (all via `window.supabase.rpc`)

```js
// one-time, on first authenticated load
await supabase.rpc('import_save_economy', {
  p_gold: char.gold, p_ven: char.ven,
  p_items: postableAndBoundItems,      // your inventory + equipped, as JSON
  p_materials: char.materials, p_drops: char.drops,
});

// post
await supabase.rpc('ah_post_gear',  { p_item_id, p_price });
await supabase.rpc('ah_post_stack', { p_kind: 'mat', p_mat_id: 'iron', p_price });

// browse (RLS returns only active listings)
const { data } = await supabase.from('ah_listing').select('*').eq('status','active').eq('kind','gear');

// buy / cancel
await supabase.rpc('ah_buy',    { p_listing_id });
await supabase.rpc('ah_cancel', { p_listing_id });

// mail
const { data: box } = await supabase.from('mail').select('*').eq('collected', false);
await supabase.rpc('mail_collect',     { p_mail_id });
await supabase.rpc('mail_collect_all');

// live updates
supabase.channel('ah')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ah_listing' }, refreshBrowse)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mail', filter: `user_id=eq.${uid}` }, bumpMailBadge)
  .subscribe();
```

RPC errors surface as thrown exceptions with the message from `raise exception` (e.g.
`price 999 outside band 120-420`, `not enough gold`) — show these to the player.

## Phantom liquidity

- **Demand** (your listings sell over time) and **material/drop supply** run entirely in SQL
  via `pg_cron` (`ah-demand`, `ah-stacks`) — no extra infra.
- **Gear supply** needs the game's item generator, so run it in a **scheduled Edge Function**
  that generates on-theme gear (poor→epic, no legendary/artifact), then calls
  `ah_insert_phantom_gear(data, price)` (service-role only; re-derives the band server-side).
  This reuses the Phase-0 game-core, the same artifact used for async-PvP validation.

## Security notes

- Tables grant only `select` (RLS-scoped) to `authenticated`; all writes are `SECURITY DEFINER`
  RPCs that check `auth.uid()`. Never add table-level write grants.
- Every gold movement is written to `ledger` — query it to audit or roll back.
- Rate-limit the RPCs per user at the edge to blunt scripted abuse.

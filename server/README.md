# Realms of Eldoria — game server (Stage 3)

Authoritative realtime server built on the shared deterministic game-core. A Colyseus room
ticks `stepEncounter` as the source of truth and broadcasts snapshots; the same core validates
async results. Deploy target: **Railway**.

## Layout
```
server/
  index.mjs              Colyseus server entry (health endpoint + room registration)
  sim.mjs               authoritative sim + replay validator (wraps ../game-core/combat.mjs)
  party.mjs             build the encounter party from seats; bot-fill; content catalogue
  rewards.mjs           persist clears to Supabase mail (service-role, server-only)
  rooms/EncounterRoom.mjs  authoritative PvE room (tick loop, join, seat-fill, intents)
  combat.mjs, rng.mjs   copies of the shared core (source of truth: ../game-core; `npm run sync-core`)
  fixtures/party.json   4-combatant fixture for tests
  sim.test.mjs, room.test.mjs   headless tests (no Colyseus needed)
  e2e.test.mjs          boots the real server and drives it with a real websocket client
```

## What works today (verified)
- `node sim.test.mjs` — authoritative runs are deterministic; the tick loop matches
  run-to-completion; the replay validator accepts truthful results and rejects forged ones.
- `node room.test.mjs` — seats → party (bot-filled) → authoritative resolve → broadcast snapshot.
- `npm run test:e2e` — boots the server, joins over a websocket with `colyseus.js`, and plays a
  fight to completion: 229 snapshots and the same `wiped @ tick 229` the headless suite produces.
  Malformed joins are refused and leave the process running.

The headless tests import the modules directly, so they cannot catch module-loading, state-encoding
or transport faults — every boot-fatal bug found so far lived in exactly that gap. `test:e2e` is the
one that exercises it; run it before deploying.

### Client join contract
`joinOrCreate("encounter", …)` **requires** `loadout.char`, a combat-ready character object (the
shape in `fixtures/party.json`). The server seeds both the player's combatant and the bot-fill
templates from it, and rejects a join without one. Also accepted: `contentId` (required, must be in
`MP_CONTENT`), `name`, `role`, `uid`, `seed`.

Note `colyseus` ^0.15 is CommonJS and must be default-imported and destructured under Node's ESM
loader; `@colyseus/schema` ships a real ESM build and imports by name. Room state must be a `Schema`
instance — a plain object passed to `setState()` fails to encode and breaks the first join.

The room currently resolves every combatant with the core's AI (an authoritative co-op fight all
clients watch live, loot server-granted). Real-time **human control** is the one remaining core
extension — `stepEncounter(state, dt, inputs)` — flagged in `rooms/EncounterRoom.mjs` (Stage 4).

## Run locally
```
cd server
npm install
npm test          # headless core/room tests (no dependencies needed)
npm run test:e2e  # real server + real websocket client (needs npm install)
npm run dev       # starts Colyseus on :2567 (ws://localhost:2567), GET /health
```

## Deploy to Railway

Everything that can be configured without a browser is already done.

| Piece | State |
|---|---|
| Project `realms-of-eldoria-server` | ✅ created |
| Service `eldoria-game-server` | ✅ created, source `Uovanna/Venrulia` |
| Root directory `server` | ✅ set |
| Start command / healthcheck | ✅ `node index.mjs`, `/health`, 60s |
| Public domain | ✅ `eldoria-game-server-production.up.railway.app` |
| `SUPABASE_URL`, `NODE_ENV` | ✅ set on the service |
| Railway ↔ GitHub authorization | ❌ **blocked — needs you** |
| `SUPABASE_SERVICE_ROLE` | ❌ **blocked — needs you** |
| First deployment | ⏸ waits on the two above |

### The two remaining steps

1. **Authorize Railway's GitHub App for `Uovanna/Venrulia`.** Railway currently reports the repo as
   inaccessible (`accessible: false`, zero branches), so it cannot clone it and no build can be
   triggered — this is why no deployment exists yet. Fix it at
   <https://github.com/settings/installations> → Railway → grant access to `Venrulia`
   (or reinstall the app from Railway's dashboard: Service → Settings → Source).

   Then set the deploy branch. The server code is on `claude/hybrid-auction-house-design-88121n`;
   Railway defaults to `main`, which does **not** have it. Either pick that branch in
   Service → Settings → Source, or merge it into `main` first.

2. **Set `SUPABASE_SERVICE_ROLE`** on the service (Supabase → Project settings → API → `service_role`).
   Server-only; never ship it to a client. Without it `rewards.mjs` logs a warning and skips
   persistence — the server still runs and fights still resolve, loot just isn't mailed.

Once the repo is authorized, the deploy is a single `redeploy`; the build config is already correct.
Then point the client's `mpProvider` connection at `wss://eldoria-game-server-production.up.railway.app`
(Stage 4 client netcode).

There is also an empty leftover service named `game-server` in the project (created before the source
was attached, never deployed). It can be deleted from the dashboard — the connector has no
delete-service tool.

Estimated cost for a small player base: ~$5–10/mo (single always-on process; see the cost analysis).

Estimated cost for a small player base: ~$5–10/mo (single always-on process; see the cost analysis).

## Core sync
`combat.mjs`/`rng.mjs` are copied from `../game-core` (the source of truth) so this folder
deploys standalone. After changing the core, run `npm run sync-core` and commit.

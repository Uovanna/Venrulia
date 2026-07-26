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
```

## What works today (verified headless)
- `node sim.test.mjs` — authoritative runs are deterministic; the tick loop matches
  run-to-completion; the replay validator accepts truthful results and rejects forged ones.
- `node room.test.mjs` — seats → party (bot-filled) → authoritative resolve → broadcast snapshot.

The room currently resolves every combatant with the core's AI (an authoritative co-op fight all
clients watch live, loot server-granted). Real-time **human control** is the one remaining core
extension — `stepEncounter(state, dt, inputs)` — flagged in `rooms/EncounterRoom.mjs` (Stage 4).

## Run locally
```
cd server
npm install
npm test          # headless core/room tests
npm run dev       # starts Colyseus on :2567 (ws://localhost:2567), GET /health
```

## Deploy to Railway
A project is already created: **realms-of-eldoria-server** (shared var `SUPABASE_URL` set).
Railway deploys from GitHub, so:

1. **Push this repo to GitHub** (the client repo is fine; the server lives in `/server`).
2. **Create the service from the repo** (I can do this via the connector once you confirm the
   repo in `owner/name` form) — or in the dashboard: New Service → GitHub repo.
3. **Set the service root directory to `server`** (monorepo) so Railway builds this folder.
   `railway.json` here sets the start command (`node index.mjs`) and `/health` check.
4. **Set the secret** `SUPABASE_SERVICE_ROLE` on the service (Supabase → Project settings → API →
   service_role key). Never ship this to clients. `SUPABASE_URL` is already set.
5. **Generate a domain** (connector `generate-domain` or dashboard) → `wss://<name>.up.railway.app`.
6. Point the client's `mpProvider` room connection at that URL (Stage 4 client netcode).

Estimated cost for a small player base: ~$5–10/mo (single always-on process; see the cost analysis).

## Core sync
`combat.mjs`/`rng.mjs` are copied from `../game-core` (the source of truth) so this folder
deploys standalone. After changing the core, run `npm run sync-core` and commit.

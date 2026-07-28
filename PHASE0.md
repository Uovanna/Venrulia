# Phase 0 — Deterministic game-core extraction

Phase 0 is the gate for real multiplayer: the combat simulation must be a headless,
React-free module that runs **identically** on client and server given the same seed and
inputs. Without it, an authoritative server can't validate fights and clients can't
predict/replay them.

## Key finding: the core is already deterministic

The hard part is largely done. The combat engine was written with this in mind:

- **`applySkillCore(skill, char, battle, now, log)`** — the solo resolution engine (module
  scope, ~90 lines). **Zero `Math.random`, zero `Date.now`**; it uses the seeded `rng()`/`pick()`
  and an injected `now`. The group sim reuses it per ally, so solo and group share one engine.
- **`stepEncounter(state, dt)`** — a pure reducer. It clones state, drives time from `dt`
  (not the wall clock), and wraps the whole step in `withRng(makeRng(state.seed ^ state.tick*…))`,
  so every step is reproducible.
- **`game-core/rng.mjs`** — the seeded RNG (mulberry32) + `withRng` scope + `makeClock`. Already
  extracted and unit-tested (`rng.test.mjs`).

### Proven, not asserted

`game-core/determinism-core.cjs` transpiles the real `App.jsx`, builds one encounter, and plays
it twice from the same start state:

```
steps: 229 | DETERMINISTIC: true | SEED MATTERS: true
```

Same seed → byte-identical fight; different seeds diverge. This is the gate, verified on the
actual shipping code. Keep this as a regression test — any future combat change must keep it green.

## The step contract

```
stepEncounter(state, dt) -> state'          // pure; state carries { seed, tick, elapsed, allies, enemies, log, ... }
applySkillCore(skill, char, battle, now, log) -> { battle }   // pure; per-combatant resolution
```

Time is injected (`dt` / `now`), randomness is injected (`state.seed`), so `(state, seed, inputs)`
fully determines `state'`. A server ticks `stepEncounter` at a fixed rate and is the source of
truth; a client runs the same function to predict and reconcile.

## What's left: lift the closure out of App.jsx

The core is the transitive module-scope closure of `applySkillCore` / `stepEncounter` /
`createEncounter` / `chooseAllyAction` / `applyAllyAction` — **155 symbols** (31 data tables +
124 functions), all pure and React-free. Full list in `game-core/CLOSURE.md`.

These 155 symbols move from `App.jsx` into `game-core/combat.mjs`; `App.jsx` then imports them
instead of defining them. Party construction (`buildBotChar`) and loot (`generateItem`) are NOT
in the closure — they produce the combatants that are *fed into* `createEncounter`; the server
builds combatants from published snapshots the same way.

### Staged plan (each stage keeps the app buildable + the harness green)

1. **`rng.mjs`** — done (extracted + tested).
2. **`combat.mjs`** — move the 155 symbols in `CLOSURE.md` (source order). Re-export them.
3. **Cutover** — replace the in-file definitions in `App.jsx` with `import { … } from './game-core/combat.mjs'`. Run `determinism-core.cjs` and a full playtest; the game must behave identically (default `_rng` = `Math.random`, so non-seeded play is byte-for-byte unchanged).
4. **Build** — Vite handles the ESM import directly. For the standalone single-file HTML, prepend `combat.mjs` + `rng.mjs` (stripped of `import`/`export`) ahead of the app in the splice step, same pattern already used for the app body.
5. **Server harness** — a tiny Node entry that imports `game-core/combat.mjs`, builds combatants from `pvp_snapshot`/party data, and ticks `stepEncounter` — the seed of the Colyseus room loop and the async-PvP replay validator.

## How this unlocks the roadmap

- **Async PvP validation** — an Edge Function replays a submitted match with `combat.mjs` and the
  reported seed to confirm the winner, making the ladder tamper-proof (removes the trusted-client caveat).
- **Colyseus PvE rooms** — the room ticks `stepEncounter` authoritatively; clients render/predict
  with the identical module. Build the core once; both features consume it.

## Status

| Piece | State |
|---|---|
| Seeded RNG + clock (`rng.mjs`) | ✅ extracted + unit-tested |
| Determinism of real core | ✅ proven (`determinism-core.cjs`) |
| Closure identified (155 symbols) | ✅ mapped (`CLOSURE.md`) |
| `combat.mjs` (lift the 146 closure) | ✅ extracted + proven byte-identical |
| `App.jsx` cutover | ✅ **adopted** — `src/App.jsx` imports `../game-core/`; Vite build green, booted and played in a real browser |
| Standalone-build splice update | ▢ next — `standalone/realms-of-eldoria.html` still embeds the pre-cutover inline core |
| Server core (sim + validator) | ✅ built + tested (`server/sim.mjs`) |
| Colyseus room + deploy config | ✅ built (`server/`); runs live under real Colyseus (`npm run test:e2e`) |
| Railway service | ✅ configured (root dir, healthcheck, domain, vars); deploy blocked on authorizing Railway's GitHub App — see `server/README.md` |
| Real-time human input in core | ✅ `stepEncounter(state, dt, inputs)` + `resolveIntent`; server & room wired, tested (`server/input.test.mjs`) |
| Client netcode (Stage 4b) | ✅ **playable** — Guild → 🌐 Online Co-op; verified with two browsers in one room |

## Stage 4b — client netcode (done)

Online co-op is playable: **Guild → 🌐 Online Co-op → Play Online**. `mpProvider.connectEncounter`
joins the room (`colyseus.js` is a lazy import, so it only loads when you play online), waits for
`assigned`, and hands `GroupCombat` a `room` + `myAllyId`. Networked, the component stops ticking
locally and renders the server's snapshots; `cast()` sends `{ skillName, target }`.

Server URL comes from `VITE_GAME_SERVER`, defaulting to the Railway deployment.

Verified with **two real browsers in one room**: separate characters, one shared authoritative
fight, bot-filled remaining seats, each client correctly rendering itself as "You" and the other
player by name. No console errors.

All 12 Guild instances are hosted (5 dungeons, 5 hard dungeons, 2 raids). The server catalogue in
`server/party.mjs` mirrors the client's ids and builds each boss with the **shared** `guildBossDef`,
so an online run is the encounter you picked — the first cut hand-wrote two stub entries that both
pointed at `BOSS_DEFS.ashen`, which quietly made every online fight the Ashen Warden.

A tap is echoed locally the instant you press it (`localQueued`), because the authoritative
confirmation is a full round trip away and the action bar otherwise reads as ignoring you. The
server still decides what actually happens; the echo is superseded by the next snapshot.

### Known gaps
- **Potions are offline-only.** They mutate authoritative state and need their own validated
  server message; the button is disabled online rather than silently desyncing.
- **Rejected intents are silent.** A skill dropped for cost/cooldown at the server just doesn't
  happen; there's no "not enough Rage" feedback yet. The local echo masks the worst of it.
- **Full state every tick.** `fullSnapshot` sends the whole encounter (minus `ally.char`) at
  ~8/sec. Fine for 4–6 players, not the endgame.
- **No prediction yet.** Actions land on the next server tick (≤120ms + RTT). Since both sides
  now run the identical core, the fix is local stepping with reconciliation against a rarer
  authoritative frame — the payoff for having one shared core.
- Only the two encounters in `ONLINE_CONTENT` are server-hosted; everything else stays local.

The wire protocol is documented in `server/README.md`.

## Group-encounter balance (calibrated)

Fights were resolving in 10-12s against a 70s (dungeon) / 115s (raid) design target. Two
independent causes, both in `GRP`:

- **Boss HP was far too low.** It is `grpEstDps(party) * dur`, but `grpEstDps` sums
  `offlinePlayerDps` — an idle-throughput figure that under-counts a party running its real
  rotation through `applySkillCore` by more than an order of magnitude.
- **Boss damage was far too high.** At `dmg: 1.9` the party died in 20-40s no matter how much
  health the boss had, so raising HP alone just converted clears into wipes at the same clock
  time. Time-to-kill cannot exceed time-to-die.

Calibrated empirically across all nine encounters, with a player working their action bar:

| | before | after |
|---|---|---|
| `estCal` (new — corrects the DPS estimate) | 1 | **24** |
| `dmg` (boss outgoing damage) | 1.9 | **0.28** |
| `healCoeff` (healer throughput) | 1.0 | **1.6** |

Result: **59s average, 9/9 clears**, spread 53-72s from The Sunken Mine to the hard raid.
An idle player averages ~100s and loses more than half the time, so participation matters.

`healCoeff` is above 1 because the only real heal in the game, Mending Touch, is on a **90
second cooldown** — sustained healing is otherwise almost nonexistent, and raising the
coefficient from 1.0 to 1.6 is what turns the hardest content from a guaranteed wipe into a
clear. If healing kits get more throughput later, boss damage can rise again.

This applies to offline Guild content too — it is the same core.

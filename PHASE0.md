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
| `App.jsx` cutover | ✅ prepared as reviewable `App.cutover.jsx` (−715 lines); playtest to adopt |
| Standalone-build splice update | ▢ next |
| Server core (sim + validator) | ✅ built + tested (`server/sim.mjs`) |
| Colyseus room + deploy config | ✅ scaffolded (`server/`), Railway project created |
| Real-time human input in core | ▢ Stage 4 (`stepEncounter(state,dt,inputs)`) |

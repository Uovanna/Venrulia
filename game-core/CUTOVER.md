# Stage 2 — combat.mjs extraction + App.jsx cutover

> **ADOPTED.** `src/App.jsx` now imports the core from `../game-core/`. The notes below are
> kept as the record of how the extraction was proven. Two things changed at adoption:
>
> - The modules were **not** copied to `src/game-core/` as step 2 suggested. `src/App.jsx`
>   imports `../game-core/` directly, so there is exactly one canonical core; `server/` keeps
>   synced copies via `npm run sync-core` so it can deploy standalone.
> - The prepared `App.cutover.jsx` had a defect: it imported the RNG helpers *and* still
>   defined `rngPick` / `rngInt` / `makeClock` locally, so the build failed with
>   "The symbol has already been declared". Those three definitions were removed on adoption.
>
> `equivalence.test.mjs` is **retired**. `equiv_app.cjs` embeds its own frozen copy of the
> pre-cutover core, so the baseline can never reflect an intentional change: once the group
> combat log started recording ally casts, the test began reporting DIVERGENCE purely on
> `logLen` (5 vs 0) while every HP value stayed byte-identical. A test whose baseline cannot
> move is a false alarm generator, not a gate.
>
> **`determinism-core.cjs` is the live gate** — it transpiles the current `App.jsx` and takes
> the core from the module the app really imports. It still reports
> `229 | DETERMINISTIC: true | SEED MATTERS: true`.

## What was done
- **`combat.mjs`** — the 146-symbol combat closure lifted out of `App.jsx` (imports RNG/clock from `rng.mjs`). Loads standalone with 141 exports, **zero missing deps**.
- **Proven equivalent**: replaying one start state through the in-app core and the extracted core gives byte-identical results across a full fight (final state + step count + every trace checkpoint). See "Run the proof" below.
- **`App.cutover.jsx`** — a COPY of `App.jsx` with those definitions removed (−715 lines) and replaced by two imports. Structurally parse-clean. Your canonical `App.jsx` is unchanged.

## Run the proof
```
# 1) in-app core → writes start state + trace to /tmp/eq.json (needs tsc)
node game-core/equiv_app.cjs        # (transpiles src/App.jsx, plays the real core)
# 2) extracted core → replays the same state, asserts byte-identical
node game-core/equivalence.test.mjs
# expect: ✅ EXTRACTED CORE == IN-APP CORE (byte-for-byte)
```

## To adopt the cutover
1. **Review the diff**: `diff src/App.jsx game-core/App.cutover.jsx` — it's purely deletions of the 146 defs + the two new imports at top.
2. **Move the modules** next to the app: `src/game-core/rng.mjs`, `src/game-core/combat.mjs` (adjust import paths if your layout differs).
3. **Swap** `src/App.jsx` for `App.cutover.jsx`, then `npm run dev` and **playtest** — combat, dungeons, Arena, Trinity. Because `_rng` defaults to `Math.random`, non-seeded play is byte-for-byte unchanged; only seeded blocks (the group sim) are deterministic.
4. **Vite** resolves the ESM imports with no config. 
5. **Standalone single-file HTML**: the splice must now also inline the core. Prepend `rng.mjs` then `combat.mjs` (each with `import`/`export` lines stripped, same UMD-ification already used for the app body) ahead of the app in the build step.

## Why this is safe to adopt incrementally
The extracted module is behaviorally identical (proven), and the cutover is mechanical (delete defs, import them back at module scope — ESM imports are hoisted, so every existing reference still resolves). The only thing that needs your eyes is a local playtest, since browser runtime can't be exercised from the extraction tooling.

## Next (stage 3+)
- Cut over `App.jsx` for real (after your playtest).
- Update the standalone build splice.
- Add a Node server entry that imports `combat.mjs`, builds combatants from `pvp_snapshot`, ticks `stepEncounter` — the seed of both the async-PvP replay validator and the Colyseus room loop.

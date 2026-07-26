# game-core

Headless, deterministic combat core — the shared source of truth for client and (future) server.

- `rng.mjs` — seeded RNG (mulberry32) + `withRng` scope + `makeClock`. Extracted, standalone.
- `rng.test.mjs` — determinism unit test. Run: `node game-core/rng.test.mjs`
- `determinism-core.cjs` — integration gate: proves the real App.jsx core is deterministic
  (same seed → byte-identical fight). Run: `node game-core/determinism-core.cjs src/App.jsx` (needs `tsc`).
- `CLOSURE.md` — the 155-symbol extraction manifest (what moves into `combat.mjs`).

See `../PHASE0.md` for the full plan and status.

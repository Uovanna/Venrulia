# game-core

Headless, deterministic combat core — the shared source of truth for the client (`src/App.jsx`)
and the authoritative server (`server/`). **This directory is the canonical side.** `server/`
carries byte-identical copies so it can deploy standalone; keep them in step with
`npm run sync-core`.

## Modules
- `combat.mjs` — the combat closure lifted out of `App.jsx`. `createEncounter` / `stepEncounter`
  are a pure reducer: `(state, seed, inputs)` reproduces a fight exactly.
- `rng.mjs` — seeded RNG (mulberry32) + `withRng` scope + `makeClock`. Outside a `withRng` scope
  `rng()` falls back to `Math.random`, so ordinary play is unseeded and only the parts that need
  reproducibility pay for it.
- `sync-core.mjs` — copies the shared modules into `server/`; also exports the drift check the
  audit uses.

## Gates
- `rng.test.mjs` — RNG determinism. `node game-core/rng.test.mjs`
- `gambit.test.mjs` — gambit conditions (execute range, class resource, slot cooldowns) and save
  migration. `node game-core/gambit.test.mjs`
- `audit-core-usage.mjs` — the client/core boundary: a core symbol referenced but never imported,
  `App.jsx` writing to a shared table, and `server/` drift. `npm run audit`
- `determinism-core.cjs` — integration gate over the core the app really imports: same seed →
  byte-identical fight, and different seeds actually diverge. Needs `tsc`.
- `gambit-ui.check.mjs` — browser check for the gambit behaviour that only exists in `App.jsx`
  (the veto, slot priority, legacy save migration). Needs playwright and a preview server; see
  its header.

`npm test` runs everything except the browser check.

## Why the boundary keeps needing guards
The recurring bug in this codebase is the client and the core disagreeing about a table or a
property name — `heal`/`hot`, `spend`/`cost`, a mutated `SKILLS`, a second `normalizeChar`. None
of it is a build error: the Vite build cannot see an undefined global in ESM, and a mutation is
legal JS. It surfaces as a skill that silently does nothing, usually only online. That is what
the audit and the browser check exist to catch.

See `CUTOVER.md` for how the extraction was done and proven, and `../PHASE0.md` for the plan.

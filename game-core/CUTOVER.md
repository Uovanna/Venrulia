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
> `equivalence.test.mjs`, `equiv_app.cjs` and `App.cutover.jsx` have been **deleted** — they
> were migration scaffolding and the migration is done. Git history keeps them.
>
> The equivalence test was retired rather than re-baselined because `equiv_app.cjs` embedded
> its own frozen copy of the pre-cutover core, so the baseline could never reflect an
> intentional change: once the group combat log started recording ally casts, the test
> reported DIVERGENCE purely on `logLen` (5 vs 0) while every HP value stayed byte-identical.
> A test whose baseline cannot move is a false alarm generator, not a gate. Its fixture also
> lived in `/tmp` and was never committed, so it could not run in a fresh clone at all.
>
> **`determinism-core.cjs` is the live gate** — it transpiles the current `App.jsx` and takes
> the core from the module the app really imports. Its step count is meaningful now that the
> harness party is seeded: `371 | DETERMINISTIC: true | SEED MATTERS: true`.

## What was done
- **`combat.mjs`** — the 146-symbol combat closure lifted out of `App.jsx` (imports RNG/clock from `rng.mjs`). Loads standalone, **zero missing deps**.
- **Proven equivalent** at the time of extraction: replaying one start state through the in-app core and the extracted core gave byte-identical results across a full fight. That proof is spent — combat has intentionally moved on since.
- `src/App.jsx` was cut over to import the core directly.

## The gates that replaced it

| | what it catches | run |
|---|---|---|
| `determinism-core.cjs` | combat stopped being reproducible, or the seed stopped mattering | `node game-core/determinism-core.cjs` |
| `audit-core-usage.mjs` | a core symbol referenced but never imported; App.jsx **writing** to a shared table; `server/` drifted from `game-core/` | `npm run audit` |
| `gambit.test.mjs` | gambit condition evaluation and save migration | `node game-core/gambit.test.mjs` |
| `gambit-ui.check.mjs` | the client-only gambit behaviour no headless test can see | see its header (needs a preview server) |

`npm test` runs everything except the browser check.

## Keeping `server/` in sync
`server/` deploys standalone (Railway builds only that directory) and carries byte-identical
copies of `combat.mjs` and `rng.mjs`. **`game-core/` is the canonical side** — edit there, then:

```
npm run sync-core     # copy game-core/ -> server/
npm run audit         # fails if they have drifted
```

Drift does not crash anything. It makes the client predict a fight with one set of rules while
the authoritative server resolves it with another, which surfaces as desync — "my skill didn't
fire" — not as an error.

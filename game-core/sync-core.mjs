// `server/` deploys standalone (Railway builds only that directory), so it carries its own
// copies of the shared core rather than reaching up into game-core/. There is still exactly one
// canonical source — game-core/ — and these copies must be byte-identical to it.
//
// Drift here is the expensive failure mode: the client predicts a fight with one set of rules
// and the authoritative server resolves it with another. The symptom is not a crash, it is a
// desync that reads as lag or "my skill didn't fire".
//
//   npm run sync-core     copy game-core/ -> server/
//   npm run audit         fails if they have drifted
import { readFileSync, writeFileSync } from "fs";

export const SYNCED = ["combat.mjs", "rng.mjs"];
export const srcPath = (f) => new URL(`./${f}`, import.meta.url);
export const dstPath = (f) => new URL(`../server/${f}`, import.meta.url);

/** Files whose server copy differs from the canonical game-core/ version. */
export const drifted = () => SYNCED.filter((f) => {
  try { return !readFileSync(srcPath(f)).equals(readFileSync(dstPath(f))); }
  catch { return true; }   // missing on either side counts as drift
});

// Only copy when run directly, so importing this for the audit has no side effects.
if (import.meta.url === `file://${process.argv[1]}`) {
  const stale = drifted();
  for (const f of stale) writeFileSync(dstPath(f), readFileSync(srcPath(f)));
  console.log(stale.length ? `synced to server/: ${stale.join(", ")}` : "server/ already in sync");
}

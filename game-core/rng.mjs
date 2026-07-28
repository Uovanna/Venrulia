// Realms of Eldoria — deterministic RNG + clock primitives (game-core foundation).
// Extracted verbatim from App.jsx. Zero dependencies, no React, no globals beyond the
// module-local _rng swap. Both the client reducer and the authoritative server import this,
// so a fight replays identically given the same seed + inputs.

let _rng = Math.random;                 // defaults to Math.random → normal play is byte-for-byte unchanged
export const rng = () => _rng();
// There is deliberately no unscoped setter. `withRng` below always restores the previous
// source, so a seeded block cannot leak its RNG into the rest of the app.

// mulberry32 — fast, seedable, well-distributed 32-bit PRNG
export const makeRng = (seed) => {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Run `body` with a specific RNG source, always restoring the previous one.
export const withRng = (fn, body) => { const prev = _rng; _rng = fn; try { return body(); } finally { _rng = prev; } };

export const rngPick = (arr) => arr[Math.floor(rng() * arr.length)];
export const rngInt  = (min, max) => min + Math.floor(rng() * (max - min + 1));
export const pick    = (arr) => arr[Math.floor(rng() * arr.length)];

// Injected clock: combat functions take an explicit `now`; the reducer drives time from here.
export const makeClock = (start = 0, stepMs = 100) => { let t = start; return { now: () => t, tick: (dt = stepMs) => (t += dt) }; };

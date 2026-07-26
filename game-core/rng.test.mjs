// Determinism unit test for the RNG foundation. Run: node game-core/rng.test.mjs
import { makeRng, withRng, rng, pick } from './rng.mjs';
let fail = 0;
const assert = (c, m) => { if (!c) { console.error('  ✗', m); fail++; } else console.log('  ✓', m); };

// 1) same seed → identical sequence
const a = makeRng(12345), b = makeRng(12345);
assert(Array.from({length: 1000}, () => a()).join() === Array.from({length: 1000}, () => b()).join(), 'same seed → identical 1000-length sequence');

// 2) different seeds → different sequence
assert(makeRng(1)() !== makeRng(2)(), 'different seeds diverge');

// 3) withRng scopes the source and restores it
const before = rng();
const inside = withRng(makeRng(42), () => pick([10, 20, 30, 40, 50]));
withRng(makeRng(42), () => { const again = pick([10, 20, 30, 40, 50]); assert(again === inside, 'withRng is reproducible for the same seed'); });
assert(typeof before === 'number', 'default rng still works outside withRng');

// 4) roughly uniform in [0,1)
const N = 100000; let s = 0, mn = 1, mx = 0; const r = makeRng(7);
for (let i = 0; i < N; i++) { const v = r(); s += v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
assert(Math.abs(s / N - 0.5) < 0.01 && mn >= 0 && mx < 1, `mean≈0.5 (got ${(s/N).toFixed(4)}), range [0,1)`);

console.log(fail ? `\nFAILED (${fail})` : '\nrng.mjs: all determinism checks passed');
process.exit(fail ? 1 : 0);

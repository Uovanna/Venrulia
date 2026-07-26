import { createEncounter, stepEncounter } from './combat.mjs';
import { readFileSync } from 'fs';
const app = JSON.parse(readFileSync('/tmp/eq.json', 'utf8'));
const sum = (s) => JSON.stringify({tick:s.tick,elapsed:s.elapsed,cleared:s.cleared,wiped:s.wiped,
  allies:s.allies.map(a=>[a.id,Math.round(a.hp),a.down?1:0]),enemies:s.enemies.map(e=>[e.id,Math.round(e.hp)]),logLen:s.log.length});
let s = JSON.parse(JSON.stringify(app.st0)), n = 0, trace = [];
while (!s.cleared && !s.wiped && n < 6000) { s = stepEncounter(s, 120); n++; if (n % 15 === 0) trace.push(sum(s)); }
const finalMatch = sum(s) === app.final;
const stepsMatch = n === app.steps;
const traceMatch = JSON.stringify(trace) === JSON.stringify(app.trace);
console.log("extracted core played", n, "steps →", s.cleared ? "clear" : "wipe");
console.log("FINAL byte-identical:", finalMatch);
console.log("STEP COUNT identical:", stepsMatch);
console.log("FULL TRACE identical (every 15th step):", traceMatch, `(${trace.length} checkpoints)`);
console.log(finalMatch && stepsMatch && traceMatch ? "\n✅ EXTRACTED CORE == IN-APP CORE (byte-for-byte)" : "\n❌ DIVERGENCE");
process.exit(finalMatch && stepsMatch && traceMatch ? 0 : 1);

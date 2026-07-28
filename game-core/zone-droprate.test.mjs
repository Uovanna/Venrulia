// Zone-scaled drop rates: gear gets rarer as zones get higher, so a solo player's gear stops
// arriving at the same pace forever. Levelling stays generous; the endgame is the starved part.
import { zoneDropScale, ZONE_DROP_MIN } from "./combat.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

// --- the curve ---------------------------------------------------------------------------------
{
  ok(zoneDropScale(10) === 1, "the first zone is untouched — levelling drops are what make those zones readable");
  ok(Math.abs(zoneDropScale(60) - ZONE_DROP_MIN) < 1e-9, `the last zone pays ${(ZONE_DROP_MIN * 100).toFixed(0)}% of the first zone's rate`);
  ok(zoneDropScale(1) === 1 && zoneDropScale(5) === 1, "below the first zone it does not go above 1 — no early-game bonus sneaks in");
  ok(zoneDropScale(80) === ZONE_DROP_MIN, "past the last zone it flattens rather than heading for zero");

  const levels = [10, 20, 30, 45, 55, 60];
  for (let i = 1; i < levels.length; i++) {
    ok(zoneDropScale(levels[i]) < zoneDropScale(levels[i - 1]),
       `level ${levels[i]} drops less often than level ${levels[i - 1]} (${(zoneDropScale(levels[i]) * 100).toFixed(0)}% vs ${(zoneDropScale(levels[i - 1]) * 100).toFixed(0)}%)`);
  }
  ok(zoneDropScale(60) > 0.25, "…but the endgame is starved, not closed — a hard floor keeps gear flowing");
}

// --- what it does to the grind -----------------------------------------------------------------
// Measured before this change: every zone paid ~18.2 items per 100 kills, level 10 and level 60
// alike. Reproduce that arithmetic here so the intent is checkable rather than asserted.
{
  const FLAT = 18.2;
  const at = (lvl) => FLAT * zoneDropScale(lvl);
  ok(Math.abs(at(10) - FLAT) < 0.1, `the starter zone still pays ~${at(10).toFixed(1)} items per 100 kills`);
  ok(at(60) < 8, `the endgame zone pays ~${at(60).toFixed(1)} items per 100 kills (it paid ${FLAT} — the same as the starter zone)`);
  ok(at(60) > 5, "…which is a longer chase, not a wall");
}

// --- the bridge out of normal mode --------------------------------------------------------------
// The raid drops at a flat 0.85 and is deliberately NOT scaled: it is the only route from
// normal-mode ilvl 63 to the ilvl 64 hard mode expects, so scaling it would not make the route
// feel earned, it would close it. That exemption lives in App.jsx's rollLoot, which cannot be
// imported here — `node game-core/droprate-sim.cjs` measures it against the real function and
// prints WHICH THE ZONE CURVE HAS CLOSED if it ever stops holding.
// What IS checkable here is the property the exemption relies on:
{
  ok(ZONE_DROP_MIN > 0 && ZONE_DROP_MIN < 1, "the curve only ever reduces a rate, never raises one");
  ok([1, 10, 30, 60, 90].every((l) => zoneDropScale(l) <= 1),
     "…at every level, so a path that opts out of scaling keeps exactly its own rate");
}

console.log(fail ? `\n❌ ${fail} zone drop-rate check(s) failed` : "\n✅ zone drop rates: generous while levelling, starved at the endgame, never closed");
process.exit(fail ? 1 : 0);

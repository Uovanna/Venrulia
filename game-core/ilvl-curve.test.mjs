// The endgame ilvl curve: a hard-mode ilvl has to be worth something.
//
// Item power was linear in ilvl, (1 + ilvl * 0.05), and that form has a ceiling nobody can tune
// around: across ilvl 63->70 the ratio is 4.50/4.15 = x1.08, and as the slope goes to infinity it
// only approaches 70/63 = x1.11. So NO linear curve can make the hard-mode climb worth more than
// 11%, however steep. Measured before the fix: an item gained 54 -> 58 raw stat points across the
// entire ilvl 63-70 arc, an arc costing 1,250 -> 5,000 kills per zone.
//
// The two properties that matter are that levelling is untouched, and that the climb compounds.
import { gearStatBase, endgameClimb, ENDGAME_ILVL_FLOOR, ENDGAME_ILVL_GROWTH, RARITY_STAT_MULT,
         generateItem, rarityById, baseArmorFor, weaponRangeFor, buildBotChar, maxHpFor,
         offlinePlayerDps, armGambits } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const SCORED = ["str","agi","int","sta","armor","leech","resil","vers","cdr","csd","crit","haste"];
const rawPts = (it) => SCORED.reduce((s, k) => s + (it.stats[k] || 0), 0);
const meanPts = (ilvl, rar, n = 400) => withRng(makeRng(ilvl * 17 + rar.length), () => {
  let t = 0;
  for (let i = 0; i < n; i++) t += rawPts(generateItem(ilvl, rarityById(rar), "chest", "warrior"));
  return t / n;
});

// --- levelling must be bit-for-bit unchanged ------------------------------------------------
// The climb is an ENDGAME lever. If it leaks below the cap it silently rebalances the 1-60
// experience, which nobody asked for and no other test would notice.
{
  const linear = (ilvl, ri) => (1 + ilvl * 0.05) * (RARITY_STAT_MULT[ri] || 1);
  let worst = 0;
  for (let ilvl = 1; ilvl <= ENDGAME_ILVL_FLOOR; ilvl++)
    for (let ri = 0; ri < RARITY_STAT_MULT.length; ri++)
      worst = Math.max(worst, Math.abs(gearStatBase(ilvl, ri) - linear(ilvl, ri)));
  ok(worst === 0, `gear at ilvl 1-${ENDGAME_ILVL_FLOOR} is identical to the old linear curve (max drift ${worst})`);
  ok(endgameClimb(ENDGAME_ILVL_FLOOR) === 1, "the climb term is exactly 1 at the levelling cap");
  ok(endgameClimb(1) === 1 && endgameClimb(30) === 1, "…and below it");
  ok(endgameClimb(undefined) === 1 && endgameClimb(0) === 1, "…and for junk input, rather than throwing");
}

// --- above the cap it compounds --------------------------------------------------------------
{
  ok(ENDGAME_ILVL_GROWTH > 1, `endgame ilvls compound at ${ENDGAME_ILVL_GROWTH}x each`);
  for (let ilvl = ENDGAME_ILVL_FLOOR + 1; ilvl <= 71; ilvl++)
    if (endgameClimb(ilvl) <= endgameClimb(ilvl - 1)) fail++, console.log(`  ✗ climb term went backwards at ilvl ${ilvl}`);
  ok(true, `the climb term rises monotonically from ${ENDGAME_ILVL_FLOOR + 1} to 71`);
  // Geometric, not linear: each step must be a constant RATIO, which is the whole point.
  const step = endgameClimb(70) / endgameClimb(69);
  ok(Math.abs(step - ENDGAME_ILVL_GROWTH) < 1e-9, "every endgame ilvl is worth the same multiplier, not the same flat amount");
}

// --- the climb has to beat what a linear curve could ever do ------------------------------------
{
  const p63 = meanPts(63, "epic"), p70 = meanPts(70, "epic");
  const ratio = p70 / p63;
  ok(ratio > 1.11,
     `ilvl 63 -> 70 is worth x${ratio.toFixed(2)} in stat points, beating the x1.11 ceiling of ANY linear curve`);
  ok(ratio > 1.5, `…and is a real progression arc (x${ratio.toFixed(2)}), not the x1.06 it used to be`);
  // Monotone across every hard-mode bracket, so no bracket is a dead step.
  let prev = 0, mono = true;
  for (const ilvl of [63, 64, 65, 66, 67, 68, 69, 70]) { const p = meanPts(ilvl, "epic"); if (p <= prev) mono = false; prev = p; }
  ok(mono, "every hard-mode bracket is stronger than the one below it");
}

// --- armor and weapon damage ride the SAME curve --------------------------------------------
// generateItem used to restate the ilvl curve inline instead of calling gearStatBase, so armor and
// weapon damage could move with the curve while the stats on the item did not.
{
  const a63 = baseArmorFor(63, 4, "chest"), a70 = baseArmorFor(70, 4, "chest");
  const w63 = weaponRangeFor(63, 4), w70 = weaponRangeFor(70, 4);
  const wAvg = (w) => (w.min + w.max) / 2;
  const expect = endgameClimb(70) / endgameClimb(63) * ((1 + 70 * 0.05) / (1 + 63 * 0.05));
  ok(Math.abs((a70 / a63) / expect - 1) < 0.02, `armor rides the same curve (x${(a70 / a63).toFixed(2)} against x${expect.toFixed(2)})`);
  ok(Math.abs((wAvg(w70) / wAvg(w63)) / expect - 1) < 0.02,
     `weapon damage rides the same curve (x${(wAvg(w70) / wAvg(w63)).toFixed(2)})`);
  const pts = meanPts(70, "epic") / meanPts(63, "epic");
  ok(Math.abs(pts / expect - 1) < 0.06, `…and so do the item's own stats (x${pts.toFixed(2)}) — one curve, not three`);
}

// --- what it does to a character ------------------------------------------------------------
{
  const build = (ilvl, seed) => withRng(makeRng(seed), () => {
    const c = buildBotChar("warrior", "w_berserk", 60, ilvl);
    c.spec = "w_berserk";
    return c;
  });
  const avg = (ilvl) => { let d = 0, h = 0; const N = 40;
    for (let s = 0; s < N; s++) { const c = build(ilvl, ilvl * 1000 + s * 13); d += offlinePlayerDps(c); h += maxHpFor(c); }
    return { dps: d / N, hp: h / N }; };
  const a = avg(63), b = avg(70);
  ok(b.dps / a.dps > 1.4, `a full set at ilvl 70 deals x${(b.dps / a.dps).toFixed(2)} the damage of one at 63`);
  ok(b.hp / a.hp > 1.1, `…and carries x${(b.hp / a.hp).toFixed(2)} the health`);
  // Sanity: the endgame must not have run away from the levelling game it grows out of.
  const cap = avg(ENDGAME_ILVL_FLOOR);
  ok(b.dps / cap.dps < 3.5, `and ilvl 70 is x${(b.dps / cap.dps).toFixed(2)} a fresh level-60 set — a climb, not an explosion`);
}

console.log(fail ? `\n❌ ${fail} ilvl curve check(s) failed`
                 : "\n✅ ilvl curve: levelling untouched, the endgame climb compounds and every bracket counts");
process.exit(fail ? 1 : 0);

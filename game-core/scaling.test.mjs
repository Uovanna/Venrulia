// Per-class damage scaling: rogues and hunters convert Agility into physical damage, everyone
// else converts Strength. Plus the rogue crit cut that paid for it, and the save migration that
// hands back attribute points the change made inert.
import { physScalingStat, STAT_DMG_RATE, CRIT_BASE, CRIT_ROGUE_BONUS, CLASSES,
         critChanceFor, createCharacter, buildBotChar, offlinePlayerDps,
         refundStrayScalingPoints, normalizeChar, CRIT_SOFT_CAP, armGambits } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const SEEDS = [11, 22, 33, 44, 55, 66];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const armed = (cls, spec, sd) => withRng(makeRng(sd), () => {
  let c = buildBotChar(cls, spec, 60, 63); c.spec = spec;
  c = armGambits(c);   // gambits, not the dead auto-skill flag
  // Adding a main stat to a FOCUSED piece puts its Power affix dormant, which reads as a stat
  // being worth negative dps and has nothing to do with scaling.
  c.equipment.chest = { ...c.equipment.chest, stats: { ...c.equipment.chest.stats, ap: 0, sp: 0 } };
  return c;
});

// --- the table follows what each class already declares ------------------------------------
{
  for (const cls of CLASSES) {
    const expected = cls.main === "agi" ? "agi" : "str";
    ok(physScalingStat(cls.id) === expected,
       `${cls.id} declares main "${cls.main}" and scales physical damage off ${physScalingStat(cls.id)}`);
  }
  ok(physScalingStat("rogue") === "agi" && physScalingStat("hunter") === "agi",
     "the two classes whose gear is named for Agility finally scale off it");
  ok(physScalingStat("nonesuch") === "str", "an unknown class falls back to Strength rather than throwing");
  // Casters are excluded on purpose: their real damage is magic and already scales off Intellect.
  ok(physScalingStat("mage") === "str" && physScalingStat("warlock") === "str",
     "casters keep Strength for their incidental auto-attack — routing it through Intellect would be a silent buff");
}

// --- all three main stats convert at the same rate --------------------------------------------
{
  ok(STAT_DMG_RATE.agi === STAT_DMG_RATE.str && STAT_DMG_RATE.str === STAT_DMG_RATE.int,
     `str/agi/int all convert at x${STAT_DMG_RATE.str}`);
  // Agility was briefly cut to 1.0 to "pay for" the speed and crit it also grants. That rate
  // multiplies the whole damage term, not the increment, and cost rogues 12.1% total dps.
  ok(STAT_DMG_RATE.agi > 1.2, "Agility is NOT discounted — a lower rate here nerfs the entire damage base, not just the margin");
}

// --- the stat each class actually uses ---------------------------------------------------------
{
  const bump = (cls, spec, stat) => mean(SEEDS.map((sd) => {
    const b = armed(cls, spec, sd), d0 = offlinePlayerDps(b);
    let c = JSON.parse(JSON.stringify(b));
    c.equipment.chest.stats[stat] = (c.equipment.chest.stats[stat] || 0) + 30;
    return offlinePlayerDps(c) / d0 - 1;
  }));
  for (const [cls, spec] of [["rogue", "r_ambush"], ["hunter", "h_snipe"]]) {
    ok(bump(cls, spec, "agi") > 0.05, `${cls}: 30 Agility is worth ${(bump(cls, spec, "agi") * 100).toFixed(1)}% dps`);
    ok(Math.abs(bump(cls, spec, "str")) < 0.01, `${cls}: Strength no longer does anything for it`);
  }
  ok(bump("warrior", "w_berserk", "str") > 0.05, "warrior still scales off Strength");
  ok(bump("warrior", "w_berserk", "agi") > 0, "…and still gets attack speed and crit from Agility");

  // The balance property that makes the double-dip acceptable: gear rolls all three main stats
  // equally, so what matters is the EXPECTED value of a random roll, not the value of the best one.
  const expected = (cls, spec) => ["str", "agi", "int"].reduce((a, k) => a + bump(cls, spec, k), 0) / 3;
  const w = expected("warrior", "w_berserk"), r = expected("rogue", "r_ambush");
  ok(Math.abs(r / w - 1) < 0.12,
     `a random main-stat roll is worth ${(r / w).toFixed(2)}x as much to a rogue as to a warrior — concentration cancels the double-dip`);
}

// --- the rogue's crit cut -----------------------------------------------------------------------
{
  ok(CRIT_ROGUE_BONUS < 0.05, `the rogue class bonus is +${(CRIT_ROGUE_BONUS * 100).toFixed(0)}% (it was +13%)`);
  const lvl1 = critChanceFor(createCharacter("t", "rogue", "human"));
  const w1 = critChanceFor(createCharacter("t", "warrior", "human"));
  ok(lvl1 > w1, `a fresh rogue still crits more than a fresh warrior (${(lvl1 * 100).toFixed(0)}% vs ${(w1 * 100).toFixed(0)}%)`);
  ok(lvl1 < w1 * 1.7, "…but no longer more than twice as often, which is where +13% put it");

  const geared = mean(SEEDS.map((sd) => critChanceFor(armed("rogue", "r_ambush", sd))));
  ok(geared < CRIT_SOFT_CAP - 0.1,
     `a geared rogue sits at ${(geared * 100).toFixed(1)}%, clear of the ${(CRIT_SOFT_CAP * 100).toFixed(0)}% soft cap that was damping its own Agility`);

  // The class description overstated the bonus by a factor of two before this change.
  const rogue = CLASSES.find((c) => c.id === "rogue");
  ok(rogue.passive.includes(`+${Math.round(CRIT_ROGUE_BONUS * 100)}% crit`),
     `the class description states the real number: "${rogue.passive}"`);
}

// --- the save migration --------------------------------------------------------------------------
{
  const rogue = { cls: "rogue", attrPoints: 2, allocated: { str: 7, agi: 3, int: 0, sta: 1 } };
  const r = refundStrayScalingPoints(rogue);
  ok(r.attrPoints === 9, "a rogue's 7 points of Strength come back as unspent (2 + 7 = 9)");
  ok(r.allocated.str === 0, "…and are cleared from the allocation");
  ok(r.allocated.agi === 3 && r.allocated.sta === 1, "…leaving every other allocation untouched");

  // Must not fire twice, or every load hands out more points.
  const again = refundStrayScalingPoints({ cls: "rogue", ...r });
  ok(again.attrPoints === 9, "running it again refunds nothing — the migration is self-terminating");

  const warrior = refundStrayScalingPoints({ cls: "warrior", attrPoints: 1, allocated: { str: 7, agi: 0, int: 0, sta: 0 } });
  ok(warrior.attrPoints === 1 && warrior.allocated.str === 7, "a warrior's Strength is untouched — it still scales off it");

  ok(refundStrayScalingPoints({ cls: "rogue" }).attrPoints === 0, "a character with no allocation at all does not throw");

  // The refund has to reach real saves, which means going through normalizeChar. This is the exact
  // shape of failure the gambit slot migration hit: a migration that existed but was never called.
  const loaded = normalizeChar({ ...createCharacter("t", "hunter", "human"), attrPoints: 0, allocated: { str: 5, agi: 0, int: 0, sta: 0 } });
  ok(loaded.attrPoints === 5 && loaded.allocated.str === 0, "normalizeChar applies it, so it reaches saves on load");
}

console.log(fail ? `\n❌ ${fail} scaling check(s) failed`
                 : "\n✅ scaling: rogues and hunters run on Agility, crit cut applied, stray points refunded");
process.exit(fail ? 1 : 0);

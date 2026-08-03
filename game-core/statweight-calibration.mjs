// What every scored stat is actually worth, per point, measured through the real combat code.
//
// itemScore's weights were hand-set and had drifted badly: crit damage measured 1.26 main-stat
// points and was priced at 0.4. This produces the numbers the table should be built from.
//
//   node game-core/statweight-calibration.mjs
//
// Measures and recommends; changes nothing.
import { buildBotChar, offlinePlayerDps, maxHpFor, mitigation, effectiveStats, secPct,
         LEECH_MULT, SECONDARY_POOL, armGambits } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 101, 202, 303];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ROSTER = [["warrior", "w_berserk"], ["paladin", "p_just"], ["rogue", "r_ambush"],
                ["hunter", "h_snipe"], ["mage", "m_fire"], ["warlock", "l_scorch"]];
const N = 30;   // rating added per probe

const armed = (cls, spec, sd) => withRng(makeRng(sd), () => {
  let c = buildBotChar(cls, spec, 60, 63); c.spec = spec;
  c = armGambits(c);   // gambits, not the dead auto-skill flag
  // Adding a main stat to a FOCUSED piece puts its Power affix dormant, which reads as a stat
  // being worth negative value and has nothing to do with the stat.
  c.equipment.chest = { ...c.equipment.chest, stats: { ...c.equipment.chest.stats, ap: 0, sp: 0 } };
  return c;
});
const bump = (c, stat, amount) => {
  const k = JSON.parse(JSON.stringify(c));
  k.equipment.chest.stats[stat] = (k.equipment.chest.stats[stat] || 0) + amount;
  return k;
};

// Effective health: raw health divided by what actually gets through armor. A level-62 attacker is
// the endgame reference.
const ehp = (c) => {
  const eff = effectiveStats(c);
  return maxHpFor(c) / (1 - mitigation(eff.armor || 0, 62));
};

// --- measure --------------------------------------------------------------------------------
// The unit is one point of the class's OWN scaling stat. Using Strength for everyone would be
// wrong now that rogues and hunters scale off Agility: Strength is worth 0.00% to them, which
// drags the reference down by a third and inflates every other stat against it.
const SCALES_OFF = { warrior: "str", rogue: "agi", hunter: "agi", paladin: "int", mage: "int", warlock: "int" };
const STATS = ["sta", "armor", "vers", "cdr", "csd", "crit", "haste", "leech", "resil"];
const dpsGain = {}, ehpGain = {}, ratio = {};
for (const stat of STATS) { dpsGain[stat] = []; ehpGain[stat] = []; ratio[stat] = []; }
const refGain = [];
for (const [cls, spec] of ROSTER) {
  // Per class, measure its own scaling stat first — that is this class's unit.
  const ownGains = SEEDS.map((sd) => {
    const base = armed(cls, spec, sd);
    return offlinePlayerDps(bump(base, SCALES_OFF[cls], N)) / offlinePlayerDps(base) - 1;
  });
  const own = mean(ownGains); refGain.push(own);
  for (const stat of STATS) {
    const d = [], e = [];
    for (const sd of SEEDS) {
      const base = armed(cls, spec, sd), up = bump(base, stat, N);
      d.push(offlinePlayerDps(up) / offlinePlayerDps(base) - 1);
      e.push(ehp(up) / ehp(base) - 1);
    }
    dpsGain[stat].push(mean(d)); ehpGain[stat].push(mean(e));
    ratio[stat].push({ dmg: mean(d) / own, def: mean(e) / own });
  }
}
const REF_PCT = mean(refGain);
for (const stat of STATS) { dpsGain[stat] = mean(dpsGain[stat]); ehpGain[stat] = mean(ehpGain[stat]); }

// Leech is sustain, which neither dps nor max-health can see: it returns a fraction of damage
// dealt as healing. Over a fight it behaves like extra effective health, so price it that way.
// Modelled rather than measured, and flagged as such.
const FIGHT_SECONDS = 25;
const leechEhp = mean(ROSTER.flatMap(([cls, spec]) => SEEDS.map((sd) => {
  const base = armed(cls, spec, sd);
  const healed = offlinePlayerDps(base) * (secPct("leech", N) * LEECH_MULT / 100) * FIGHT_SECONDS;
  return healed / ehp(base);
})));

console.log("\nVALUE OF +" + N + " RATING, averaged over 6 classes x " + SEEDS.length + " seeded gear rolls\n");
console.log("reference: +" + N + " of a class's OWN scaling stat is worth " + (REF_PCT * 100).toFixed(2) + "% dps.\n");
console.log(pad("stat", 8) + rp("dps", 9) + rp("ehp", 9) + rp("per point vs your scaling stat", 32));
const perPoint = {};
for (const stat of STATS) {
  const dps = dpsGain[stat], eh = stat === "leech" ? leechEhp : ehpGain[stat];
  // Average the per-class RATIOS, not the raw gains — a class where a stat does nothing must not
  // be able to drag the unit itself around.
  const dmg = mean(ratio[stat].map((r) => r.dmg));
  const def = stat === "leech" ? leechEhp / REF_PCT : mean(ratio[stat].map((r) => r.def));
  perPoint[stat] = { dmg, def };
  console.log(pad(stat, 8) + rp((dps * 100).toFixed(2) + "%", 9) + rp((eh * 100).toFixed(2) + "%", 9)
    + rp("dmg " + dmg.toFixed(2) + "  def " + def.toFixed(2), 32)
    + (stat === "leech" ? "   (modelled over a " + FIGHT_SECONDS + "s fight)" : ""));
}

// --- recommend ------------------------------------------------------------------------------
// Offence and defence are not interchangeable, and the existing table already encodes a view on
// the exchange rate: stamina is pure effective health and is priced at 0.75 while a main stat is
// 1.0. Keep that rate rather than inventing one, so this fixes the INTERNAL inconsistency between
// secondaries without quietly re-deciding how much survivability is worth.
const CURRENT = { sta: 0.75, armor: 0.55, leech: 0.45, csd: 0.4, cdr: 0.35, vers: 0.35, resil: 0.25, crit: 0.35, haste: 0.15 };
const DEF_RATE = CURRENT.sta / perPoint.sta.def;
console.log("\n  defence exchange rate implied by the existing stamina weight: "
  + DEF_RATE.toFixed(3) + "  (stamina is priced " + CURRENT.sta + " against a measured "
  + perPoint.sta.def.toFixed(2) + " points of effective health)");

console.log("\nRECOMMENDED WEIGHTS\n");
console.log(pad("stat", 8) + rp("current", 10) + rp("measured", 10) + rp("proposed", 10) + "   note");
for (const stat of ["sta", "armor", "leech", "csd", "vers", "crit", "cdr", "haste", "resil"]) {
  const p = perPoint[stat];
  const raw = p.dmg + p.def * DEF_RATE;                 // damage at par, defence at the house rate
  const proposed = Math.round(Math.max(0.1, raw) * 20) / 20;   // nearest 0.05
  const note = stat === "resil" ? "DoT cut + CC resist — not measurable here, left at judgement"
             : stat === "leech" ? "modelled sustain, not measured"
             : Math.abs(proposed - CURRENT[stat]) / CURRENT[stat] > 0.5 ? "was off by more than half" : "";
  console.log(pad(stat, 8) + rp(CURRENT[stat], 10) + rp(raw.toFixed(2), 10) + rp(proposed, 10) + "   " + note);
}
// Leech is the only weight here resting on an assumption rather than a measurement, and it is
// linear in fight length, so state the sensitivity rather than hiding it behind one number.
console.log("\n  LEECH SENSITIVITY — its value is proportional to how long the fight lasts:");
for (const secs of [2, 5, 10, 25, 60]) {
  const v = (leechEhp / REF_PCT) * (secs / FIGHT_SECONDS) * DEF_RATE;
  const ctx = secs <= 2 ? "solo trash (measured ~1.5s kills at ilvl 63)"
            : secs <= 10 ? "a solo elite or a bad pull"
            : secs <= 25 ? "a solo boss"
            : "a group boss (measured ~120s)";
  console.log("    " + String(secs + "s").padStart(4) + " fight -> weight " + v.toFixed(2) + "   " + ctx);
}
console.log("");

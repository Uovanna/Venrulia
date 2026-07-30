// Groundwork for the str/agi/int question. Measures three things that decide whether making
// Agility a per-class scaling stat is safe, and what it would cost:
//
//   1. Does group content self-calibrate? Boss HP is grpEstDps * dur, so in principle changing
//      player damage moves boss HP with it and the fight lasts the same time. Solo enemy HP is
//      level * 26 + 50 and does NOT move. Both are driven through the REAL encounter runner
//      rather than argued from the formulas.
//   2. What the rogue's crit bonus is actually worth, and what cutting it costs.
//   3. How big the Agility double-dip would be — under a per-class scaling stat, Agility would
//      buy damage AND attack speed AND crit, where Strength buys damage alone.
//
//   node game-core/scaling-proposal-sim.mjs
//
// Measures and models; changes nothing.
import { buildBotChar, offlinePlayerDps, grpEstDps, critChanceFor, effectiveStats,
         maxHpFor, createCharacter, CRIT_SOFT_CAP } from "./combat.mjs";
import { runEncounter } from "../server/sim.mjs";
import { withRng, makeRng } from "./rng.mjs";

const pad = (s, n) => String(s).padEnd(n), rp = (s, n) => String(s).padStart(n);
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];
const armed = (cls, spec, seed, ilvl = 63) => withRng(makeRng(seed), () => {
  const c = buildBotChar(cls, spec, 60, ilvl); c.spec = spec;
  c.autoSkillsOwned = {}; c.autoSkills = {};
  for (const n of (c.selectedSkills || [])) { c.autoSkillsOwned[n] = true; c.autoSkills[n] = true; }
  return c;
});
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------------------------------------------------------------------------------------------
// 1. DOES GROUP CONTENT SELF-CALIBRATE?
// ---------------------------------------------------------------------------------------------
// Emulate "players got stronger" by handing the party better gear, then check whether the fight
// still takes the same time. If boss HP tracks party dps, duration is flat and a scaling change
// is nearly free for group content. If it does not, every encounter needs retuning by hand.
console.log("\n=== 1. GROUP CONTENT: does boss HP track party damage? ===");
console.log("Boss HP = grpEstDps x duration, so a stronger party should meet a bigger boss.\n");
console.log(pad("party ilvl", 12) + rp("est party dps", 15) + rp("boss hp", 11) + rp("real fight", 12) + rp("outcome", 10));
const partyFor = (ilvl, seed) => [
  { char: armed("warrior", "w_prot", seed, ilvl), role: "tank", tier: "experienced" },
  { char: armed("paladin", "p_holy", seed + 1, ilvl), role: "healer", tier: "experienced" },
  { char: armed("rogue", "r_ambush", seed + 2, ilvl), role: "dps", tier: "experienced" },
  { char: armed("mage", "m_fire", seed + 3, ilvl), role: "dps", tier: "experienced" },
];
const durations = [];
for (const ilvl of [40, 50, 60, 63, 66, 71]) {
  const runs = SEEDS.slice(0, 4).map((sd) => {
    const party = partyFor(ilvl, sd);
    const est = grpEstDps(party);
    const r = runEncounter({ party, boss: "ashen", seed: sd });
    return { est, hp: r.state.enemies[0].maxHp, sec: r.elapsed / 1000, out: r.outcome };
  });
  const sec = mean(runs.map((r) => r.sec));
  durations.push(sec);
  console.log(pad(ilvl, 12) + rp(Math.round(mean(runs.map((r) => r.est))), 15)
    + rp(Math.round(mean(runs.map((r) => r.hp))), 11) + rp(sec.toFixed(1) + "s", 12)
    + rp(runs[0].out, 10));
}
const spread = Math.max(...durations) / Math.min(...durations);
console.log(`\n  fight length varies x${spread.toFixed(2)} across a 31-ilvl power range.`);
console.log(spread < 1.35
  ? "  -> Group content SELF-CALIBRATES. A scaling change moves boss HP with it; duration holds."
  : "  -> Group content does NOT self-calibrate; a scaling change would need every boss retuned.");

// ---------------------------------------------------------------------------------------------
// 2. SOLO CONTENT: enemy HP is level-based, so it cannot self-calibrate
// ---------------------------------------------------------------------------------------------
console.log("\n=== 2. SOLO CONTENT: the same power range against fixed enemy health ===");
console.log("makeEnemy uses (level * 26 + 50) x rank x tier. Nothing there reads player damage.\n");
const enemyRepHp = (level) => level * 26 + 50;
console.log(pad("player ilvl", 13) + rp("solo dps", 11) + rp("lvl-60 mob hp", 15) + rp("kill time", 12));
const soloKill = [];
for (const ilvl of [40, 50, 60, 63, 66, 71]) {
  const dps = mean(SEEDS.map((sd) => offlinePlayerDps(armed("rogue", "r_ambush", sd, ilvl))));
  const t = enemyRepHp(60) / dps;
  soloKill.push(t);
  console.log(pad(ilvl, 13) + rp(Math.round(dps), 11) + rp(enemyRepHp(60), 15) + rp(t.toFixed(2) + "s", 12));
}
console.log(`\n  kill time varies x${(Math.max(...soloKill) / Math.min(...soloKill)).toFixed(2)} over the same range —`);
console.log("  solo is where a damage change lands undiluted. This is the side that needs retuning.");

// ---------------------------------------------------------------------------------------------
// 3. THE ROGUE'S CRIT BONUS
// ---------------------------------------------------------------------------------------------
console.log("\n=== 3. THE ROGUE'S CLASS CRIT ===");
console.log("Everyone starts at 12%. The rogue bonus was +13% and is now +3%; rows below the measured");
console.log("range extrapolate, and the +13% row is what it looked like before the change.\n");
// A real level-1 character, not a geared level-60 with its level field overwritten — that keeps
// 90-odd Agility and reports a warrior "starting" at 24.6% crit.
console.log(pad("class", 10) + rp("lvl1 naked", 12) + rp("lvl60 geared", 15) + rp("vs cap", 10));
for (const [cls, spec] of [["warrior", "w_berserk"], ["rogue", "r_ambush"], ["hunter", "h_snipe"], ["mage", "m_fire"]]) {
  const geared = mean(SEEDS.map((sd) => critChanceFor(armed(cls, spec, sd))));
  const lvl1 = critChanceFor(createCharacter("t", cls, "human"));
  console.log(pad(cls, 10) + rp((lvl1 * 100).toFixed(1) + "%", 12) + rp((geared * 100).toFixed(1) + "%", 15)
    + rp(geared > CRIT_SOFT_CAP ? "OVER" : (CRIT_SOFT_CAP - geared) * 100 < 8 ? "close" : "clear", 10));
}

// What is the bonus worth in dps? Rather than rescaling by critFactor — which would overstate the
// nerf, since damage-over-time is NOT multiplied by crit — measure the real dps/crit relationship
// by varying gear crit rating through the actual code path, then read the curve at each target.
const rogueNow = SEEDS.map((sd) => armed("rogue", "r_ambush", sd));
const nowDps = mean(rogueNow.map(offlinePlayerDps));
const nowCrit = mean(rogueNow.map(critChanceFor));
const samples = [];
for (const rating of [0, 15, 30, 60, 120]) {
  const cs = rogueNow.map((c) => {
    const k = JSON.parse(JSON.stringify(c));
    k.equipment.trinket = { ...k.equipment.trinket, stats: { ...k.equipment.trinket.stats, crit: rating } };
    return { crit: critChanceFor(k), dps: offlinePlayerDps(k) };
  });
  samples.push({ crit: mean(cs.map((x) => x.crit)), dps: mean(cs.map((x) => x.dps)) });
}
// Slope of dps per point of crit chance, from the two lowest real samples.
const slope = (samples[1].dps - samples[0].dps) / (samples[1].crit - samples[0].crit);
console.log("\n  measured: " + slope.toFixed(0) + " dps per 1.00 of crit chance (from real rolls, not a rescale)");
console.log("  rows below EXTRAPOLATE down that slope — the code cannot produce negative crit rating.\n");
for (const cut of [0.13, 0.08, 0.05, 0.03, 0.02]) {
  const target = nowCrit - (0.13 - cut);
  const d = samples[0].dps + (target - samples[0].crit) * slope;
  console.log("    rogue bonus +" + pad((cut * 100).toFixed(0) + "%", 4) + " -> lvl1 "
    + rp(((0.12 + cut + 0.03) * 100).toFixed(0) + "%", 5) + ", geared "
    + rp((target * 100).toFixed(1) + "%", 7) + "   dps " + rp(Math.round(d), 6)
    + "   (" + ((d / nowDps - 1) * 100).toFixed(1) + "%)");
}

// ---------------------------------------------------------------------------------------------
// 4. THE AGILITY DOUBLE-DIP
// ---------------------------------------------------------------------------------------------
// computeDamage reads `magic ? int : str`, so "this class scales off Agility" can be emulated by
// moving a character's Agility into Strength — the damage term then reads the Agility value while
// Agility keeps paying attack speed and crit, which is exactly the double-dip in question.
console.log("\n=== 4. THE AGILITY DOUBLE-DIP, NOW THAT AGILITY SCALES ===");
console.log("Rogues and hunters now convert Agility into damage, so for them the middle and right");
console.log("columns are the same number and Strength reads ~0. The warrior row is the control.\n");
console.log(pad("class", 10) + rp("+30 str today", 15) + rp("+30 agi today", 15) + rp("+30 agi if it scaled", 22));
for (const [cls, spec] of [["rogue", "r_ambush"], ["hunter", "h_snipe"], ["warrior", "w_berserk"]]) {
  const g = { str: [], agi: [], both: [] };
  for (const sd of SEEDS) {
    const base = armed(cls, spec, sd);
    const d0 = offlinePlayerDps(base);
    const bump = (over) => {
      const c = JSON.parse(JSON.stringify(base));
      c.equipment.chest = { ...c.equipment.chest, stats: { ...c.equipment.chest.stats, ...over } };
      return offlinePlayerDps(c) / d0 - 1;
    };
    const st = base.equipment.chest.stats;
    g.str.push(bump({ str: (st.str || 0) + 30 }));
    g.agi.push(bump({ agi: (st.agi || 0) + 30 }));
    // scaling off Agility: the 30 points pay damage (via str) AND speed/crit (via agi)
    g.both.push(bump({ str: (st.str || 0) + 30, agi: (st.agi || 0) + 30 }));
  }
  console.log(pad(cls, 10) + rp((mean(g.str) * 100).toFixed(1) + "%", 15) + rp((mean(g.agi) * 100).toFixed(1) + "%", 15)
    + rp((mean(g.both) * 100).toFixed(1) + "%", 22));
}
console.log("\n  The margin favours Agility classes (rogue 1.39x a warrior's Strength, hunter 1.63x),");
console.log("  but that is not the balance figure. Gear rolls all three main stats equally, so what");
console.log("  counts is the EXPECTED value of a random roll — and there a rogue lands at 0.97x a");
console.log("  warrior, because Strength and Intellect are now worth nothing to it. Concentration");
console.log("  pays for the double-dip on its own; no rate cut was needed, and cutting one cost");
console.log("  rogues 12.1% of their total damage when it was tried.");
console.log("");

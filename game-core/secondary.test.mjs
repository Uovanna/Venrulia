// Step 0: diminishing returns on secondaries, crit chance and haste as gear stats, crit damage
// repriced, and heals that can crit.
import { secPct, secEffectiveRating, SEC_CAP, SEC_RATE, SECONDARY_POOL, CRIT_SOFT_CAP,
         critChanceFor, critMultFor, hasteOf, critHeal, buildBotChar, effectiveStats } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const geared = (stat, rating) => {
  const c = buildBotChar("warrior", "w_berserk", 60, 63);
  for (const k in c.equipment) c.equipment[k] = null;
  c.equipment.chest = { name: "Bench", slotId: "chest", ilvl: 63, rarity: "epic", stats: { [stat]: rating } };
  return c;
};

// --- diminishing returns ---------------------------------------------------------------------
{
  for (const k of ["vers", "leech", "cdr", "csd", "crit", "haste"]) {
    const hard = SEC_CAP[k] / SEC_RATE[k], soft = hard * 0.5;
    ok(Math.abs(secEffectiveRating(k, soft) - soft) < 1e-9, `${k}: rating below the soft cap is untouched`);
    ok(secEffectiveRating(k, hard * 4) < hard, `${k}: even 4x the hard-cap rating stays under the cap`);
    ok(secPct(k, hard * 100) < SEC_CAP[k], `${k}: the hard cap is approached, never reached`);
  }
  ok(secPct("vers", 0) === 0, "no rating yields nothing");

  // The defect this replaced: past the old cap, more rating was worth exactly zero.
  const gain = (r) => secPct("vers", r + 10) - secPct("vers", r);
  ok(gain(60) > 0 && gain(200) > 0, "past the old 50-rating wall, more rating still pays");
  ok(gain(20) > gain(60) && gain(60) > gain(200), "…but it pays progressively less — the returns really do diminish");
}

// --- crit damage repriced ----------------------------------------------------------------------
{
  ok(SEC_RATE.csd === 1.5, `crit damage rate is ${SEC_RATE.csd} (was 4 — it was worth x2.3-x3.4 a versatility point)`);
  // At the roster's typical ~35% crit, 10 rating of csd should sit beside 10 of versatility.
  const p = 0.35, dmg = (csd, vers) => (1 + p * (1.8 + secPct("csd", csd) / 100 - 1)) * (1 + secPct("vers", vers) / 100);
  const gCsd = dmg(10, 0) / dmg(0, 0) - 1, gVers = dmg(0, 10) / dmg(0, 0) - 1;
  ok(gCsd / gVers > 0.8 && gCsd / gVers < 1.3,
     `at 35% crit, csd is worth x${(gCsd / gVers).toFixed(2)} a versatility point (was x2.73)`);
}

// --- crit chance is a gear stat, soft-capped ---------------------------------------------------
{
  const bare = buildBotChar("warrior", "w_berserk", 60, 63);
  for (const k in bare.equipment) bare.equipment[k] = null;
  const base = critChanceFor(bare);
  const withCrit = critChanceFor(geared("crit", 40));
  ok(withCrit > base, `crit rating raises crit chance (${(base * 100).toFixed(0)}% -> ${(withCrit * 100).toFixed(0)}%)`);

  // Gear crit is itself capped at 20%, so reaching the 55% ceiling takes more than gear. Once the
  // rogue's class bonus dropped from +13% to +3%, a geared rogue tops out under 48% and the cap
  // stopped binding on ordinary characters — which is the intent. What still reaches it is a
  // character STACKING Agility, and agility classes now have a damage reason to do exactly that,
  // so the cap has become an endgame consideration rather than something a rogue hit by existing.
  const critty = buildBotChar("rogue", "r_ambush", 60, 63);
  critty.race = "troll";
  const rogueBase = critChanceFor(critty);
  critty.equipment.trinket = { name: "Bench", slotId: "trinket", ilvl: 63, rarity: "epic", stats: { crit: 100000, agi: 200 } };
  const c = critChanceFor(critty);
  const undamped = rogueBase + SEC_CAP.crit / 100;
  ok(c > CRIT_SOFT_CAP, `a troll rogue stacking agility still exceeds the soft cap (${(c * 100).toFixed(0)}%) — excess is damped, not discarded`);
  ok(c < undamped + 0.35, "…and lands below the undamped sum, so the damping is real");

  // An ordinary geared rogue must now sit clear of the cap, or the class bonus cut did nothing.
  const plain = buildBotChar("rogue", "r_ambush", 60, 63);
  plain.equipment.trinket = { name: "Bench", slotId: "trinket", ilvl: 63, rarity: "epic", stats: { crit: 100000 } };
  ok(critChanceFor(plain) < CRIT_SOFT_CAP,
     `a human rogue with maxed gear crit reads ${(critChanceFor(plain) * 100).toFixed(0)}%, under the cap rather than pinned against it`);
  ok(critChanceFor(geared("crit", 0)) === base, "zero crit rating changes nothing");
}

// --- haste -------------------------------------------------------------------------------------
{
  ok(SEC_CAP.haste === 15, `haste caps at ${SEC_CAP.haste}% — chosen low because it also shortens the group GCD`);
  const h = hasteOf(geared("haste", 40));
  ok(h > 0, `haste rating produces haste (${(h * 100).toFixed(1)}%)`);
  ok(hasteOf(geared("haste", 100000)) < SEC_CAP.haste / 100 + 1e-6, "haste cannot exceed its cap");
  ok(hasteOf(geared("vers", 40)) === 0, "a different secondary grants no haste");
}

// --- heals crit ---------------------------------------------------------------------------------
{
  const healer = buildBotChar("paladin", "p_holy", 60, 63);
  const n = 4000;
  let crits = 0, total = 0;
  withRng(makeRng(9), () => {
    for (let i = 0; i < n; i++) { const r = critHeal(healer, 100); if (r.crit) crits++; total += r.amount; }
  });
  const rate = crits / n, expect = critChanceFor(healer);
  ok(Math.abs(rate - expect) < 0.05, `heals crit at the character's own rate (${(rate * 100).toFixed(0)}% vs ${(expect * 100).toFixed(0)}%)`);
  ok(total / n > 100, `…and a crit heals for more (average ${Math.round(total / n)} from a base of 100)`);

  const one = withRng(makeRng(1), () => critHeal(healer, 100));
  ok(one.amount === (one.crit ? Math.round(100 * critMultFor(healer)) : 100),
     "a crit heal uses the same multiplier as a crit hit");
}

// --- the pool -------------------------------------------------------------------------------------
{
  ok(SECONDARY_POOL.includes("crit") && SECONDARY_POOL.includes("haste"), "crit and haste are rollable secondaries");
  for (const k of SECONDARY_POOL) if (k !== "sta") ok(SEC_CAP[k] > 0 && SEC_RATE[k] > 0, `${k} has a cap and a rate`);
}

console.log(fail ? `\n❌ ${fail} secondary check(s) failed` : "\n✅ secondaries: diminishing returns, crit + haste on gear, csd repriced, heals crit");
process.exit(fail ? 1 : 0);

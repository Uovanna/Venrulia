// Slot identity: which secondaries a slot leans toward, shared by drops and the reroll shop.
import { SLOT_SECONDARY, SECONDARY_POOL, secondaryWeight, pickSlotSecondary, LOOT_SLOTS,
         generateItem, rarityById, SEC_SIZE, buildBotChar, maxHpFor } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const dist = (slot, exclude = [], n = 60000) => {
  const hit = {};
  for (let i = 0; i < n; i++) { const k = pickSlotSecondary(slot, exclude); hit[k] = (hit[k] || 0) + 1; }
  for (const k in hit) hit[k] /= n;
  return hit;
};

// --- the table itself ---------------------------------------------------------------------
{
  const slots = LOOT_SLOTS.map((s) => s.id);
  ok(slots.every((s) => (SLOT_SECONDARY[s] || []).length === 2), "every lootable slot has exactly two favoured secondaries");
  ok(slots.every((s) => SLOT_SECONDARY[s].every((k) => SECONDARY_POOL.includes(k))), "…and they are all real secondaries");

  // Nothing may be unfindable: each secondary needs somewhere to call home.
  const homes = {};
  for (const s of slots) for (const k of SLOT_SECONDARY[s]) homes[k] = (homes[k] || 0) + 1;
  for (const k of SECONDARY_POOL) ok((homes[k] || 0) >= 2, `${k} is favoured on ${homes[k] || 0} slots (needs >= 2)`);
}

// --- weighting ----------------------------------------------------------------------------
{
  const [hFav] = SLOT_SECONDARY.hands;
  const hOff = SECONDARY_POOL.find((k) => k !== "sta" && !SLOT_SECONDARY.hands.includes(k));
  ok(secondaryWeight("hands", hFav) > secondaryWeight("hands", hOff), "a favoured stat outweighs an ordinary one");
  ok(secondaryWeight("hands", "sta") > secondaryWeight("hands", hOff),
     "stamina keeps a floor even where it is not favoured — without it a full set lost ~7% EHP");
  ok(secondaryWeight("chest", "sta") > secondaryWeight("hands", "sta"), "…but it is still strongest where it IS favoured");
}

// --- the distribution players actually experience --------------------------------------------
{
  // Read the table rather than hardcoding pairs, so a retune cannot silently invalidate this.
  const share = (slot, keys) => { const d = dist(slot); return keys.reduce((a, k) => a + (d[k] || 0), 0); };
  for (const slot of ["hands", "chest", "weapon"]) {
    const fav = SLOT_SECONDARY[slot];
    const f = share(slot, fav);
    ok(f > 0.5 && f < 0.75, `${slot} rolls its favoured pair (${fav.join("/")}) ${(f * 100).toFixed(0)}% of the time`);
    const off = share(slot, SECONDARY_POOL.filter((k) => !fav.includes(k) && k !== "sta"));
    ok(off > 0.12, `…and an off-slot secondary still lands ${(off * 100).toFixed(0)}% of the time on ${slot}`);
  }
  ok(Object.keys(dist("hands")).length === SECONDARY_POOL.length, "every secondary remains reachable on every slot");

  // Two slots with disjoint identities must actually pull apart.
  const a = SLOT_SECONDARY.hands, b = SLOT_SECONDARY.chest;
  ok(!a.some((k) => b.includes(k)), "hands and chest favour completely different stats");
  ok(share("hands", a) > share("chest", a), "…and each slot rolls its OWN pair more than the other slot does");
}

// --- reroll semantics ------------------------------------------------------------------------
{
  // Exclude one of the slot's OWN favoured stats, table-driven so a retune cannot invalidate it.
  const [favA, favB] = SLOT_SECONDARY.hands;
  const d = dist("hands", [favA]);
  ok(!d[favA], "excluding the line's current stat means a paid reroll always changes something");
  ok(d[favB] > dist("hands")[favB], `…and the slot's other favoured stat (${favB}) picks up that weight`);

  const all = pickSlotSecondary("hands", SECONDARY_POOL);
  ok(all === null, "excluding everything returns null rather than throwing (the caller falls back)");

  // An unknown slot must still work — relics and anything added later.
  const u = dist("nonesuch", [], 6000);
  ok(Object.keys(u).length === SECONDARY_POOL.length, "a slot with no entry falls back to an even pool");
  ok(u.sta > u.leech, "…with stamina still favoured, matching the old global bias");
}

// --- drops carry the identity too ---------------------------------------------------------------
// The table is only worth having if it reaches DROPS. While it drove the reroll shop alone, a
// player could launder any slot into any stat and the identity never existed in practice.
{
  const secsOf = (it) => SECONDARY_POOL.filter((k) => (it.stats[k] || 0) > 0);
  const roll = (slot, n = 4000) => {
    const hit = {}; let lines = 0, dupes = 0;
    for (let i = 0; i < n; i++) {
      const it = generateItem(63, rarityById("epic"), slot, "warrior");
      const s = secsOf(it);
      lines += s.length;
      // A duplicate would be invisible: two lines of the same stat just sum in stats{}.
      if (new Set(s).size !== s.length) dupes++;
      for (const k of s) hit[k] = (hit[k] || 0) + 1;
    }
    for (const k in hit) hit[k] /= n;
    return { hit, lines: lines / n, dupes };
  };

  for (const slot of ["head", "weapon", "legs"]) {
    const { hit, dupes } = roll(slot);
    const fav = SLOT_SECONDARY[slot];
    const favRate = fav.reduce((a, k) => a + (hit[k] || 0), 0) / fav.length;
    const off = SECONDARY_POOL.filter((k) => !fav.includes(k) && k !== "sta");
    const offRate = off.reduce((a, k) => a + (hit[k] || 0), 0) / off.length;
    ok(favRate > offRate * 1.8,
       `${slot} drops carry its own pair (${fav.join("/")}) ${(favRate * 100).toFixed(0)}% of the time vs ${(offRate * 100).toFixed(0)}% for an off-stat`);
    ok(offRate > 0.05, `…and an off-stat still lands on ${(offRate * 100).toFixed(0)}% of ${slot} drops — no slot is a fixed template`);
    ok(dupes === 0, `${slot} never rolls the same secondary on two lines (a duplicate would silently just add up)`);
  }

  // Two slots must produce visibly different loot, which is the whole point.
  const h = roll("head").hit, l = roll("legs").hit;
  ok(h.crit > l.crit && l.sta > h.sta, "a helm reads as crit gear and legs read as stamina gear");

  // Identity decides WHICH stats roll, never how many — the rarity budget is untouched.
  const epic = roll("chest", 1500);
  ok(epic.lines >= 2.4 && epic.lines <= 3.05, `an epic chest still carries ~3 secondary lines (${epic.lines.toFixed(2)})`);
}

// --- identity must not be a stealth nerf ---------------------------------------------------------
// Stamina went from "biased on all ten slots" to "favoured on four", which on its own cut a full
// set's effective health by ~5%. SEC_SIZE.sta compensates. If someone retunes the table without
// re-measuring, this is the check that says so.
{
  ok(SEC_SIZE.sta > 1, `a stamina line rolls ${SEC_SIZE.sta}x an ordinary one, offsetting how much rarer stamina now is`);
  let hp = 0; const n = 300;
  for (let i = 0; i < n; i++) withRng(makeRng(1000 + i), () => { hp += maxHpFor(buildBotChar("warrior", "w_berserk", 60, 63)); });
  const avg = hp / n, WAS = 2332;   // measured on the commit before slot identity reached drops
  ok(Math.abs(avg / WAS - 1) < 0.02,
     `a full epic set is worth ${Math.round(avg)} hp, within 2% of the ${WAS} it was worth before slot identity`);
}

console.log(fail ? `\n❌ ${fail} slot-identity check(s) failed` : "\n✅ slot identity: two favoured per slot, off-stats reachable, drops and reroll share the table");
process.exit(fail ? 1 : 0);

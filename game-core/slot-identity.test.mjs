// Slot identity: which secondaries a slot leans toward, shared by drops and the reroll shop.
import { SLOT_SECONDARY, SECONDARY_POOL, secondaryWeight, pickSlotSecondary, LOOT_SLOTS } from "./combat.mjs";

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
  ok(secondaryWeight("hands", "vers") > secondaryWeight("hands", "leech"), "a favoured stat outweighs an ordinary one");
  ok(secondaryWeight("hands", "sta") > secondaryWeight("hands", "leech"),
     "stamina keeps a floor even where it is not favoured — without it a full set lost ~7% EHP");
  ok(secondaryWeight("chest", "sta") > secondaryWeight("hands", "sta"), "…but it is still strongest where it IS favoured");
}

// --- the distribution players actually experience --------------------------------------------
{
  const d = dist("hands");                       // favours vers + csd
  const favShare = d.vers + d.csd;
  ok(favShare > 0.6 && favShare < 0.75, `hands rolls its favoured pair ${(favShare * 100).toFixed(0)}% of the time`);
  const off = d.leech + d.resil + d.cdr;
  ok(off > 0.15, `…and an OFF-slot secondary still lands ${(off * 100).toFixed(0)}% of the time — a find, not an impossibility`);
  ok(Object.keys(d).length === SECONDARY_POOL.length, "every secondary remains reachable on every slot");

  const c = dist("chest");                       // favours sta + resil
  ok(c.sta + c.resil > 0.6, "chest leans defensive");
  ok(d.vers > c.vers && c.resil > d.resil, "hands and chest genuinely pull in different directions");
}

// --- reroll semantics ------------------------------------------------------------------------
{
  const d = dist("hands", ["vers"]);
  ok(!d.vers, "excluding the line's current stat means a paid reroll always changes something");
  ok(d.csd > 0.4, "…and the other favoured stat picks up that weight");

  const all = pickSlotSecondary("hands", SECONDARY_POOL);
  ok(all === null, "excluding everything returns null rather than throwing (the caller falls back)");

  // An unknown slot must still work — relics and anything added later.
  const u = dist("nonesuch", [], 6000);
  ok(Object.keys(u).length === SECONDARY_POOL.length, "a slot with no entry falls back to an even pool");
  ok(u.sta > u.leech, "…with stamina still favoured, matching the old global bias");
}

console.log(fail ? `\n❌ ${fail} slot-identity check(s) failed` : "\n✅ slot identity: two favoured per slot, off-stats reachable, reroll shares the table");
process.exit(fail ? 1 : 0);

// Slot scarcity: which slot a drop lands on is weighted, so the item players actually want is
// the one they have to chase. Every drop site used to pick uniformly.
import { pickLootSlot, SLOT_DROP_WEIGHT, LOOT_SLOTS } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const N = 120000;
const hit = {};
for (let i = 0; i < N; i++) { const s = pickLootSlot(); hit[s] = (hit[s] || 0) + 1; }
const share = (s) => (hit[s] || 0) / N;

// --- the table --------------------------------------------------------------------------------
{
  ok(LOOT_SLOTS.every((s) => (SLOT_DROP_WEIGHT[s.id] || 0) > 0), "every lootable slot has a drop weight");
  ok(Object.keys(SLOT_DROP_WEIGHT).length === LOOT_SLOTS.length, "…and the table has no entries for slots that cannot drop");
  ok(SLOT_DROP_WEIGHT.weapon === Math.min(...Object.values(SLOT_DROP_WEIGHT)),
     "the weapon is the rarest slot — it is worth ~3.7x an armour piece, so it cannot also be as common");
}

// --- what players actually see ----------------------------------------------------------------
{
  ok(share("weapon") > 0.03 && share("weapon") < 0.055,
     `a weapon is ${(share("weapon") * 100).toFixed(1)}% of drops — 1 in ${(1 / share("weapon")).toFixed(0)} (it was 1 in 10)`);
  ok(share("feet") > share("weapon") * 2.5, "filler slots really are filler: boots drop several times as often as weapons");
  for (const s of LOOT_SLOTS) ok(share(s.id) > 0.02, `${s.id} still drops (${(share(s.id) * 100).toFixed(1)}%) — no slot is unobtainable`);
  const total = LOOT_SLOTS.reduce((a, s) => a + share(s.id), 0);
  ok(Math.abs(total - 1) < 1e-9, "the weights are a distribution — every drop lands somewhere");
}

// --- the grind this creates --------------------------------------------------------------------
// The point of scarcity is the wait it produces, so measure the wait rather than trusting the
// weights to speak for themselves.
{
  const trials = 4000;
  let full = 0, wep = 0;
  for (let t = 0; t < trials; t++) {
    const seen = new Set(); let n = 0, w = 0;
    while (seen.size < LOOT_SLOTS.length) { const s = pickLootSlot(); n++; if (!w && s === "weapon") w = n; seen.add(s); }
    full += n; wep += w;
  }
  const drops = full / trials, weapon = wep / trials;
  // Uniform picking put these at 29.3 and 10.0 drops. At the measured ~18.2 items per 100 kills
  // that was ~161 and ~55 kills; the intent is a longer chase, not an unreachable one.
  ok(drops > 32 && drops < 45, `touching every slot once takes ${drops.toFixed(1)} drops, ~${Math.round(drops / 18.2 * 100)} kills (was 29.3 / ~161)`);
  ok(weapon > 18 && weapon < 32, `a first weapon takes ${weapon.toFixed(1)} drops, ~${Math.round(weapon / 18.2 * 100)} kills (was 10 / ~55)`);
}

// --- it stays deterministic --------------------------------------------------------------------
// Drops are rolled inside a seeded scope on the server; a picker reaching for Math.random would
// desync the authoritative sim from the client without any test noticing.
{
  const run = () => withRng(makeRng(31337), () => Array.from({ length: 40 }, () => pickLootSlot()).join(","));
  ok(run() === run(), "the same seed picks the same slots");
  const other = withRng(makeRng(4242), () => Array.from({ length: 40 }, () => pickLootSlot()).join(","));
  ok(run() !== other, "…and a different seed picks different ones");
}

console.log(fail ? `\n❌ ${fail} slot-scarcity check(s) failed` : "\n✅ slot scarcity: weapons are the chase, filler stays filler, nothing is unobtainable");
process.exit(fail ? 1 : 0);

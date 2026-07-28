// Rejected-intent and potion feedback. These rules decide what a player is TOLD when a tap
// does nothing, so they are worth pinning down without a browser or a server.
import { createEncounter, stepEncounter, intentRejection, potionRejection, buildBotChar,
         classResource, POTION_HEAL_FRAC } from "./combat.mjs";
import { withRng, makeRng } from "./rng.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

// buildBotChar rolls gear through the ambient rng, so an unseeded party differs every call and
// nothing built on it can be compared run to run. Build it ONCE under a fixed seed.
const PARTY = withRng(makeRng(31), () => [
  { char: buildBotChar("rogue", "r_ambush", 60, 66), role: "dps", isHuman: true },   // has a combo-point spender on its bar
  { char: buildBotChar("warrior", "w_prot", 60, 66), role: "tank" },
  { char: buildBotChar("paladin", "p_holy", 60, 66), role: "healer" },
  { char: buildBotChar("mage", "m_fire", 60, 66), role: "dps" },
]);
const mkEnc = () => createEncounter({ party: PARTY, boss: "ashen", seed: 4242 });
const human = (st) => st.allies.find((a) => a.isHuman);

// --- rejected intents ------------------------------------------------------------------------
{
  const st = mkEnc(); const me = human(st);
  ok(intentRejection(me, { skillName: me.char.selectedSkills[0] }, 0) === null,
     "a legal, affordable, ready skill is not rejected");

  const unknown = intentRejection(me, { skillName: "Fireball Supreme" }, 0);
  ok(unknown && unknown.code === "unknown" && /isn't on your bar/.test(unknown.text),
     `an unknown skill says so: "${unknown && unknown.text}"`);

  // put a real skill on cooldown
  const cdName = me.char.selectedSkills[0];
  me.bw.cooldowns[cdName] = 5000;
  const cd = intentRejection(me, { skillName: cdName }, 1000);
  ok(cd && cd.code === "cooldown" && /4s left/.test(cd.text), `cooldown reports the wait: "${cd && cd.text}"`);
  me.bw.cooldowns[cdName] = 0;

  // A spender tapped with an empty resource bar — the case that prompted this work. Not every
  // spec keeps one on its default bar (a Berserker's does not), hence the rogue above.
  const res = classResource(me.char.cls);
  const empty = { ...me, bw: { ...me.bw, resQ: [], cooldowns: {} } };
  const spendSkill = me.char.selectedSkills
    .map((n) => ({ name: n, rej: intentRejection(empty, { skillName: n }, 0) }))
    .find((x) => x.rej && x.rej.code === "resource");
  ok(!!spendSkill, "the test party has a resource spender on its bar (so the case is reachable)");
  if (spendSkill) {
    ok(spendSkill.rej.text.startsWith(`Not enough ${res.name}`),
       `an unaffordable spender names the resource: "${spendSkill.rej.text}"`);
    ok(/\(\d+\/\d+\)/.test(spendSkill.rej.text), "…and shows have/need numbers");
    ok(spendSkill.rej.skillName === spendSkill.name, "…and identifies which skill was refused");
  }

  const down = intentRejection({ ...me, down: true }, { skillName: cdName }, 0);
  ok(down && down.code === "down", "a downed player is told they are down, not that it's on cooldown");
  ok(intentRejection(me, { potion: true }, 0) === null, "a potion intent is not judged as a skill");
}

// --- potions ----------------------------------------------------------------------------------
{
  const st = mkEnc(); const me = human(st);
  me.hp = Math.round(me.maxHp * 0.4);
  ok(potionRejection(st, me) === null, "a hurt player below the cap may drink");

  const full = { ...me, hp: me.maxHp };
  ok(potionRejection(st, full)?.code === "fullhp", "at full health the potion is refused, not wasted");
  ok(potionRejection(st, { ...me, down: true })?.code === "down", "a downed player cannot drink");
  ok(potionRejection({ ...st, potionsUsed: st.potionCap }, me)?.code === "nopotions",
     "the per-fight cap is enforced by the encounter, not the client");
}

// --- the whole path through stepEncounter -------------------------------------------------------
{
  const st = mkEnc(); const me = human(st);
  me.hp = Math.round(me.maxHp * 0.3);
  const before = me.hp, used = st.potionsUsed;

  const after = stepEncounter(st, 120, { [me.id]: { potion: true } });
  const me2 = human(after);
  ok(after.potionsUsed === used + 1, "drinking spends one of the fight's charges");
  ok(me2.hp > before, `it actually heals (${before} → ${me2.hp})`);
  ok(Math.abs((me2.hp - before) - Math.round(me2.maxHp * POTION_HEAL_FRAC)) <= 1,
     `for ${POTION_HEAL_FRAC * 100}% of max HP`);
  ok(after.log.some((l) => /drinks a potion/.test(l)), "and the party log records it");
  ok((after.notices || []).length === 0, "a successful potion produces no complaint");

  // second potion past the cap → a notice, no heal
  const capped = stepEncounter({ ...after, potionsUsed: after.potionCap }, 120, { [me.id]: { potion: true } });
  ok((capped.notices || []).some((n) => n.code === "nopotions" && n.allyId === me.id),
     "past the cap the player is told why");

  // a forged skill → notice, and nothing queued
  const forged = stepEncounter(st, 120, { [me.id]: { skillName: "Not A Real Skill" } });
  ok((forged.notices || []).some((n) => n.code === "unknown"), "a forged skill name produces a notice");
  ok(!human(forged).pendingAction, "…and queues no action");

  // notices never leak from one tick into the next
  const nextTick = stepEncounter(forged, 120);
  ok((nextTick.notices || []).length === 0, "notices are cleared each tick, never re-delivered");
}

// --- determinism is unaffected -------------------------------------------------------------------
{
  const play = (potionAt) => {
    let s = mkEnc(), n = 0;
    while (!s.cleared && !s.wiped && n < 400) {
      const me = human(s);
      s = stepEncounter(s, 120, n === potionAt ? { [me.id]: { potion: true } } : undefined);
      n++;
    }
    return JSON.stringify({ n, hp: s.allies.map((a) => a.hp | 0), pots: s.potionsUsed });
  };
  ok(play(50) === play(50), "the same potion at the same tick replays byte-identically");
  ok(play(50) !== play(200), "a potion at a different tick changes the fight (it is real state)");
}

console.log(fail ? `\n❌ ${fail} feedback check(s) failed` : "\n✅ intent rejection + potion feedback");
process.exit(fail ? 1 : 0);

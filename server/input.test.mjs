// Stage 4 — player-driven combatants.
// Covers the trust boundary (an intent names a skill, it never carries one), the idle
// semantics of a human ally, and that inputs stay part of the reproducible tuple so a
// human-played fight replays exactly.
import { readFileSync } from "fs";
import { createRun, stepRun, runEncounter, verifyEncounter, indexTimeline, resolveIntent } from "./sim.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url), "utf8"));
// Seat 0 (the warrior tank) is the player; the rest stay AI.
const party = fixture.map((p, i) => ({ ...p, isHuman: i === 0 }));
const BOSS = "ashen", SEED = 12345;
const MY_SKILL = "Power Strike";          // in seat 0's selectedSkills
const NOT_MINE = "Flame Bolt";            // a real skill, but the mage's — not the warrior's

let failures = 0;
const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) failures++; };
const fresh = () => createRun({ party, boss: BOSS, seed: SEED });
const bossHp = (s) => s.enemies[0].hp;

// --- the trust boundary -------------------------------------------------------------
{
  const s = fresh();
  const me = s.allies[0];
  const now = s.elapsed;

  ok(resolveIntent(s, me, { skillName: MY_SKILL }, now) !== null, "an owned, ready skill resolves");
  ok(resolveIntent(s, me, { skillName: NOT_MINE }, now) === null, "a skill the character does not own is rejected");
  ok(resolveIntent(s, me, { skillName: "Kill Everything" }, now) === null, "an invented skill name is rejected");
  ok(resolveIntent(s, me, {}, now) === null, "an intent with no skillName is rejected");

  // The whole point of naming rather than sending: a forged skill object must not be usable.
  const forged = { skill: { name: "Power Strike", mult: 9999, hits: 99 }, skillName: undefined };
  ok(resolveIntent(s, me, forged, now) === null, "a forged skill OBJECT cannot be injected");
  const resolved = resolveIntent(s, me, { skillName: MY_SKILL }, now);
  ok(resolved.skill.mult !== 9999, "the resolved skill comes from the character's own loadout");
}

// --- human allies wait for input ----------------------------------------------------
{
  let idle = fresh();
  for (let i = 0; i < 12; i++) idle = stepRun(idle, 120);          // no inputs at all

  let acting = fresh();
  acting = stepRun(acting, 120, { a0: { skillName: MY_SKILL } });
  for (let i = 0; i < 11; i++) acting = stepRun(acting, 120);

  ok(bossHp(acting) < bossHp(idle), "a queued intent makes the player's combatant act");
  // A combatant only ever touches its own battle-world through applyAllyAction, so an
  // untouched bw.cooldowns proves the idle human never acted (rather than acted for zero).
  ok(Object.keys(idle.allies[0].bw.cooldowns).length === 0, "an idle human takes no action at all until they tap");
  ok(Object.keys(acting.allies[0].bw.cooldowns).length > 0, "the acting human's skill went on cooldown");
  // The AI party members still fight in both runs, so the boss takes damage either way —
  // the difference between the two runs is the player's contribution specifically.
  ok(bossHp(idle) > 0 && bossHp(idle) < idle.enemies[0].maxHp, "the idle run still progresses (AI allies keep fighting)");
}

// --- intents are dropped, not trusted, in a real step -------------------------------
{
  let a = fresh(), b = fresh();
  a = stepRun(a, 120, { a0: { skillName: NOT_MINE } });                  // not the warrior's skill
  b = stepRun(b, 120);                                                    // nothing at all
  ok(bossHp(a) === bossHp(b), "an unowned skill changes nothing vs. sending no intent");

  let c = fresh();
  c = stepRun(c, 120, { a1: { skillName: "Holy Strike" } });             // a1 is an AI ally
  let d = fresh();
  d = stepRun(d, 120);
  ok(bossHp(c) === bossHp(d), "intents aimed at an AI-controlled ally are ignored");
}

// --- determinism with inputs --------------------------------------------------------
{
  const script = [
    { tick: 0, allyId: "a0", skillName: MY_SKILL },
    { tick: 9, allyId: "a0", skillName: "Lacerate" },
    { tick: 20, allyId: "a0", skillName: MY_SKILL, target: { type: "enemy", id: "e0" } },
  ];
  const play = () => {
    const byTick = indexTimeline(script);
    let s = fresh(), steps = 0;
    while (!s.cleared && !s.wiped && steps < 6000) { s = stepRun(s, 120, byTick.get(s.tick)); steps++; }
    return { steps, hp: s.enemies.map((e) => Math.round(e.hp)), outcome: s.cleared ? "cleared" : "wiped" };
  };
  const r1 = play(), r2 = play();
  ok(r1.steps === r2.steps && JSON.stringify(r1.hp) === JSON.stringify(r2.hp), `same inputs + seed → identical fight (${r1.steps} steps, ${r1.outcome})`);

  // …and the offline replay path agrees with the live tick loop.
  const replay = runEncounter({ party, boss: BOSS, seed: SEED, timeline: script });
  ok(replay.steps === r1.steps, `replay via runEncounter matches the tick loop (${replay.steps} steps)`);

  const v = verifyEncounter({ party, boss: BOSS, seed: SEED, timeline: script, claimed: { outcome: replay.outcome, steps: replay.steps } });
  ok(v.valid, "validator accepts a truthful human-played result");

  const forgedClaim = verifyEncounter({ party, boss: BOSS, seed: SEED, timeline: script, claimed: { outcome: "cleared", steps: 3 } });
  ok(!forgedClaim.valid, "validator rejects a forged human-played result");

  // A replay that drops the player's inputs must NOT reproduce the same fight — otherwise
  // the timeline would be decorative and a player could rewrite their own actions.
  const without = runEncounter({ party, boss: BOSS, seed: SEED });
  ok(without.steps !== replay.steps || JSON.stringify(without.bossHp) !== JSON.stringify(replay.bossHp),
    "inputs genuinely affect the outcome (replay without them diverges)");
}

console.log(failures === 0
  ? "\n✅ stage 4 inputs: player-driven, cheat-resistant, and replay-validating"
  : `\n❌ ${failures} check(s) failed`);
process.exit(failures ? 1 : 0);

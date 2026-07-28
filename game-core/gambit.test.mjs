// Gambit condition tests. These live here because the evaluator is in the core — the gambit
// DATA is client-side, but "does this condition hold" is pure combat logic and worth testing
// without a browser.
import { gambitCondMet, executeThreshold, migrateGambitKeys, buildBotChar, classResource } from "./combat.mjs";

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const bar = ["Power Strike", "Lacerate", "Spinning Slash", "Devastating Blow", "Concussive Blow"];
const mkCtx = (over = {}) => {
  const char = buildBotChar("warrior", "w_berserk", 60, 66);
  char.spec = "w_berserk"; char.selectedSkills = bar;
  const ri = classResource(char.cls);
  return {
    char, now: 1000, maxHp: 1000, buffs: {}, slotSkills: bar,
    w: { hp: 1000, enemy: { hp: 100, maxHp: 100 }, playerEffects: [], cooldowns: {}, res: 0, resQ: [], _max: ri.max, ...over },
    ...over.ctx,
  };
};
const met = (id, over) => gambitCondMet(id, mkCtx(over));

// --- execute range is per-spec, from that spec's own talents -----------------------------
{
  const t = (cls, spec) => { const c = buildBotChar(cls, spec, 60, 66); c.spec = spec; return executeThreshold(c); };
  ok(Math.abs(t("rogue", "r_ambush") - 0.20) < 1e-9, "Assassin executes at 20% (its talents say below 20%)");
  ok(Math.abs(t("paladin", "p_exile") - 0.30) < 1e-9, "Exile executes at 30%");
  ok(Math.abs(t("warrior", "w_berserk") - 0.35) < 1e-9, "Berserker executes at 35%, not the 50% single-skill talent");
  ok(t("warrior", "w_prot") > 0, "a spec with no execute talent still returns a usable default");

  const ctx = mkCtx(); ctx.w.enemy.hp = 30;                       // 30% of 100
  ok(gambitCondMet("if_execute", ctx) === true, "Berserker at 30% target HP IS in execute range (<=35%)");
  ctx.w.enemy.hp = 40;
  ok(gambitCondMet("if_execute", ctx) === false, "Berserker at 40% target HP is NOT");
}

// --- class resource ------------------------------------------------------------------------
{
  const max = classResource("warrior").max || 100;
  // Resource lives in a decaying queue (resTotal sums resQ), not a plain number.
  const at = (v) => { const c = mkCtx(); c.w.resQ = v > 0 ? [{ amt: v, exp: 1e9 }] : []; return c; };
  ok(gambitCondMet("if_resfull", at(max)) === true, `resource full fires at ${max}/${max}`);
  ok(gambitCondMet("if_resfull", at(max * 0.9)) === false, "resource full does not fire at 90%");
  ok(gambitCondMet("if_res80", at(max * 0.85)) === true, "resource >= 80% fires at 85%");
  ok(gambitCondMet("if_res80", at(max * 0.5)) === false, "resource >= 80% does not fire at 50%");
  ok(gambitCondMet("if_res50", at(max * 0.4)) === true, "resource < 50% fires at 40%");
  ok(gambitCondMet("if_res50", at(max * 0.6)) === false, "resource < 50% does not fire at 60%");
  ok(gambitCondMet("if_res20", at(max * 0.1)) === true, "resource < 20% fires at 10%");
  ok(gambitCondMet("if_res20", at(max * 0.3)) === false, "resource < 20% does not fire at 30%");
}

// --- skill slot cooldowns --------------------------------------------------------------------
{
  const c = mkCtx();
  c.w.cooldowns = { "Lacerate": 5000 };                            // slot 2 on cooldown, now = 1000
  ok(gambitCondMet("if_sk2_cd", c) === true, "Skill 2 on cooldown fires while Lacerate is cooling");
  ok(gambitCondMet("if_sk2_rdy", c) === false, "Skill 2 off cooldown does not fire at the same time");
  ok(gambitCondMet("if_sk1_cd", c) === false, "Skill 1 on cooldown does not fire — Power Strike is ready");
  ok(gambitCondMet("if_sk1_rdy", c) === true, "Skill 1 off cooldown fires");

  // an empty slot is neither ready nor cooling, so neither condition should misfire
  const e = mkCtx(); e.slotSkills = ["Power Strike"];
  ok(gambitCondMet("if_sk4_cd", e) === false && gambitCondMet("if_sk4_rdy", e) === false,
     "an empty slot fires neither on- nor off-cooldown");

  // the point of slot keys: swap the ability and the rule still describes that position
  const sw = mkCtx(); sw.slotSkills = ["Concussive Blow", ...bar.slice(1)]; sw.w.cooldowns = { "Concussive Blow": 5000 };
  ok(gambitCondMet("if_sk1_cd", sw) === true, "slot conditions follow the POSITION, not the skill name");
}

// --- existing conditions still behave --------------------------------------------------------
{
  ok(met("if_always") === true, "if_always still true");
  const c = mkCtx(); c.w.enemy.hp = 15;
  ok(gambitCondMet("if_ehp20", c) === true, "target HP <= 20% still fires");
  const h = mkCtx(); h.w.hp = 200;
  ok(gambitCondMet("if_selfhp30", h) === true, "your HP <= 30% still fires");
  ok(met("if_nonsense_id") === false, "an unknown condition id is false, never a crash");
}

// --- save migration ---------------------------------------------------------------------------
{
  const oldRules = { "Lacerate": [{ if: "if_always", then: "x" }], "Gone From Bar": [{ if: "a", then: "b" }] };
  const m1 = migrateGambitKeys(oldRules, bar);
  ok(JSON.stringify(m1) === JSON.stringify({ "2": [{ if: "if_always", then: "x" }] }),
     "skill-name keys migrate to slot positions, dropping skills no longer on the bar");
  ok(JSON.stringify(migrateGambitKeys(m1, bar)) === JSON.stringify(m1), "migration is idempotent");
}

console.log(fail ? `\n❌ ${fail} gambit check(s) failed` : "\n✅ gambit conditions: execute range, resources, slot cooldowns and migration");
process.exit(fail ? 1 : 0);
